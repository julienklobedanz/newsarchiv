# NewsArchiv — NoSQL-Entscheidungen

Warum MongoDB, Milvus und Redis — und warum nicht andere Systeme. Didaktischer Kern des Projekts.

---

## Grundprinzip: Polyglot Persistence

> Nicht eine Datenbank für alles, sondern **die passende Datenbank für jede Abfrageart**.

NewsArchiv speichert dieselben Artikel in unterschiedlichen Formen:

| Form | Datenbank | Abfrage |
|------|-----------|---------|
| Flexibles JSON-Dokument mit Metadaten | MongoDB | Filtern, Sortieren, Volltext |
| 384-dimensionaler Float-Vektor | Milvus | Bedeutungsähnlichkeit |
| Serialisierte API-Antwort | Redis | Schneller Wiederabruf |

---

## MongoDB — Dokumentenspeicher und Keyword-Suche

### Use Case

- Artikel als flexible Dokumente speichern (schemaflexibel)
- Filtern nach Quelle, Kategorie, Zeitraum, Sprache
- Volltextsuche per `$text`-Index auf `title` + `body`
- Aggregationen für Dashboard-Statistiken (`by_source`, `by_category`)
- Pagination und Sortierung

### Warum MongoDB hier passt

- **Heterogene Quellen** (RSS, NewsAPI) liefern unterschiedliche Felder — kein starres relationales Schema nötig
- Felder wie `category`, `language`, `ingest` wurden nachträglich per Migration ergänzt
- Volltextindex ist eingebaut — kein separates Suchsystem für Keyword-Suche nötig
- Aggregation Pipeline für Live-Stats im Dashboard

### Beispiel-Abfragen

```javascript
// Artikelliste mit Filter
db.articles.find({ language: "de", source: "spiegel", category: "politik" })
  .sort({ published_at: -1 }).limit(20)

// Keyword-Suche
db.articles.find({ $text: { $search: "Klimawandel" }, language: "de" })
  .sort({ score: { $meta: "textScore" } })

// Stats
db.articles.aggregate([
  { $match: { language: "de" } },
  { $group: { _id: "$source", count: { $sum: 1 } } }
])
```

---

## Milvus — Vektor-Datenbank und semantische Suche

### Use Case

- 384-dimensionale Embeddings pro Artikel speichern
- Approximate Nearest Neighbor (ANN) Suche per Cosinus-Ähnlichkeit
- „Welche Artikel sind **thematisch ähnlich**, auch ohne exaktes Keyword?"

### Warum Milvus hier passt

- Spezialisiert auf **Vektor-Similarity-Search** in großen Mengen
- ANN-Index (IVF_FLAT) statt Brute-Force-Vergleich aller Vektoren
- Skaliert besser als Vektoren in einem Document Store zu speichern und linear zu vergleichen

### Collection-Schema

```
news_embeddings
├── mongo_id   (VARCHAR)  — Verknüpfung zu MongoDB
├── title      (VARCHAR)  — Kurzinfo (max. 200 Zeichen)
└── embedding  (FLOAT_VECTOR, dim=384)  — Index: COSINE, IVF_FLAT
```

Milvus speichert **keine** vollständigen Artikel — nur Vektor + Referenz. Metadaten kommen bei Bedarf aus MongoDB.

### Embedding-Modell

`paraphrase-multilingual-MiniLM-L12-v2` (Sentence Transformers)

- 384 Dimensionen
- Multilingual (deutsch optimiert)
- Wird beim Import und bei jeder semantischen Suche geladen

---

## Redis — API-Cache

### Use Case

- Teure Lesezugriffe zwischenspeichern (Suche mit Embedding-Berechnung, Aggregationen)
- Cache-Aside-Pattern mit TTL
- Cache-Invalidierung nach Import

### Warum Redis hier passt

- In-Memory — Antworten in Millisekunden statt Sekunden
- Einfaches Key-Value mit TTL — kein Overhead für Cache-Daten
- **Kein Primärspeicher** — nur Performance-Schicht

### TTL-Konfiguration

| Endpoint | TTL | Begründung |
|----------|-----|------------|
| Artikelliste / Detail | 5 Min. | Ändert sich selten zwischen Imports |
| Stats | 2 Min. | Dashboard soll aktuell wirken |
| Suche | 10 Min. | Embedding-Berechnung ist teuer |

---

## Der didaktische Kern: Keyword vs. Semantik

Gleiche Frage, zwei Datenbanken, unterschiedliche Ergebnisse:

| | Keyword (MongoDB) | Semantik (Milvus) |
|--|-----------------|-------------------|
| **Frage** | Enthält der Text das Wort? | Ist der Inhalt thematisch ähnlich? |
| **Beispiel** | „Klimawandel" | „Klimawandel" |
| **Findet** | Artikel mit exaktem Wort | Auch Artikel über Erderwärmung, EU-Klimaziele, CO₂-Emissionen |
| **Findet nicht** | Synonyme, Umschreibungen | Exakte Worttreffer ohne semantische Nähe |
| **Score** | `textScore` (MongoDB) | Cosinus-Ähnlichkeit 0–1 (Milvus) |

Das Frontend zeigt beide Ergebnisse **nebeneinander** — der Unterschied wird für den Nutzer sichtbar.

---

## Warum nicht …?

| Alternative | Warum nicht für NewsArchiv |
|-------------|---------------------------|
| **PostgreSQL** | Die Aufgabenstellung verlangt NoSQL; heterogene Dokumente mit nachträglich ergänzten Feldern sind in MongoDB natürlicher |
| **Nur MongoDB** (inkl. Vector Search) | MongoDB hat seit Version 6.0 Vector Search — aber dann fehlt der didaktische Vergleich zweier NoSQL-Paradigmen (Document Store vs. Vector DB) |
| **Elasticsearch** | Stark für Volltext und Facettierung, aber kein spezialisierter Vektor-Fokus wie Milvus; würde den Kontrast Keyword vs. Semantik verwässern |
| **Elasticsearch + Milvus** | Möglich, aber MongoDB deckt Volltext + Document Store in einem System — weniger Komplexität |
| **Neo4j** | Graph-Datenbank — kein Use Case für Beziehungen zwischen Artikeln (kein „Artikel A verweist auf Artikel B") |
| **Cassandra** | Optimiert für Write-Scale und Partitionierung — schlecht für flexible Volltext- + Filterabfragen |
| **Kafka** | Kein Streaming-Anforderung; Batch-Import (`collector.py`) reicht für den Use Case |
| **Redis als Primärspeicher** | Daten wären bei Neustart weg; Redis ist hier nur Cache |

---

## Skalierungsperspektive

| Komponente | Aktuell | Skalierung |
|------------|---------|------------|
| MongoDB | ~600+ Artikel | Sharding, Replica Sets; Text-Index skaliert mit Collection |
| Milvus | IVF_FLAT Index | Bei mehr Daten: HNSW-Index, `nlist`/`nprobe` tunen |
| Redis | Einzelinstanz | Redis Cluster bei hoher Last |
| Collector | Manueller Batch | Regelmäßiger Cron-Job; später Kafka zwischen Collector und Consumern |
| Embeddings | 384 dim, ein Modell | Größere Modelle (768+ dim) für bessere Qualität auf Kosten von Performance |

---

## Ehrliche Limitierungen

| Limitierung | Erklärung |
|-------------|-----------|
| Nur Teaser | RSS/NewsAPI liefern keine Volltexte |
| Heuristische Kategorisierung | Keyword-Listen, kein ML — erste passende Kategorie gewinnt |
| Embedding-Konsistenz | Historische Artikel können von neuer Normalisierungslogik abweichen |
| Story-Clustering | Schwellenwerte (0.90 / 0.72) sind eingestellte Heuristiken; falsche Zuordnungen sind möglich |
| Kein Echtzeit-Import | Batch-Job, kein Streaming |

---

## Verwandte Dokumente

- [Architektur](./ARCHITEKTUR.md) — Datenflüsse, ID-Modell
- [Import-Pipeline](./IMPORT-PIPELINE.md) — Dual-Speicherung im Detail
- [Herausforderungen & Learnings](./HERAUSFORDERUNGEN-UND-LEARNINGS.md) — Reflexion
- [FAQ](./FAQ.md) — Kurzantworten
