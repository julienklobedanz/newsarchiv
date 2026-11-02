"""Setzt Story-Cluster zurück und bildet sie mit neuen Schwellenwerten neu."""
import cache
from dedupe_articles import articles_col, dedupe

if __name__ == "__main__":
    print("Setze Cluster-Felder zurück und entferne hidden …")
    result = articles_col.update_many(
        {"language": "de"},
        {
            "$unset": {
                "story_cluster_id": "",
                "duplicate_of": "",
                "hidden": "",
            },
            "$set": {
                "is_canonical": True,
                "cluster_size": 1,
            },
        },
    )
    print(f"  {result.modified_count} Artikel zurückgesetzt")
    deleted = cache.invalidate_all()
    print(f"Redis-Cache geleert ({deleted} Keys)\n")
    print("Starte Re-Clustering …")
    dedupe()
