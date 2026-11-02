import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from urllib.parse import urlparse, urlunparse

import requests
from langdetect import detect, LangDetectException

KNOWN_SOURCES = frozenset({
    "spiegel", "taz", "zeit", "faz", "heise", "sz",
})

NEWSAPI_SOURCE_MAP = {
    "spiegel-online": "spiegel",
    "die-zeit": "zeit",
    "focus": "faz",
    "sueddeutsche-zeitung": "sz",
    "heise-online": "heise",
}

DOMAIN_SOURCE_RULES = [
    ("sueddeutsche.de", "sz"),
    ("spiegel.de", "spiegel"),
    ("zeit.de", "zeit"),
    ("taz.de", "taz"),
    ("faz.net", "faz"),
    ("heise.de", "heise"),
]

NEWSAPI_DOMAINS = ",".join(
    domain for domain, _ in DOMAIN_SOURCE_RULES
)

CATEGORY_RULES = [
    ("klima", ["klima", "klimawandel", "co₂", "co2", "emission", "erderwärmung", "umwelt", "nachhaltig", "energiewende", "erdgas", "solarenergie"]),
    ("ki", ["künstliche intelligenz", "chatgpt", "openai", "maschinelles lernen", "deep learning", " ki ", "llm", "neuronales netz"]),
    ("wirtschaft", ["wirtschaft", "börse", "inflation", "zins", "unternehmen", "aktie", "konjunktur", "rente", "bank", "steuer"]),
    ("politik", ["regierung", "minister", "bundestag", "wahl", "partei", "kanzler", "parlament", "diplomat", "nato", "außenminister"]),
    ("wissenschaft", ["forschung", "studie", "wissenschaft", "physik", "medizin", "universität", "quanten", "labor"]),
    ("technik", ["technik", "software", "chip", "smartphone", "digital", "cyber", "computer", "semiconductor", "it-sicherheit"]),
    ("sport", ["fußball", "bundesliga", "champions league", "olympia", "tennis", "formel 1", "dfb"]),
]

SOURCE_CATEGORY_HINT = {
    "heise": "technik",
}

RSS_CATEGORY_MAP = {
    "wissenschaft": "wissenschaft",
    "science": "wissenschaft",
    "wirtschaft": "wirtschaft",
    "business": "wirtschaft",
    "politik": "politik",
    "politics": "politik",
    "umwelt": "klima",
    "environment": "klima",
    "klima": "klima",
    "technik": "technik",
    "technology": "technik",
    "sport": "sport",
}


def resolve_source_from_url(url: str) -> str | None:
    if not url:
        return None
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    for domain, source in DOMAIN_SOURCE_RULES:
        if host == domain or host.endswith("." + domain):
            return source
    return None


def normalize_article_url(url: str) -> str:
    if not url:
        return ""
    url = url.split("#")[0].strip()
    parsed = urlparse(url)
    scheme = (parsed.scheme or "https").lower()
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return urlunparse((scheme, host, path, "", parsed.query, ""))


def fetch_og_image(url: str, timeout: int = 12) -> str | None:
    if not url:
        return None
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": "Mozilla/5.0 (compatible; NewsArchiv/1.0)", "Accept": "text/html"},
            allow_redirects=True,
        )
        resp.raise_for_status()
        html = resp.text
    except requests.RequestException:
        return None

    head = re.search(r"<head[^>]*>(.*?)</head>", html, re.I | re.S)
    search_html = head.group(1) if head else html[:400_000]

    patterns = [
        r'<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image(?::secure_url)?["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, search_html, re.I)
        if match:
            image_url = match.group(1).strip()
            if image_url and not image_url.startswith("data:"):
                return image_url
    return None


def resolve_newsapi_source(article: dict) -> str | None:
    api_source = (article.get("source") or {}).get("id") or ""
    mapped = NEWSAPI_SOURCE_MAP.get(api_source)
    if mapped in KNOWN_SOURCES:
        return mapped
    return resolve_source_from_url(article.get("url") or "")


def _first_img_from_html(html: str) -> str | None:
    if not html:
        return None
    match = re.search(r"""<img[^>]+src=["']([^"']+)["']""", html, re.I)
    return match.group(1) if match else None


def extract_rss_image(entry) -> str | None:
    thumbs = getattr(entry, "media_thumbnail", None)
    if thumbs:
        items = thumbs if isinstance(thumbs, list) else [thumbs]
        for t in items:
            url = t.get("url") if isinstance(t, dict) else getattr(t, "url", None)
            if url:
                return url
    for m in getattr(entry, "media_content", []) or []:
        if m.get("medium") == "image" and m.get("url"):
            return m["url"]
    for enc in getattr(entry, "enclosures", []) or []:
        enc_type = str(enc.get("type", ""))
        enc_url = enc.get("href") or enc.get("url")
        if enc_url and (enc_type.startswith("image") or enc_url.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))):
            return enc_url
    for link in getattr(entry, "links", []) or []:
        if str(link.get("type", "")).startswith("image") and link.get("href"):
            return link["href"]
    for field in ("content", "summary", "description"):
        value = entry.get(field, [{}])
        if isinstance(value, list) and value:
            value = value[0].get("value", "")
        img = _first_img_from_html(str(value or ""))
        if img:
            return img
    return None


def normalize_for_embedding(text: str) -> str:
    """Einheitliche Schreibweise — verhindert unterschiedliche Vektoren bei openai/OpenAI."""
    return re.sub(r"\s+", " ", text.strip().lower())


def parse_date(date_str: str) -> datetime:
    if not date_str:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return parsedate_to_datetime(date_str)
    except (TypeError, ValueError, IndexError):
        pass
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def clean_html(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(r" Continue reading\.\.\.$", "", text, flags=re.I)


def is_german(title: str, body: str) -> bool:
    text = f"{title}. {body}".strip()
    if len(text) < 20:
        return False
    try:
        return detect(text) == "de"
    except LangDetectException:
        return False


def categorize(title: str, body: str, source: str, feed_tags: list[str] | None = None) -> list[str]:
    """1–3 passende Kategorien, primäre zuerst."""
    found: list[str] = []
    seen: set[str] = set()

    def add(cat: str) -> None:
        if cat not in seen:
            seen.add(cat)
            found.append(cat)

    if feed_tags:
        for tag in feed_tags:
            tag_low = tag.lower()
            for key, cat in RSS_CATEGORY_MAP.items():
                if key in tag_low:
                    add(cat)

    text = f"{title} {body}".lower()
    scores: dict[str, int] = {}
    for cat, keywords in CATEGORY_RULES:
        hits = sum(1 for k in keywords if k in text)
        if hits:
            scores[cat] = scores.get(cat, 0) + hits

    for cat, _ in sorted(scores.items(), key=lambda item: -item[1]):
        add(cat)
        if len(found) >= 3:
            break

    if not found:
        add(SOURCE_CATEGORY_HINT.get(source, "gesellschaft"))

    return found[:3]


def primary_category(categories: list[str]) -> str:
    return categories[0] if categories else "gesellschaft"


def similarity_label(score: float) -> str:
    if score >= 0.88:
        return "sehr ähnlich"
    if score >= 0.80:
        return "ähnlich"
    if score >= 0.72:
        return "verwandt"
    return "thematisch nah"
