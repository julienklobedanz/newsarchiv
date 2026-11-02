# NewsArchiv — Import-Pipeline

Detaillierte Beschreibung des Collectors (`backend/collector.py`) und der Datenverarbeitung beim Import.

---

## Überblick

```
python collector.py
        │
        ├── _import_since()          Letzter Import-Zeitpunkt ermitteln
        │
        ├── collect_rss(since)       12 RSS-Feeds abrufen
        │
        ├── collect_newsapi(since)   5 Themen via NewsAPI (wenn API-Key gesetzt)
        │
        └── Abschluss
              ├── milvus_col.flush()
              ├── cache.invalidate_all()
              └── record_import()    Meta in MongoDB aktualisieren
```

Der Collector ist ein **Batch-Job** — kein Dauerprozess, kein Kafka-Stream.

---

## Heterogenität: RSS vs. NewsAPI

Beide Quellen liefern Nachrichten, aber in völlig unterschiedlicher Form. Der Collector normalisiert sie in ein einheitliches MongoDB-Dokument.

### RSS (XML)

Verarbeitet mit `feedparser`. Pro Feed-Eintrag:

```python
url   = entry.link           # z.B. "https://www.spiegel.de/politik/..."
title = entry.title          # Plaintext
body  = entry.summary        # oft HTML: "<p>Der Bundestag hat ...</p>"
date  = entry.published      # RFC 2822: "Wed, 10 Jun 2026 14:30:00 +0200"
feed_tags = [t.term for t in entry.tags]  # z.B. ["Politik", "Berlin"]
source = feed_cfg["source"]  # fest aus FEEDS-Config: "spiegel", "taz", …
ingest = "rss"
```

**12 konfigurierte Feeds** (Spiegel, taz, Zeit, FAZ, Heise, SZ mit mehreren Ressorts).

### NewsAPI (JSON)

REST-Aufruf an `newsapi.org/v2/everything`:

```python
url   = article["url"]
title = article["title"]
body  = article["description"] or article["content"]
date  = article["publishedAt"]   # ISO-8601: "2026-06-10T12:30:00Z"
source = resolve_newsapi_source(article)  # Mapping + URL-Fallback
ingest = "api"
# keine feed_tags
```

**5 Suchthemen:** Klimawandel, KI, Wirtschaft, Politik Deutschland, Wissenschaft.

Quellen werden auf bekannte Medien gemappt (`spiegel-online` → `spiegel`, Domain-Regeln für `spiegel.de` etc.). Unbekannte Quellen werden verworfen.

### Vergleichstabelle

| Aspekt | RSS | NewsAPI |
|--------|-----|---------|
| Transportformat | XML | JSON |
| Textfeld | `summary` (HTML) | `description` / `content` |
| Datum | RFC 2822 | ISO-8601 |
| Quelle | fest konfiguriert | gemappt aus `source.id` oder URL |
| Kategorie-Hilfe | RSS-Tags | keine |
| Kennzeichnung | `ingest: "rss"` | `ingest: "api"` |

---

## `import_article()` — die zentrale Pipeline

Jeder Artikel — egal ob RSS oder NewsAPI — durchläuft dieselben Schritte:

```
Rohdaten (url, title, body, date, source, ingest, feed_tags?)
        │
        ▼
① HTML bereinigen
        │
        ▼
② Sprachfilter (nur Deutsch)
        │
        ▼
③ URL-Deduplizierung
        │
        ▼
④ Kategorisierung
        │
        ▼
⑤ Embedding erzeugen
        │
        ▼
⑥ Story-Clustering
        │
        ▼
⑦ Dual speichern (MongoDB + Milvus)
```

### ① HTML bereinigen — `clean_html()`

```python
# article_utils.py
text = re.sub(r"<br\s*/?>", "\n", text)       # <br> → Zeilenumbruch
text = re.sub(r"<[^>]+>", " ", text)            # alle Tags entfernen
text = unescape(text)                           # &amp; → &
text = re.sub(r"\s+", " ", text).strip()        # Whitespace normalisieren
text = re.sub(r" Continue reading\.\.\.$", "")  # NewsAPI-Artefakt
```

**Warum:** RSS-Summaries enthalten oft `<p>`, `<a href="...">`, Entities. Für Speicherung, Suche und Embeddings wird Plaintext benötigt.

### ② Sprachfilter — `is_german()`

- Kombiniert `title` + `body`
- Mindestlänge 20 Zeichen
- `langdetect` muss `"de"` liefern
- Bei Unsicherheit: Artikel verwerfen

**Warum:** NewsAPI liefert trotz `language=de` gelegentlich fremdsprachige Treffer.

### ③ URL-Deduplizierung

```python
url_id = hashlib.md5(url.encode()).hexdigest()
if articles_col.find_one({"url_id": url_id}):
    return False  # bereits vorhanden
```

Gleiche URL wird nie doppelt importiert — idempotenter Batch-Import.

### ④ Kategorisierung — `categorize()`

Priorität:

1. **RSS-Tags** → Mapping (`"Politik"` → `politik`, `"Umwelt"` → `klima`)
2. **Keyword-Listen** in Titel + Body (erste passende Kategorie gewinnt)
3. **Fallback:** `SOURCE_CATEGORY_HINT` (Heise → `technik`) oder `"gesellschaft"`

Kategorien: `klima`, `ki`, `wirtschaft`, `politik`, `wissenschaft`, `technik`, `sport`, `gesellschaft`.

Siehe [FAQ](./FAQ.md#8-warum-ist-die-kategorisierung-nicht-perfekt) für Limitierungen.

### ⑤ Embedding erzeugen

```python
text_to_embed = normalize_for_embedding(f"{title}. {body}")
embedding = model.encode(text_to_embed).tolist()  # 384 Dimensionen
```

- Modell: `paraphrase-multilingual-MiniLM-L12-v2`
- Normalisierung: lowercase, Whitespace bereinigt (verhindert unterschiedliche Vektoren bei „OpenAI" vs. „openai")

### ⑥ Story-Clustering — `find_story_cluster_match()`

```python
# duplicate_utils.py
SAME_SOURCE_THRESHOLD = 0.90    # nahezu identisch (RSS-Doppel derselben Quelle)
CROSS_SOURCE_THRESHOLD = 0.72   # gleiche Story, andere Quelle und Formulierung

hits = milvus_col.search(embedding, limit=20)   # Cosinus
# Treffer auf bereits geclusterte Artikel werden auf den kanonischen Artikel aufgelöst
# Der beste Treffer über der jeweiligen Schwelle bestimmt die Story
```

Erkennt **inhaltlich gleiche Stories** mit unterschiedlicher URL (z. B. dieselbe Meldung bei Spiegel und Zeit). Der neue Artikel wird **gespeichert** und dem Cluster des ältesten ähnlichen Artikels zugeordnet (`story_cluster_id`, `duplicate_of`, `is_canonical: false`); `cluster_size` des kanonischen Artikels wird erhöht. Kandidaten, die später veröffentlicht wurden, sowie versteckte oder nicht deutsche Artikel zählen nicht.

Siehe [FAQ](./FAQ.md#10-ist-die-duplikaterkennung-problematisch) für die Diskussion.

### ⑦ Dual speichern

**MongoDB** — volles Dokument:

```json
{
  "url_id": "a1b2c3...",
  "url": "https://...",
  "source": "spiegel",
  "title": "...",
  "body": "...",
  "date": "Wed, 10 Jun 2026 ...",
  "published_at": "ISODate(...)",
  "language": "de",
  "category": "politik",
  "ingest": "rss",
  "story_cluster_id": "9f2c41d8a7b3e5f0",
  "is_canonical": true,
  "cluster_size": 1
}
```

**Milvus** — nur Vektor + Referenz:

```python
milvus_col.insert([[mongo_id], [title[:200]], [embedding]])
```

`mongo_id` = `str(result.inserted_id)` — die Brücke zwischen beiden Datenbanken.

---

## Inkrementeller Import

```python
since = _import_since()
# 1. meta.last_import_at aus MongoDB
# 2. Fallback: published_at des neuesten Artikels
```

Beim RSS- und NewsAPI-Abruf werden nur Artikel **nach** `since` importiert (`_is_after_since`). NewsAPI nutzt zusätzlich den `from`-Parameter.

---

## Abschluss nach dem Import

| Schritt | Zweck |
|---------|--------|
| `milvus_col.flush()` | Vektoren persistent in Milvus schreiben |
| `cache.invalidate_all()` | Veraltete API-Antworten in Redis löschen |
| `record_import(meta_col, total_new)` | `last_import_at` in MongoDB `meta`-Collection |

---

## Limitierung: nur Teaser, kein Volltext

Das ist ein **Quellenlimit**, keine bewusste Architekturentscheidung:

- **RSS:** Feeds liefern typischerweise nur `summary`/`description`
- **NewsAPI:** `description` ist kurz; `content` oft abgeschnitten (`"... [+1234 chars]"` im Free-Tier)

Für ein Archiv mit Volltexten bräuchte man Web-Scraping oder kostenpflichtige APIs.

---

## Migration: Bestandsdaten clustern

`backend/dedupe_articles.py` — Skript für bereits importierte Artikel:

- Berechnet Embeddings für alle sichtbaren deutschen Artikel (chronologisch, älteste zuerst)
- Ordnet semantisch ähnliche Artikel einem Story-Cluster zu (Schwellen 0.90 / 0.72)
- Setzt `story_cluster_id`, `is_canonical` und `duplicate_of`, leitet `cluster_size` aus den Mitgliedern ab
- Leert den Redis-Cache

`backend/recluster_stories.py` setzt alle Cluster-Felder zurück und clustert mit den aktuellen Schwellenwerten neu. Der Collector ordnet neue Artikel beim Import direkt zu, die Migration holt den Bestand nach.

---

## Verwandte Dokumente

- [Architektur](./ARCHITEKTUR.md) — ID-Modell, API-Endpoints
- [NoSQL-Entscheidungen](./NOSQL-ENTSCHEIDUNGEN.md) — Warum dual speichern
- [FAQ](./FAQ.md) — Kurzantworten
