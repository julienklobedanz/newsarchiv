"""Setzt categories (1–3) und category (primär) für alle Artikel."""
import cache
from pymongo import MongoClient
from article_utils import categorize, primary_category
from config import MONGO_URL

mongo = MongoClient(MONGO_URL)
articles_col = mongo["newsarchiv"]["articles"]


def backfill():
    updated = 0
    for doc in articles_col.find({"language": "de"}, {"title": 1, "body": 1, "source": 1}):
        categories = categorize(doc.get("title", ""), doc.get("body", ""), doc.get("source", ""))
        articles_col.update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "categories": categories,
                "category": primary_category(categories),
            }},
        )
        updated += 1
    deleted = cache.invalidate_all()
    print(f"{updated} Artikel mit 1–3 Kategorien aktualisiert")
    print(f"Redis-Cache geleert ({deleted} Keys)")


if __name__ == "__main__":
    backfill()
