"""Einmalig: ingest-Feld setzen, NewsAPI-Artikel Zeitungen zuordnen, Tagesspiegel korrigieren."""
from pymongo import MongoClient
from article_utils import KNOWN_SOURCES, resolve_source_from_url
from config import MONGO_URL

mongo = MongoClient(MONGO_URL)
articles_col = mongo["newsarchiv"]["articles"]


def migrate():
    remapped = 0
    ingest_set = 0
    hidden = 0

    for doc in articles_col.find():
        url = doc.get("url", "")
        source = doc.get("source", "")
        ingest = doc.get("ingest")
        url_source = resolve_source_from_url(url)
        updates = {}

        if source == "newsapi" or source not in KNOWN_SOURCES:
            if url_source:
                updates["source"] = url_source
                updates["ingest"] = "api"
                remapped += 1
            else:
                updates["hidden"] = True
                hidden += 1
        elif url_source and url_source != source:
            updates["source"] = url_source
            remapped += 1

        if "ingest" not in updates:
            if ingest in ("rss", "api"):
                pass
            elif source == "newsapi":
                updates["ingest"] = "api" if url_source else "rss"
                ingest_set += 1
            else:
                updates["ingest"] = "rss"
                ingest_set += 1

        if updates:
            articles_col.update_one({"_id": doc["_id"]}, {"$set": updates})

    print(f"Neu zugeordnet: {remapped}")
    print(f"ingest gesetzt: {ingest_set}")
    print(f"Ausgeblendet (nicht zuordenbar): {hidden}")
    print(f"Sichtbar in App (de): {articles_col.count_documents({'language': 'de'})}")
    for source in sorted(KNOWN_SOURCES):
        n = articles_col.count_documents({"language": "de", "source": source})
        if n:
            rss = articles_col.count_documents({"language": "de", "source": source, "ingest": "rss"})
            api = articles_col.count_documents({"language": "de", "source": source, "ingest": "api"})
            print(f"  {source}: {n} (RSS {rss}, API {api})")


if __name__ == "__main__":
    migrate()
