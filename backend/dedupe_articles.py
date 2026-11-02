"""Bestandsdaten: semantisch ähnliche Artikel als Story-Cluster (ohne hidden)."""
import hashlib

from bson import ObjectId
from pymongo import MongoClient
from pymilvus import connections, Collection
from sentence_transformers import SentenceTransformer

import cache
from article_utils import normalize_for_embedding
from duplicate_utils import find_story_cluster_match
from config import MONGO_URL, MILVUS_HOST, MILVUS_PORT

mongo = MongoClient(MONGO_URL)
articles_col = mongo["newsarchiv"]["articles"]

connections.connect(host=MILVUS_HOST, port=MILVUS_PORT)
milvus_col = Collection("news_embeddings")
milvus_col.load()

model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

DE_FILTER = {"language": "de", "hidden": {"$ne": True}}


def cluster_id_for(mongo_id: str) -> str:
    return hashlib.sha256(mongo_id.encode()).hexdigest()[:16]


def sync_cluster_sizes():
    """cluster_size und Kanonisch-Status aus tatsächlichen Mitgliedern ableiten."""
    clusters = articles_col.aggregate([
        {"$match": {"language": "de", "story_cluster_id": {"$ne": None}}},
        {"$sort": {"published_at": 1}},
        {
            "$group": {
                "_id": "$story_cluster_id",
                "count": {"$sum": 1},
                "members": {"$push": {"id": "$_id", "published_at": "$published_at"}},
            }
        },
    ])
    updated = 0
    for cluster in clusters:
        cid = cluster["_id"]
        count = cluster["count"]
        members = sorted(cluster["members"], key=lambda m: m.get("published_at") or "")
        canonical_id = members[0]["id"]
        for member in members:
            is_canonical = member["id"] == canonical_id
            articles_col.update_one(
                {"_id": member["id"]},
                {
                    "$set": {
                        "is_canonical": is_canonical,
                        "cluster_size": count,
                        "story_cluster_id": cid,
                        **({} if is_canonical else {"duplicate_of": str(canonical_id)}),
                    },
                    **({"$unset": {"duplicate_of": ""}} if is_canonical else {}),
                },
            )
            updated += 1
    return updated


def dedupe():
    clustered = 0
    articles = list(
        articles_col.find(
            DE_FILTER,
            {"_id": 1, "title": 1, "body": 1, "published_at": 1, "source": 1},
        ).sort([("published_at", 1)])
    )

    for doc in articles:
        mongo_id = str(doc["_id"])
        if doc.get("is_canonical") is False and doc.get("duplicate_of"):
            continue

        text = normalize_for_embedding(f"{doc.get('title', '')}. {doc.get('body', '')}")
        embedding = model.encode(text).tolist()
        duplicate_of = find_story_cluster_match(
            embedding,
            doc.get("source"),
            milvus_col,
            articles_col,
            exclude_mongo_id=mongo_id,
            before_published_at=doc.get("published_at"),
        )

        if duplicate_of:
            canonical = articles_col.find_one({"_id": ObjectId(duplicate_of)})
            cid = (canonical or {}).get("story_cluster_id") or cluster_id_for(duplicate_of)
            if canonical and not canonical.get("story_cluster_id"):
                articles_col.update_one(
                    {"_id": ObjectId(duplicate_of)},
                    {"$set": {
                        "story_cluster_id": cid,
                        "is_canonical": True,
                    }},
                )
            articles_col.update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "is_canonical": False,
                    "duplicate_of": duplicate_of,
                    "story_cluster_id": cid,
                }, "$unset": {"hidden": ""}},
            )
            clustered += 1
            print(f"  Cluster: [{doc.get('source')}] {doc.get('title', '')[:55]}")
        else:
            articles_col.update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "story_cluster_id": cluster_id_for(mongo_id),
                    "is_canonical": True,
                }, "$unset": {"hidden": "", "duplicate_of": ""}},
            )

    synced = sync_cluster_sizes()
    deleted = cache.invalidate_all()
    multi = articles_col.count_documents({**DE_FILTER, "is_canonical": {"$ne": False}, "cluster_size": {"$gte": 2}})
    print(f"\n{clustered} Artikel Story-Clustern zugeordnet")
    print(f"{synced} Cluster-Mitglieder synchronisiert")
    print(f"Stories mit 2+ Quellen (sichtbar): {multi}")
    print(f"Redis-Cache geleert ({deleted} Keys)")


if __name__ == "__main__":
    dedupe()
