"""Einmalig: Sprache + Kategorie für alle bestehenden Artikel setzen."""
from pymongo import MongoClient
from article_utils import is_german, categorize, primary_category, parse_date
from config import MONGO_URL

mongo = MongoClient(MONGO_URL)
articles_col = mongo["newsarchiv"]["articles"]

def migrate():
    de_count = 0
    other_count = 0

    for doc in articles_col.find():
        title = doc.get("title", "")
        body = doc.get("body", "")
        source = doc.get("source", "")
        categories = categorize(title, body, source)
        language = "de" if is_german(title, body) else "en"

        articles_col.update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "language": language,
                "categories": categories,
                "category": primary_category(categories),
                "published_at": parse_date(doc.get("date", "")),
            }},
        )

        if language == "de":
            de_count += 1
        else:
            other_count += 1

    articles_col.create_index("language")
    articles_col.create_index("category")
    articles_col.create_index([("published_at", -1)])
    articles_col.create_index([("title", 1)])

    print(f"Deutsch: {de_count} · Andere Sprachen: {other_count}")
    print(f"Sichtbar in App (de): {articles_col.count_documents({'language': 'de'})}")

if __name__ == "__main__":
    migrate()
