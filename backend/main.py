from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bson import ObjectId
from pymongo import MongoClient
from pymilvus import connections, Collection
from sentence_transformers import SentenceTransformer
from article_utils import normalize_for_embedding, KNOWN_SOURCES, DOMAIN_SOURCE_RULES, similarity_label
import cache
from import_meta import last_import_for_api, import_status_for_api
from config import MONGO_URL, MILVUS_HOST, MILVUS_PORT

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

mongo = MongoClient(MONGO_URL)
db = mongo["newsarchiv"]
articles_col = db["articles"]
meta_col = db["meta"]

connections.connect(host=MILVUS_HOST, port=MILVUS_PORT)
milvus_col = Collection("news_embeddings")
milvus_col.load()

model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

DE_FILTER = {"language": "de", "hidden": {"$ne": True}}
LIST_FILTER = {**DE_FILTER, "is_canonical": {"$ne": False}}

SORT_OPTIONS = {
    "newest": [("published_at", -1)],
    "oldest": [("published_at", 1)],
    "title_asc": [("title", 1)],
    "title_desc": [("title", -1)],
    "source": [("source", 1), ("published_at", -1)],
}

TTL_ARTICLES = 300
TTL_STATS = 120
TTL_SEARCH = 600
TTL_INSIGHTS = 180


def _image_host_allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    if not host:
        return False
    for domain, _ in DOMAIN_SOURCE_RULES:
        if host == domain or host.endswith("." + domain):
            return True
    extra = (
        "heise.cloud", "heise.cloudimg.io", "cloudimg.io",
        "img.zeit.de", "faz.net", "media0.faz.net", "sz-cdn.de",
        "cdn.prod.www.spiegel.de", "taz.de", "static.zeit.de",
    )
    for domain in extra:
        if host == domain or host.endswith("." + domain):
            return True
    return False


def _proxied_image(url: str) -> Response:
    if not _image_host_allowed(url):
        raise HTTPException(status_code=400, detail="Bild-URL nicht erlaubt")
    try:
        resp = requests.get(
            url,
            timeout=12,
            headers={"User-Agent": "NewsArchiv/1.0", "Accept": "image/*"},
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Bild konnte nicht geladen werden") from exc
    media_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
    if not media_type.startswith("image/"):
        raise HTTPException(status_code=502, detail="Keine Bilddatei")
    return Response(content=resp.content, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})


def _cached(response: Response, key: str, ttl: int, fetch):
    cached = cache.get_json(key)
    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        return cached
    data = fetch()
    cache.set_json(key, data, ttl)
    response.headers["X-Cache"] = "MISS"
    return data


def _apply_filters(base: dict, source: str | None, category: str | None, days: int | None) -> dict:
    filt = {**base}
    if source:
        filt["source"] = source
    if category:
        filt["$or"] = [{"category": category}, {"categories": category}]
    if days and days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        filt["published_at"] = {"$gte": cutoff}
    return filt


def _article_categories(doc: dict) -> list[str]:
    cats = doc.get("categories")
    if isinstance(cats, list) and cats:
        return cats
    if doc.get("category"):
        return [doc["category"]]
    return []


class SearchQuery(BaseModel):
    query: str
    limit: int = 7
    offset: int = 0
    source: str | None = None
    category: str | None = None
    days: int | None = None


def _fetch_articles(limit: int, skip: int, source: str | None, category: str | None, sort: str, days: int | None):
    filt = _apply_filters(LIST_FILTER, source, category, days)
    sort_key = sort if sort in SORT_OPTIONS else "newest"
    total = articles_col.count_documents(filt)
    docs = list(
        articles_col.find(filt, {"_id": 0})
        .sort(SORT_OPTIONS[sort_key])
        .skip(skip)
        .limit(limit)
    )
    return {"items": docs, "total": total, "sort": sort_key}


def _stories_match(source: str | None, category: str | None, days: int | None) -> dict:
    filt = _apply_filters(LIST_FILTER, None if source else source, category, days)
    filt["cluster_size"] = {"$gte": 2}
    if source:
        cluster_ids = articles_col.distinct(
            "story_cluster_id",
            {**DE_FILTER, "source": source, "story_cluster_id": {"$ne": None}},
        )
        filt["story_cluster_id"] = {"$in": cluster_ids}
    return filt


def _stories_lookup_stages():
    return [
        {
            "$lookup": {
                "from": "articles",
                "let": {"cid": "$story_cluster_id"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$ne": ["$$cid", None]},
                                    {"$eq": ["$story_cluster_id", "$$cid"]},
                                    {"$ne": ["$hidden", True]},
                                ]
                            }
                        }
                    },
                    {"$group": {"_id": None, "sources": {"$addToSet": "$source"}}},
                ],
                "as": "cluster_meta",
            }
        },
        {
            "$addFields": {
                "sources": {
                    "$ifNull": [
                        {"$arrayElemAt": ["$cluster_meta.sources", 0]},
                        ["$source"],
                    ]
                }
            }
        },
        {"$match": {"$expr": {"$gte": [{"$size": "$sources"}, 2]}}},
        {"$project": {"cluster_meta": 0, "_id": 0}},
    ]


def _fetch_stories(limit: int, skip: int, source: str | None, category: str | None, sort: str, days: int | None):
    filt = _stories_match(source, category, days)
    sort_key = sort if sort in SORT_OPTIONS else "newest"
    count_result = list(articles_col.aggregate([
        {"$match": filt},
        *_stories_lookup_stages(),
        {"$count": "total"},
    ]))
    total = count_result[0]["total"] if count_result else 0
    docs = list(articles_col.aggregate([
        {"$match": filt},
        *_stories_lookup_stages(),
        {"$sort": dict(SORT_OPTIONS[sort_key])},
        {"$skip": skip},
        {"$limit": limit},
    ]))
    return {"items": docs, "total": total, "sort": sort_key}


def _fetch_article_by_id(url_id: str):
    doc = articles_col.find_one({**DE_FILTER, "url_id": url_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    return doc


def _fetch_related(url_id: str, limit: int = 4):
    doc = articles_col.find_one(
        {**DE_FILTER, "url_id": url_id},
        {"_id": 0, "title": 1, "body": 1, "url_id": 1, "story_cluster_id": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    cluster_id = doc.get("story_cluster_id")
    query = normalize_for_embedding(f"{doc.get('title', '')}. {doc.get('body', '')}")
    vec = model.encode(query).tolist()
    hits = milvus_col.search(
        data=[vec],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"nprobe": 10}},
        limit=limit + 8,
        output_fields=["mongo_id"],
    )
    results = []
    for hit in hits[0]:
        related = articles_col.find_one(
            {"_id": ObjectId(hit.entity.get("mongo_id")), **LIST_FILTER},
            {"_id": 0},
        )
        if not related or related.get("url_id") == url_id:
            continue
        if cluster_id and related.get("story_cluster_id") == cluster_id:
            continue
        score = round(float(hit.distance), 4)
        related["score"] = score
        related["similarity"] = similarity_label(score)
        results.append(related)
        if len(results) >= limit:
            break
    return results


def _fetch_story_cluster(cluster_id: str):
    docs = list(
        articles_col.find(
            {"language": "de", "story_cluster_id": cluster_id},
            {"_id": 0},
        ).sort([("is_canonical", -1), ("published_at", -1)])
    )
    if not docs:
        raise HTTPException(status_code=404, detail="Story nicht gefunden")
    return docs


def _fetch_stats():
    count = articles_col.count_documents(LIST_FILTER)
    by_source = {
        row["_id"]: row["count"]
        for row in articles_col.aggregate([
            {"$match": {**LIST_FILTER, "source": {"$in": list(KNOWN_SOURCES)}}},
            {"$group": {"_id": "$source", "count": {"$sum": 1}}},
        ])
    }
    by_category = {
        row["_id"]: row["count"]
        for row in articles_col.aggregate([
            {"$match": LIST_FILTER},
            {"$project": {"cats": {"$ifNull": ["$categories", {"$cond": [{"$ifNull": ["$category", False]}, ["$category"], []]}]}}},
            {"$unwind": "$cats"},
            {"$group": {"_id": "$cats", "count": {"$sum": 1}}},
        ])
    }
    return {
        "count": count,
        "last_import": last_import_for_api(meta_col),
        "by_source": by_source,
        "by_category": by_category,
    }


def _fetch_timeline(days: int):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {**LIST_FILTER, "published_at": {"$gte": cutoff}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$published_at"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    return [{"date": row["_id"], "count": row["count"]} for row in articles_col.aggregate(pipeline)]


def _fetch_by_source(days: int):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {**LIST_FILTER, "published_at": {"$gte": cutoff}, "source": {"$in": list(KNOWN_SOURCES)}}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    return [{"source": row["_id"], "count": row["count"]} for row in articles_col.aggregate(pipeline)]


def _fetch_trending_categories():
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    two_weeks = now - timedelta(days=14)

    def counts_since(since):
        return {
            row["_id"]: row["count"]
            for row in articles_col.aggregate([
                {"$match": {**LIST_FILTER, "published_at": {"$gte": since}}},
                {"$project": {"cats": {"$ifNull": ["$categories", {"$cond": [{"$ifNull": ["$category", False]}, ["$category"], []]}]}}},
                {"$unwind": "$cats"},
                {"$group": {"_id": "$cats", "count": {"$sum": 1}}},
            ])
        }

    current = counts_since(week_ago)
    previous = counts_since(two_weeks)
    rows = []
    for cat, count in sorted(current.items(), key=lambda x: -x[1])[:8]:
        prev = previous.get(cat, 0)
        rows.append({"category": cat, "count": count, "delta": count - prev})
    return rows


def _fetch_keyword_search(query: str, limit: int, offset: int, source: str | None, category: str | None, days: int | None):
    filt = _apply_filters({"$text": {"$search": query}, **LIST_FILTER}, source, category, days)
    return list(
        articles_col.find(filt, {"_id": 0, "score": {"$meta": "textScore"}})
        .sort([("score", {"$meta": "textScore"})])
        .skip(offset)
        .limit(limit)
    )


def _doc_matches_filters(doc: dict, source: str | None, category: str | None, days: int | None) -> bool:
    if doc.get("is_canonical") is False:
        return False
    if source and doc.get("source") != source:
        return False
    if category and category not in _article_categories(doc):
        return False
    if days and days > 0:
        pub = doc.get("published_at")
        if not pub:
            return False
        if pub.tzinfo is None:
            pub = pub.replace(tzinfo=timezone.utc)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        if pub < cutoff:
            return False
    return True


def _fetch_semantic_search(query: str, limit: int, offset: int, source: str | None, category: str | None, days: int | None):
    vec = model.encode(normalize_for_embedding(query)).tolist()
    need = offset + limit
    fetch_limit = min(256, max(need * 4, 32))
    hits = milvus_col.search(
        data=[vec],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"nprobe": 10}},
        limit=fetch_limit,
        output_fields=["mongo_id", "title"],
    )
    filtered = []
    for hit in hits[0]:
        doc = articles_col.find_one(
            {"_id": ObjectId(hit.entity.get("mongo_id")), **DE_FILTER},
            {"_id": 0},
        )
        if not doc:
            continue
        if not _doc_matches_filters(doc, source, category, days):
            continue
        doc["score"] = round(hit.distance, 4)
        doc["similarity"] = similarity_label(hit.distance)
        filtered.append(doc)
        if len(filtered) >= need:
            break
    return filtered[offset:offset + limit]


def _search_cache_key(prefix: str, body: SearchQuery) -> str:
    return cache.make_key(
        prefix,
        query=normalize_for_embedding(body.query),
        limit=body.limit,
        offset=body.offset,
        source=body.source,
        category=body.category,
        days=body.days,
    )


@app.get("/api/articles")
def get_articles(
    response: Response,
    limit: int = 20,
    skip: int = 0,
    source: str = None,
    category: str = None,
    sort: str = "newest",
    days: int = None,
):
    key = cache.make_key("articles", limit=limit, skip=skip, source=source, category=category, sort=sort, days=days)
    return _cached(response, key, TTL_ARTICLES, lambda: _fetch_articles(limit, skip, source, category, sort, days))


@app.get("/api/articles/{url_id}/related")
def get_article_related(url_id: str, response: Response, limit: int = 4):
    key = cache.make_key("related", url_id=url_id, limit=limit)
    return _cached(response, key, TTL_SEARCH, lambda: _fetch_related(url_id, limit))


@app.get("/api/articles/{url_id}")
def get_article(url_id: str, response: Response):
    key = cache.make_key("article", url_id=url_id)
    return _cached(response, key, TTL_ARTICLES, lambda: _fetch_article_by_id(url_id))


@app.get("/api/image")
def get_image(url: str):
    return _proxied_image(url)


@app.get("/api/stories")
def list_stories(
    response: Response,
    limit: int = 20,
    skip: int = 0,
    source: str = None,
    category: str = None,
    sort: str = "newest",
    days: int = None,
):
    key = cache.make_key("stories_list", limit=limit, skip=skip, source=source, category=category, sort=sort, days=days)
    return _cached(response, key, TTL_ARTICLES, lambda: _fetch_stories(limit, skip, source, category, sort, days))


@app.get("/api/stories/{cluster_id}")
def get_story(cluster_id: str, response: Response):
    key = cache.make_key("story", cluster_id=cluster_id)
    return _cached(response, key, TTL_ARTICLES, lambda: _fetch_story_cluster(cluster_id))


@app.get("/api/stats")
def get_stats(response: Response):
    key = cache.make_key("stats")
    return _cached(response, key, TTL_STATS, _fetch_stats)


@app.get("/api/insights/timeline")
def insights_timeline(response: Response, days: int = 30):
    key = cache.make_key("insights_timeline", days=days)
    return _cached(response, key, TTL_INSIGHTS, lambda: _fetch_timeline(days))


@app.get("/api/insights/by-source")
def insights_by_source(response: Response, days: int = 30):
    key = cache.make_key("insights_source", days=days)
    return _cached(response, key, TTL_INSIGHTS, lambda: _fetch_by_source(days))


@app.get("/api/insights/trending-categories")
def insights_trending(response: Response):
    key = cache.make_key("insights_trending")
    return _cached(response, key, TTL_INSIGHTS, _fetch_trending_categories)


@app.get("/api/insights/import-status")
def insights_import_status(response: Response):
    key = cache.make_key("insights_import")
    return _cached(response, key, TTL_INSIGHTS, lambda: import_status_for_api(meta_col) or {})


@app.post("/api/search/keyword")
def search_keyword(response: Response, body: SearchQuery):
    key = _search_cache_key("search_kw", body)
    return _cached(
        response,
        key,
        TTL_SEARCH,
        lambda: _fetch_keyword_search(body.query, body.limit, body.offset, body.source, body.category, body.days),
    )


@app.post("/api/search/semantic")
def search_semantic(response: Response, body: SearchQuery):
    key = _search_cache_key("search_sem", body)
    return _cached(
        response,
        key,
        TTL_SEARCH,
        lambda: _fetch_semantic_search(body.query, body.limit, body.offset, body.source, body.category, body.days),
    )
