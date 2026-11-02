# NewsArchiv — Projektbeschreibung

*Entstanden im NoSQL-/Big-Data-Praktikum an der HAW Hamburg. Konzept und Umsetzung: Julien Klobedanz (Einzelprojekt).*

## 1. Ausgangsidee und Ziel

**NewsArchiv** ist ein persönliches Nachrichtenarchiv, das kontinuierlich Artikel aus vielen deutschsprachigen Quellen sammelt, speichert und auf zwei unterschiedliche Arten durchsuchbar macht: **klassisch per Stichwort** und **semantisch per Bedeutungsähnlichkeit**.

Das Projekt adressiert ein typisches Big-Data-Problem: **große, stetig wachsende, heterogene Textmengen** aus unterschiedlichen Quellen müssen effizient gespeichert, gefiltert und intelligent abgefragt werden — ohne relationales Schema für jeden Artikeltyp.

Die App demonstriert bewusst den **Unterschied zwischen dokumentenorientierter Volltextsuche und vektorbasierter Ähnlichkeitssuche** (z. B. „Klimawandel“ findet exakte Treffer vs. thematisch verwandte Artikel ohne das Wort).

---

## 2. Erfüllung der Praktikums-Randbedingungen

| Anforderung | Umsetzung |
|-------------|-----------|
| **Mindestens zwei NoSQL-Datenbanken** | **MongoDB** (Dokumentenspeicher + Volltext), **Milvus** (Vektoren) und **Redis** (In-Memory-Cache für API-Antworten) |
| **Big Data / NoSQL im Fokus** | Polyglot Persistence: unterschiedliche Datenmodelle für unterschiedliche Abfragearten |
| **Viele / wachsende Daten** | RSS-Feeds + NewsAPI; wiederholbarer Import; aktuell **~600+ deutsche Artikel**, skalierbar auf Tausende |
| **Heterogene Daten** | RSS-XML, REST-JSON, HTML-Teaser, Metadaten, 384-dimensionale Vektoren, verschiedene Datumsformate |

Kafka wird **nicht** eingesetzt; die Kombination MongoDB + Milvus + Redis erfüllt die Vorgabe vollständig.

---

## 3a. Redis — API-Cache (Cache-Aside)

**Rolle:** Zwischenspeicher für teure Lesezugriffe (Aggregationen, Volltextsuche, semantische Suche mit Embedding-Berechnung).

- Keys mit Präfix `newsarchiv:` in Redis (`localhost:6379`)
- TTL: Artikelliste 5 min, Stats 2 min, Suche 10 min
- Nach `python collector.py`: Cache wird geleert (`invalidate_all`)
- Response-Header `X-Cache: HIT|MISS` zur Kontrolle
- Ohne Redis: API läuft weiter (graceful degradation)

---

## 3. Systemarchitektur (Gesamtüberblick)

```
┌─────────────────┐     RSS / NewsAPI      ┌──────────────────┐
│  collector.py   │ ─────────────────────► │     MongoDB      │
│  (Python)       │   Volltext-Dokumente   │  newsarchiv.     │
│                 │ ─────────────────────► │  articles        │
│                 │   Embeddings           └────────┬─────────┘
└─────────────────┘                        ┌──────▼─────────┐
                                           │    Milvus      │
┌─────────────────┐     REST /api/*        │ news_embeddings│
│  React-Frontend │ ◄────────────────────► └──────▲─────────┘
│  (Vite)         │                        ┌──────┴─────────┐
└─────────────────┘                        │  FastAPI       │
                                           │  main.py       │
                                           └────────────────┘
```

**Infrastruktur** (Docker Compose): MongoDB, Milvus (mit etcd + MinIO), optional Attu als Milvus-UI.

**Drei Schichten:**

1. **Datenbeschaffung** — `backend/collector.py`
2. **API-Schicht** — FastAPI (`backend/main.py`)
3. **Präsentation** — React-SPA (`newsarchiv/`)

---

## 4. Datenbeschaffung und Heterogenität

### Quellen

- **RSS-Feeds** deutschsprachiger Medien: Spiegel, taz, Zeit, FAZ, Heise, Süddeutsche Zeitung (mehrere Ressorts)
- **NewsAPI** mit deutschen Suchthemen (Klimawandel, KI, Wirtschaft, Politik, Wissenschaft)

### Heterogenität im Detail

| Aspekt | Beispiel |
|--------|----------|
| **Formate** | RSS/XML vs. NewsAPI-JSON |
| **Inhalt** | Teaser mit HTML (`<p>`, Links), unterschiedliche Längen |
| **Metadaten** | RFC-2822-Datum, ISO-8601, Quellen-IDs |
| **Struktur** | Felder wie `source`, `category`, `language`, `url_id` |
| **Vektoren** | 384 Floats pro Artikel in Milvus (andere „Datenart“ als BSON-Dokumente) |

### Verarbeitung im Collector

- **Deduplizierung** über `url_id` (MD5 der URL)
- **HTML-Bereinigung** (`clean_html`)
- **Sprachfilter** — nur Deutsch (`langdetect`)
- **Automatische Kategorisierung** (Klima, KI, Wirtschaft, Politik, …) per Schlagwort-Heuristik und RSS-Tags
- **Embedding-Erzeugung** mit `paraphrase-multilingual-MiniLM-L12-v2` (384 Dimensionen)
- **Story-Clustering**: semantisch ähnliche Artikel verschiedener Quellen werden zu einer Story gruppiert (Cosinus ≥ 0.90 innerhalb einer Quelle, ≥ 0.72 quellenübergreifend)
- **Duale Speicherung**: MongoDB-Dokument + Milvus-Vektor, verknüpft über `mongo_id`

---

## 5. MongoDB — Dokumentenspeicher und Keyword-Suche

**Rolle:** System of Record für alle Artikelmetadaten und Volltext.

**Dokumentstruktur (vereinfacht):**

```json
{
  "url_id": "...",
  "url": "https://...",
  "source": "spiegel",
  "title": "...",
  "body": "...",
  "date": "...",
  "published_at": "ISODate",
  "language": "de",
  "category": "klima"
}
```

**NoSQL-Eigenschaften:**

- Schemaflexibel (Felder wie `category` / `language` nachträglich per Migration ergänzt)
- Aggregation Pipelines für Statistiken (`by_source`, `by_category`)
- **Volltextindex** auf `title` und `body` → MongoDB `$text`-Suche

**API-Nutzung:**

- `GET /api/articles` — Liste mit Filter (Quelle, Kategorie), Pagination, Sortierung
- `GET /api/stats` — Gesamtzahl, letzter Import, Verteilungen
- `POST /api/search/keyword` — exakte/stichwortbasierte Suche mit `textScore`

MongoDB eignet sich hier für **strukturierte Filter + Volltext**, nicht für semantische Ähnlichkeit bei großen Mengen.

---

## 6. Milvus — Vektor-Datenbank und semantische Suche

**Rolle:** Speicher und Abfrage hochdimensionaler Embeddings für **Bedeutungsähnlichkeit**.

**Collection `news_embeddings`:**

- `mongo_id` — Verknüpfung zu MongoDB
- `title` — Kurztitel (Metadaten in Milvus)
- `embedding` — 384-dim Float-Vektor, Index: **COSINE**, **IVF_FLAT**

**Ablauf semantischer Suche** (`POST /api/search/semantic`):

1. Suchbegriff → Embedding (mit Normalisierung für konsistente Groß-/Kleinschreibung)
2. Milvus `search` mit Cosinus-Ähnlichkeit
3. Treffer-IDs → vollständige Artikel aus MongoDB nachladen
4. Score als Ähnlichkeitswert ans Frontend

**Warum zwei Datenbanken?**

- MongoDB: „Enthält der Text das Wort *Klimawandel*?“
- Milvus: „Ist der Artikel thematisch ähnlich, auch ohne exaktes Keyword?“ (z. B. Erderwärmung, EU-Klimaziele)

Das ist der **zentrale didaktische Kern** des Projekts: gleiche Daten, zwei Abfragemodelle, unterschiedliche Ergebnisse.

---

## 7. Backend (FastAPI)

| Endpoint | Funktion |
|----------|----------|
| `GET /api/articles` | Paginierte Artikelliste, Filter, Sortierung |
| `GET /api/stats` | Archiv-Statistiken live |
| `POST /api/search/keyword` | MongoDB `$text` |
| `POST /api/search/semantic` | Milvus + Embedding-Modell |

Nur Artikel mit `language: "de"` werden ausgeliefert. CORS ermöglicht den Zugriff des Vite-Frontends (`localhost:5173`).

---

## 8. Frontend (React + Vite)

### Drei Hauptscreens

**1. Dashboard**

- Live-Archivstatus (Anzahl, letzter Import)
- Sidebar: Quellen und Themen mit Live-Zählern
- Artikelkacheln mit Quelle, Kategorie, Datum (de-DE)
- Pagination, Sortierung (Datum, Titel, Quelle)

**2. Suche & Vergleich**

- Zwei Spalten nebeneinander: Keyword (MongoDB) vs. Semantik (Milvus)
- Hervorhebung exakter Treffer, Info bei semantischen Treffern ohne Keyword
- Vergleichszeile mit Trefferzahlen

**3. Artikel-Detail**

- Volltext-Teaser, Link zum Original
- Ähnliche Artikel unterhalb (Milvus, mit Kategorie, Datum, Score)

**4. Stories**

- Tab „Stories“ im Dashboard: Meldungen, über die mehrere Quellen berichten, als gestapelte Karte
- Detailansicht mit allen Quellen einer Story, Badge „Gleiche Story · N Quellen“ auf Artikelkarten

### Technik

- React 19, Tailwind CSS 4, API-Anbindung an FastAPI
- UI-Prototyp aus Claude Design, produktiv an echte APIs angebunden

---

## 9. Big-Data-Perspektive

**Skalierungspotenzial:**

- RSS/NewsAPI liefern bei regelmäßigem Lauf **tausende Artikel**
- MongoDB: horizontale Sharding-Option, Text-Index auf wachsenden Collections
- Milvus: ANN-Index (IVF_FLAT), bei mehr Daten z. B. HNSW, `nlist` / `nprobe` tunen
- Collector idempotent (Deduplizierung) → wiederholbare Batch-Imports

**Datenpipeline als Batch-Job:** `python collector.py` — typisches Muster für News-Aggregation ohne Kafka (Alternative: später Kafka zwischen Collector und Consumern).

**Limitierungen (ehrlich für die Dokumentation):**

- Gespeichert werden **Teaser/Vorschauen**, keine Volltexte (RSS-/NewsAPI-Limit)
- Kategorisierung heuristisch, nicht ML-basiert
- Embeddings historischer Artikel können von neuer Normalisierungslogik abweichen

---

## 10. Projektstruktur

```
nosql/
├── docker-compose.yml          # MongoDB, Milvus, etcd, MinIO, …
├── backend/
│   ├── main.py                 # FastAPI-Endpoints
│   ├── collector.py            # RSS + NewsAPI Import
│   ├── article_utils.py        # HTML, Sprache, Kategorien, Datum
│   └── migrate_articles.py     # Migration bestehender Artikel
└── newsarchiv/                 # React-Frontend (Vite)
    ├── src/
    │   ├── NewsArchivApp.jsx   # Screens: Dashboard, Suche, Detail
    │   ├── components/         # UI-Bausteine
    │   └── data/articles.js    # Quellen-/Kategorie-Metadaten
    └── PROJEKTBESCHREIBUNG.md  # Diese Datei
```

---

## 11. Zusammenfassung

**NewsArchiv** ist ein **Polyglot-Persistence**-Projekt: Nachrichtenartikel werden aus heterogenen Quellen importiert, in **MongoDB** als flexible Dokumente mit Volltextindex abgelegt und parallel als **Embedding-Vektoren in Milvus** gespeichert. Eine **FastAPI**-Schicht verbindet beide Welten; das **React-Frontend** macht den Unterschied zwischen Keyword- und Semantiksuche für den Nutzer sichtbar.

Das Projekt zeigt:

- sinnvolle Nutzung **zweier NoSQL-Systeme** für unterschiedliche Abfrageparadigmen
- Umgang mit **wachsenden, heterogenen Daten** (Feeds, APIs, HTML, Vektoren)
- eine **End-to-End-Pipeline** von Datenerfassung über Speicherung bis zur interaktiven Auswertung
