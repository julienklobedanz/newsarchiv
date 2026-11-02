import hashlib
import os
import feedparser
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient
from pymilvus import connections, Collection
from sentence_transformers import SentenceTransformer
from bson import ObjectId
from article_utils import (
    clean_html,
    is_german,
    categorize,
    primary_category,
    parse_date,
    normalize_for_embedding,
    resolve_newsapi_source,
    extract_rss_image,
    NEWSAPI_DOMAINS,
)
import cache
from duplicate_utils import find_story_cluster_match
from import_meta import get_last_import_at, record_import
from config import MONGO_URL, MILVUS_HOST, MILVUS_PORT

load_dotenv()

DE_FILTER = {"language": "de", "hidden": {"$ne": True}}

mongo = MongoClient(MONGO_URL)
db = mongo["newsarchiv"]
articles_col = db["articles"]
meta_col = db["meta"]

connections.connect(host=MILVUS_HOST, port=MILVUS_PORT)
milvus_col = Collection("news_embeddings")

model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

FEEDS = [
    {"url": "https://www.spiegel.de/schlagzeilen/tops/index.rss",  "source": "spiegel"},
    {"url": "https://www.spiegel.de/wissenschaft/index.rss",       "source": "spiegel"},
    {"url": "https://www.spiegel.de/wirtschaft/index.rss",         "source": "spiegel"},
    {"url": "https://taz.de/!p4608;rss/",                            "source": "taz"},
    {"url": "https://www.zeit.de/index.rss",                         "source": "zeit"},
    {"url": "https://www.faz.net/rss/aktuell/",                      "source": "faz"},
    {"url": "https://www.heise.de/rss/heise-atom.xml",               "source": "heise"},
    {"url": "https://rss.sueddeutsche.de/rss/Topthemen",           "source": "sz"},
    {"url": "https://rss.sueddeutsche.de/rss/Politik",             "source": "sz"},
    {"url": "https://rss.sueddeutsche.de/rss/Wirtschaft",          "source": "sz"},
    {"url": "https://rss.sueddeutsche.de/rss/Sport",               "source": "sz"},
    {"url": "https://rss.sueddeutsche.de/rss/Panorama",            "source": "sz"},
]

NEWSAPI_TOPICS = [
    {"query": "Klimawandel",              "language": "de"},
    {"query": "künstliche Intelligenz",   "language": "de"},
    {"query": "Wirtschaft",               "language": "de"},
    {"query": "Politik Deutschland",      "language": "de"},
    {"query": "Wissenschaft",             "language": "de"},
]


def url_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def cluster_id_for(mongo_id: str) -> str:
    return hashlib.sha256(mongo_id.encode()).hexdigest()[:16]


def already_exists(url_id: str) -> bool:
    return articles_col.find_one({"url_id": url_id}) is not None


def patch_article_media(url_id: str, image_url: str | None = None, author: str | None = None) -> bool:
    """Ergänzt fehlende Bild-URL/Autor bei bereits importierten Artikeln."""
    if not image_url and not author:
        return False
    doc = articles_col.find_one({"url_id": url_id}, {"image_url": 1, "author": 1})
    if not doc:
        return False
    updates = {}
    if image_url and not doc.get("image_url"):
        updates["image_url"] = image_url
    if author and not doc.get("author"):
        updates["author"] = author
    if not updates:
        return False
    articles_col.update_one({"url_id": url_id}, {"$set": updates})
    return True


def _ensure_canonical_cluster(canonical_mongo_id: str) -> str:
    canonical_oid = ObjectId(canonical_mongo_id)
    doc = articles_col.find_one({"_id": canonical_oid}, {"story_cluster_id": 1, "cluster_size": 1})
    if not doc:
        return cluster_id_for(canonical_mongo_id)
    cid = doc.get("story_cluster_id")
    if not cid:
        cid = cluster_id_for(canonical_mongo_id)
        articles_col.update_one(
            {"_id": canonical_oid},
            {"$set": {"story_cluster_id": cid, "is_canonical": True, "cluster_size": doc.get("cluster_size", 1)}},
        )
    return cid


def import_article(
    url: str,
    source: str,
    title: str,
    body: str,
    date: str,
    ingest: str,
    feed_tags: list[str] | None = None,
    image_url: str | None = None,
    author: str | None = None,
) -> bool:
    if not url:
        return False

    body = clean_html(body)
    if not is_german(title, body):
        return False

    url_id = url_hash(url)
    if already_exists(url_id):
        return False

    categories = categorize(title, body, source, feed_tags)
    text_to_embed = normalize_for_embedding(f"{title}. {body}")
    embedding = model.encode(text_to_embed).tolist()
    duplicate_of = find_story_cluster_match(embedding, source, milvus_col, articles_col)

    base_doc = {
        "url_id": url_id,
        "url": url,
        "source": source,
        "title": title,
        "body": body,
        "date": date,
        "published_at": parse_date(date),
        "language": "de",
        "categories": categories,
        "category": primary_category(categories),
        "ingest": ingest,
    }
    if image_url:
        base_doc["image_url"] = image_url
    if author:
        base_doc["author"] = author

    if duplicate_of:
        cluster_id = _ensure_canonical_cluster(duplicate_of)
        base_doc.update({
            "story_cluster_id": cluster_id,
            "duplicate_of": duplicate_of,
            "is_canonical": False,
            "cluster_size": 1,
        })
        print(f"    ~ Story-Cluster [{source}] {title[:50]}")
    else:
        base_doc.update({
            "is_canonical": True,
            "cluster_size": 1,
        })

    result = articles_col.insert_one(base_doc)
    mongo_id = str(result.inserted_id)

    if duplicate_of:
        articles_col.update_one(
            {"_id": ObjectId(duplicate_of)},
            {"$inc": {"cluster_size": 1}},
        )
        canonical = articles_col.find_one({"_id": ObjectId(duplicate_of)}, {"cluster_size": 1})
        if canonical:
            articles_col.update_one(
                {"_id": result.inserted_id},
                {"$set": {"cluster_size": canonical.get("cluster_size", 1)}},
            )
    else:
        articles_col.update_one(
            {"_id": result.inserted_id},
            {"$set": {"story_cluster_id": cluster_id_for(mongo_id)}},
        )

    milvus_col.insert([[mongo_id], [title[:200]], [embedding]])
    return True


def _import_since() -> datetime | None:
    since = get_last_import_at(meta_col)
    if since is not None:
        return since
    now = datetime.now(timezone.utc)
    latest = articles_col.find_one(
        {**DE_FILTER, "published_at": {"$lte": now}},
        {"published_at": 1},
        sort=[("published_at", -1)],
    )
    return latest.get("published_at") if latest else None


def _is_after_since(date_str: str, since: datetime | None) -> bool:
    if since is None:
        return True
    published = parse_date(date_str)
    if published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)
    since_cmp = since if since.tzinfo else since.replace(tzinfo=timezone.utc)
    return published >= since_cmp


def collect_rss(since: datetime | None = None) -> int:
    total_new = 0

    for feed_cfg in FEEDS:
        print(f"  Abrufe: {feed_cfg['source']} ({feed_cfg['url'][:50]}...) ...")
        feed = feedparser.parse(feed_cfg["url"])

        for entry in feed.entries:
            url = getattr(entry, "link", "")
            title = getattr(entry, "title", "")
            summary = getattr(entry, "summary", "")
            date = getattr(entry, "published", datetime.now(timezone.utc).isoformat())
            feed_tags = [t.get("term", "") for t in getattr(entry, "tags", [])]
            image_url = extract_rss_image(entry)
            author = getattr(entry, "author", None) or None
            url_id = url_hash(url)

            if not _is_after_since(date, since):
                if already_exists(url_id):
                    patch_article_media(url_id, image_url, author)
                continue

            if already_exists(url_id):
                if patch_article_media(url_id, image_url, author):
                    print(f"    ~ Bild ergänzt [{feed_cfg['source']}] {title[:50]}")
                continue

            if import_article(url, feed_cfg["source"], title, summary, date, "rss", feed_tags, image_url, author):
                total_new += 1
                print(f"    + [{feed_cfg['source']}] {title[:60]}")

    return total_new


def collect_newsapi(api_key: str, since: datetime | None = None) -> int:
    total_new = 0
    now = datetime.now(timezone.utc)

    for topic in NEWSAPI_TOPICS:
        print(f"  NewsAPI: „{topic['query']}“ ({topic['language']}) ...")
        params = {
            "q": topic["query"],
            "language": topic["language"],
            "domains": NEWSAPI_DOMAINS,
            "pageSize": 100,
            "apiKey": api_key,
            "to": now.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        if since:
            params["from"] = since.strftime("%Y-%m-%dT%H:%M:%S")

        resp = requests.get("https://newsapi.org/v2/everything", params=params, timeout=30)
        data = resp.json()

        if data.get("status") != "ok":
            print(f"    Fehler: {data.get('message', data)}")
            continue

        for article in data.get("articles", []):
            url = article.get("url") or ""
            if not url or "removed" in url:
                continue

            title = article.get("title") or ""
            body = article.get("description") or article.get("content") or ""
            date = article.get("publishedAt") or datetime.now(timezone.utc).isoformat()
            source = resolve_newsapi_source(article)
            if not source:
                continue

            image_url = article.get("urlToImage") or None
            author = article.get("author") or None
            url_id = url_hash(url)

            if not _is_after_since(date, since):
                if already_exists(url_id) and patch_article_media(url_id, image_url, author):
                    pass
                continue

            if already_exists(url_id):
                patch_article_media(url_id, image_url, author)
                continue

            if import_article(url, source, title, body, date, "api", None, image_url, author):
                total_new += 1
                print(f"    + [{source}] {title[:60]}")

    return total_new


if __name__ == "__main__":
    since = _import_since()
    if since:
        print(f"Import ab: {since.isoformat()}")

    print("── RSS-Feeds ──")
    rss_new = collect_rss(since)
    total_new = rss_new

    api_key = os.getenv("NEWSAPI_KEY")
    api_new = 0
    if api_key:
        print("\n── NewsAPI ──")
        api_new = collect_newsapi(api_key, since)
        total_new += api_new
    else:
        print("\nNewsAPI übersprungen (NEWSAPI_KEY nicht in .env gesetzt)")

    milvus_col.flush()

    deleted = cache.invalidate_all()
    print(f"Redis-Cache geleert ({deleted} Keys)")

    imported_at = record_import(meta_col, total_new, rss_new, api_new)
    print(f"Letzter Import gespeichert: {imported_at.isoformat()}")

    print(f"\nFertig — {total_new} neue Artikel importiert.")
    print(f"Gesamt in MongoDB (deutsch): {articles_col.count_documents({'language': 'de'})}")
