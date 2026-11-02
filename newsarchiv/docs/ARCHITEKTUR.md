# NewsArchiv — Systemarchitektur

Überblick über Aufbau, Datenflüsse und Schnittstellen. Ergänzt die [Projektbeschreibung](../PROJEKTBESCHREIBUNG.md) um technische Details zur Vertiefung.

---

## Gesamtüberblick

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         React-Frontend (Vite)                            │
│                    localhost:5173 — NewsArchivApp.jsx                      │
│         Dashboard │ Suche (Keyword + Semantik) │ Artikel-Detail          │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTP REST
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FastAPI (main.py)                                │
│                         localhost:8000                                   │
│   GET  /api/articles          GET  /api/stats                            │
│   GET  /api/articles/{url_id} POST /api/search/keyword                   │
│                               POST /api/search/semantic                  │
│                                                                          │
│   Cache-Aside: Redis prüfen → bei MISS DB abfragen → cachen            │
└───────┬─────────────────┬──────────────────────┬────────────────────────┘
        │                 │                      │
        ▼                 ▼                      ▼
┌───────────────┐ ┌───────────────┐      ┌───────────────┐
│   MongoDB     │ │    Milvus     │      │    Redis      │
│  Dokumente    │ │   Vektoren    │      │    Cache      │
│  Volltext     │ │  Ähnlichkeit  │      │  (optional)   │
└───────────────┘ └───────────────┘      └───────────────┘
        ▲                 ▲
        │                 │
        └────────┬────────┘
                 │
        ┌────────┴────────┐
        │  collector.py   │  ← Batch-Job (manuell)
        │  RSS + NewsAPI  │
        └─────────────────┘
```

---

## Drei Schichten

| Schicht | Komponente | Aufgabe |
|---------|------------|---------|
| **Datenbeschaffung** | `backend/collector.py` | Artikel importieren, normalisieren, dual speichern |
| **API** | `backend/main.py` | REST-Schnittstelle, Caching, Verknüpfung MongoDB ↔ Milvus |
| **Präsentation** | `newsarchiv/src/` | React-SPA, drei Hauptscreens |

---

## Zwei Datenflüsse

### Schreibpfad (Import)

```
RSS-Feeds / NewsAPI
       │
       ▼
collector.py  →  import_article()
       │
       ├──► MongoDB (volles Dokument)
       └──► Milvus (mongo_id + title + embedding)
```

Läuft als **Batch-Job** (`python collector.py`), nicht dauerhaft im Hintergrund.

### Lesepfad (App-Nutzung)

```
Browser  →  FastAPI  →  Redis (Cache-Hit?)
                            │
                     MISS   ▼
                     ├── MongoDB  (Listen, Detail, Keyword-Suche, Stats)
                     └── Milvus   (Semantische Suche) → MongoDB nachladen
```

---

## Docker-Infrastruktur

Gestartet über `docker-compose.yml` im übergeordneten `nosql/`-Verzeichnis:

| Service | Port | Rolle für NewsArchiv |
|---------|------|----------------------|
| `mongo-db` | 27017 | Primärspeicher für Artikel |
| `milvus` | 19530 | Vektor-Datenbank |
| `milvus-etcd` | — | Metadaten für Milvus |
| `milvus-minio` | 9001 | Objektspeicher für Milvus |
| `redis-db` | 6379 | API-Cache (optional) |

Weitere Services im Compose-File (Neo4j, Hadoop) gehören **nicht** zu NewsArchiv.

---

## ID-Modell: `url_id` vs. `mongo_id`

Zwei IDs mit unterschiedlichen Rollen:

```
┌─────────────────────────────────────────────────────────────┐
│  MongoDB: newsarchiv.articles                               │
│                                                             │
│  _id        ObjectId  ──► wird als mongo_id (String)        │
│                           in Milvus gespeichert             │
│                                                             │
│  url_id     MD5(URL)  ──► öffentliche ID fürs Frontend      │
│                           GET /api/articles/{url_id}      │
│                           Lesezeichen, Navigation           │
│                                                             │
│  title, body, source, category, published_at, ingest, …    │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ mongo_id (Verknüpfung)
         │
┌────────┴────────────────────┐
│  Milvus: news_embeddings    │
│  mongo_id   (FK → MongoDB)  │
│  title      (Kurzinfo)      │
│  embedding  (384 Floats)    │
└─────────────────────────────┘
```

**Warum zwei IDs?**

- `url_id` ist stabil, URL-basiert und für die API/Navigation geeignet.
- `mongo_id` ist der native MongoDB-Primärschlüssel und wird in Milvus als Fremdschlüssel verwendet.
- Milvus speichert absichtlich **keine** vollständigen Artikelmetadaten — nur Vektor + Referenz.

### Ablauf semantische Suche

1. Suchbegriff → Embedding berechnen
2. Milvus liefert Treffer mit `mongo_id` + Cosinus-Score
3. FastAPI lädt jeden Treffer aus MongoDB per `ObjectId(mongo_id)`
4. Antwort enthält `url_id` für das Frontend

---

## FastAPI-Endpoints

| Endpoint | Methode | Datenquelle | Cache-TTL |
|----------|---------|-------------|-----------|
| `/api/articles` | GET | MongoDB (Filter, Pagination, Sort) | 5 Min. |
| `/api/articles/{url_id}` | GET | MongoDB (Einzelartikel) | 5 Min. |
| `/api/articles/{url_id}/related` | GET | Milvus + MongoDB (ähnliche Artikel) | 10 Min. |
| `/api/stories` | GET | MongoDB (Story-Cluster mit mehreren Quellen) | 5 Min. |
| `/api/stories/{cluster_id}` | GET | MongoDB (alle Artikel einer Story) | 5 Min. |
| `/api/stats` | GET | MongoDB (Aggregationen) | 2 Min. |
| `/api/insights/*` | GET | MongoDB (Timeline, Quellen, Trend-Kategorien, Import-Status) | 3 Min. |
| `/api/search/keyword` | POST | MongoDB `$text` | 10 Min. |
| `/api/search/semantic` | POST | Milvus + MongoDB | 10 Min. |
| `/api/image` | GET | Bild-Proxy | kein Cache |

### Keyword-Suche

- MongoDB-Volltextindex auf `title` und `body`
- `$text: { $search: query }` mit `textScore`-Sortierung
- Filter für Quelle, Kategorie, Zeitraum werden zusätzlich angewendet

### Semantische Suche

1. Query normalisieren (`normalize_for_embedding`)
2. Embedding mit `paraphrase-multilingual-MiniLM-L12-v2` (384 Dimensionen)
3. Milvus ANN-Search (Cosinus, `nprobe: 10`)
4. Treffer nachladen und filtern (Quelle, Kategorie, Zeitraum in Python)
5. Score als Ähnlichkeitswert anhängen

### Ähnliche Artikel (Detailseite)

`GET /api/articles/{url_id}/related` sucht über Milvus Artikel mit ähnlichem Inhalt, lässt den Artikel selbst und Mitglieder derselben Story aus und liefert Treffer mit Ähnlichkeitslabel („sehr ähnlich“, „ähnlich“, „verwandt“, „thematisch nah“).

### Stories

Artikel zur selben Meldung bilden einen Story-Cluster (`story_cluster_id`, `is_canonical`, `cluster_size`). `/api/stories` listet Stories mit mindestens zwei Quellen, `/api/stories/{cluster_id}` liefert alle Mitglieder.

---

## Caching (Cache-Aside)

```
Request
   │
   ▼
Cache-Key bauen (Namespace + Parameter-Hash)
   │
   ▼
Redis GET ──► HIT?  ──► Antwort + Header X-Cache: HIT
   │
  MISS
   │
   ▼
MongoDB / Milvus abfragen
   │
   ▼
Redis SET (TTL) + Antwort + Header X-Cache: MISS
```

- Key-Präfix: `newsarchiv:`
- Such-Cache-Keys nutzen normalisierte Queries (Groß-/Kleinschreibung irrelevant)
- Nach `collector.py`: `cache.invalidate_all()` löscht alle Keys

**Graceful degradation:** Wenn Redis nicht erreichbar ist, arbeitet die API ohne Cache weiter — nur langsamer, immer `X-Cache: MISS`. Siehe [FAQ](./FAQ.md#12-was-heißt-redis-optional).

---

## Frontend-Struktur

| Screen | Datei / Komponente | API-Aufrufe |
|--------|-------------------|-------------|
| Dashboard | `NewsArchivApp.jsx` | `/api/stats`, `/api/articles` |
| Suche | `NewsArchivApp.jsx` | `/api/search/keyword`, `/api/search/semantic` |
| Artikel-Detail | `NewsArchivApp.jsx` | `/api/articles/{url_id}`, `/api/search/semantic` |

UI-Bausteine: `NewsArchivUI.jsx` (`ArticleTile`, `ResultCard`, `BookmarkButton`, …)

Client-seitig (localStorage): Suchverlauf, Lesezeichen — keine Server-Persistenz.

---

## Verwandte Dokumente

- [Import-Pipeline](./IMPORT-PIPELINE.md) — Collector und Datenverarbeitung
- [NoSQL-Entscheidungen](./NOSQL-ENTSCHEIDUNGEN.md) — Warum MongoDB, Milvus, Redis
- [FAQ](./FAQ.md) — Kurzantworten auf häufige Fragen
