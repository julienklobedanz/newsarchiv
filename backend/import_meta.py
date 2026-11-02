from datetime import datetime, timezone

META_ID = "import"


def get_last_import_at(meta_col) -> datetime | None:
    doc = meta_col.find_one({"_id": META_ID})
    if not doc:
        return None
    return doc.get("last_import_at")


def record_import(meta_col, imported_count: int, rss_count: int = 0, api_count: int = 0) -> datetime:
    now = datetime.now(timezone.utc)
    meta_col.update_one(
        {"_id": META_ID},
        {"$set": {
            "last_import_at": now,
            "last_import_count": imported_count,
            "last_rss_count": rss_count,
            "last_api_count": api_count,
        }},
        upsert=True,
    )
    return now


def import_status_for_api(meta_col) -> dict | None:
    doc = meta_col.find_one({"_id": META_ID})
    if not doc:
        return None
    dt = doc.get("last_import_at")
    return {
        "last_import_at": dt.isoformat() if dt else None,
        "last_import_count": doc.get("last_import_count", 0),
        "last_rss_count": doc.get("last_rss_count", 0),
        "last_api_count": doc.get("last_api_count", 0),
    }


def last_import_for_api(meta_col) -> str | None:
    dt = get_last_import_at(meta_col)
    return dt.isoformat() if dt else None
