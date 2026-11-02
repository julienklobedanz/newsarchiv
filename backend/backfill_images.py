"""Ergänzt image_url für bestehende Artikel (RSS + og:image)."""
import argparse
import hashlib
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import feedparser
from pymongo import MongoClient

import cache
from article_utils import extract_rss_image, fetch_og_image, normalize_article_url
from config import MONGO_URL

FEEDS = [
    {"url": "https://www.spiegel.de/schlagzeilen/tops/index.rss", "source": "spiegel"},
    {"url": "https://www.spiegel.de/wissenschaft/index.rss", "source": "spiegel"},
    {"url": "https://www.spiegel.de/wirtschaft/index.rss", "source": "spiegel"},
    {"url": "https://taz.de/!p4608;rss/", "source": "taz"},
    {"url": "https://www.zeit.de/index.rss", "source": "zeit"},
    {"url": "https://www.faz.net/rss/aktuell/", "source": "faz"},
    {"url": "https://www.heise.de/rss/heise-atom.xml", "source": "heise"},
    {"url": "https://rss.sueddeutsche.de/rss/Topthemen", "source": "sz"},
    {"url": "https://rss.sueddeutsche.de/rss/Politik", "source": "sz"},
    {"url": "https://rss.sueddeutsche.de/rss/Wirtschaft", "source": "sz"},
    {"url": "https://rss.sueddeutsche.de/rss/Sport", "source": "sz"},
    {"url": "https://rss.sueddeutsche.de/rss/Panorama", "source": "sz"},
]

mongo = MongoClient(MONGO_URL)
articles_col = mongo["newsarchiv"]["articles"]

MISSING_IMAGE_FILTER = {
    "language": "de",
    "$or": [{"image_url": {"$exists": False}}, {"image_url": None}, {"image_url": ""}],
}


def _missing_filter(source: str | None = None) -> dict:
    filt = dict(MISSING_IMAGE_FILTER)
    if source:
        filt["source"] = source
    return filt


def url_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def find_article_for_feed_url(feed_url: str):
    candidates = [feed_url, feed_url.split("#")[0], normalize_article_url(feed_url)]
    for candidate in dict.fromkeys(candidates):
        if not candidate:
            continue
        doc = articles_col.find_one({"url": candidate}) or articles_col.find_one({"url_id": url_hash(candidate)})
        if doc:
            return doc

    taz_match = re.search(r"!(\d+)", feed_url)
    if taz_match:
        doc = articles_col.find_one({"url": {"$regex": r"!" + taz_match.group(1) + r"/?$"}})
        if doc:
            return doc

    spiegel_match = re.search(r"a-([a-f0-9-]{36})", feed_url)
    if spiegel_match:
        return articles_col.find_one({"url": {"$regex": spiegel_match.group(1)}})

    return None


def patch_image(url_id: str, image_url: str | None) -> bool:
    if not image_url:
        return False
    result = articles_col.update_one(
        {"url_id": url_id, **MISSING_IMAGE_FILTER},
        {"$set": {"image_url": image_url}},
    )
    return result.modified_count > 0


def backfill_from_feeds() -> int:
    updated = 0
    for feed_cfg in FEEDS:
        print(f"RSS: {feed_cfg['source']} ({feed_cfg['url'][:50]}...)")
        feed = feedparser.parse(feed_cfg["url"])
        for entry in feed.entries:
            feed_url = getattr(entry, "link", "")
            if not feed_url:
                continue
            image_url = extract_rss_image(entry)
            doc = find_article_for_feed_url(feed_url)
            if doc and patch_image(doc["url_id"], image_url):
                updated += 1
    return updated


def _fetch_and_patch(doc: dict) -> bool:
    image_url = fetch_og_image(doc.get("url") or "")
    if not image_url:
        return False
    return patch_image(doc["url_id"], image_url)


def backfill_from_og(limit: int | None, workers: int, source: str | None = None) -> int:
    cursor = articles_col.find(_missing_filter(source), {"url_id": 1, "url": 1, "source": 1})
    if limit:
        cursor = cursor.limit(limit)
    docs = list(cursor)
    if not docs:
        return 0

    updated = 0
    print(f"og:image für {len(docs)} Artikel (Workers: {workers}) …")
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch_and_patch, doc): doc for doc in docs}
        for i, future in enumerate(as_completed(futures), start=1):
            if future.result():
                updated += 1
            if i % 25 == 0 or i == len(docs):
                print(f"  … {i}/{len(docs)} geprüft, {updated} ergänzt")
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="Artikelbilder aus RSS und og:image ergänzen")
    parser.add_argument("--skip-rss", action="store_true", help="Nur og:image-Backfill")
    parser.add_argument("--skip-og", action="store_true", help="Nur RSS-Backfill")
    parser.add_argument("--og-limit", type=int, default=0, help="Max. Artikel für og:image (0 = alle)")
    parser.add_argument("--source", type=str, help="Nur diese Quelle (z. B. faz)")
    parser.add_argument("--workers", type=int, default=6, help="Parallele og:image-Requests")
    args = parser.parse_args()

    source = args.source if args.source in {"spiegel", "taz", "zeit", "faz", "heise", "sz"} else None

    rss_updated = 0
    if not args.skip_rss:
        rss_updated = backfill_from_feeds()
        print(f"RSS ergänzt: {rss_updated}")

    og_updated = 0
    if not args.skip_og:
        og_limit = args.og_limit if args.og_limit > 0 else None
        og_updated = backfill_from_og(og_limit, max(1, args.workers), source)
        print(f"og:image ergänzt: {og_updated}")

    deleted = cache.invalidate_all()
    total = articles_col.count_documents({"language": "de", "image_url": {"$exists": True, "$nin": [None, ""]}})
    print(f"Artikel mit Bild insgesamt: {total}")
    print(f"Redis-Cache geleert ({deleted} Keys)")


if __name__ == "__main__":
    main()
