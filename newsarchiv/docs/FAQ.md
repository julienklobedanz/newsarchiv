# NewsArchiv — FAQ

Kurzantworten auf häufige Fragen — aus Praktikumsvorbereitung und Code-Analyse. Für Details siehe die verlinkten Dokumente.

---

## 1. Sind RSS und NewsAPI wirklich heterogen?

**Ja.** RSS liefert XML mit HTML-`summary`, RFC-2822-Datum und fest konfigurierter Quelle. NewsAPI liefert JSON mit `description`/`content`, ISO-8601-Datum und gemappter Quellen-ID. Beide werden in `import_article()` in ein einheitliches MongoDB-Dokument normalisiert.

→ Details: [Import-Pipeline](./IMPORT-PIPELINE.md#heterogenität-rss-vs-newsapi)

---

## 2. Ist das Caching in der Nutzung spürbar?

**Ja.** Erste identische Suche: `X-Cache: MISS` (Embedding-Berechnung + DB-Abfrage). Zweite Suche: `X-Cache: HIT` (sofort aus Redis). Besonders bei semantischer Suche spürbar, weil `model.encode()` CPU-lastig ist. Cache-TTL für Suchen: 10 Minuten.

→ Details: [Architektur — Caching](./ARCHITEKTUR.md#caching-cache-aside)

---

## 3. Wie hängen MongoDB und Milvus über `mongo_id` und `url_id` zusammen?

**`url_id`** = MD5 der URL — öffentliche ID für Frontend und API (`GET /api/articles/{url_id}`).

**`mongo_id`** = MongoDB `_id` als String — interne Brücke zu Milvus. Milvus speichert nur `mongo_id` + `title` + `embedding`. Bei semantischer Suche liefert Milvus `mongo_id`s, FastAPI lädt die vollständigen Artikel aus MongoDB nach.

→ Details: [Architektur — ID-Modell](./ARCHITEKTUR.md#id-modell-url_id-vs-mongo_id)

---

## 4. Was macht der Collector im Detail?

Batch-Job (`python collector.py`): RSS-Feeds und NewsAPI abrufen, jeden Artikel durch `import_article()` (HTML → Sprache → URL-Dedup → Kategorie → Embedding → Story-Clustering → Dual-Speichern), dann `flush`, Cache leeren, Import-Zeitpunkt speichern.

→ Details: [Import-Pipeline](./IMPORT-PIPELINE.md)

---

## 5. Was macht FastAPI im Detail?

REST-API zwischen Frontend und Datenbanken. Fünf Endpoints für Artikelliste, Einzelartikel, Stats, Keyword-Suche (MongoDB `$text`) und Semantik-Suche (Milvus + MongoDB-Nachladen). Cache-Aside mit Redis, CORS für Vite-Frontend.

→ Details: [Architektur — FastAPI-Endpoints](./ARCHITEKTUR.md#fastapi-endpoints)

---

## 6. Warum genau diese NoSQL-Systeme — und warum nicht andere?

**MongoDB:** Flexible Dokumente, Volltext, Aggregationen — für Keyword-Suche und Metadaten.

**Milvus:** Spezialisiert auf Vektor-Ähnlichkeitssuche — für Semantik.

**Redis:** In-Memory-Cache — Performance, kein Primärspeicher.

Nicht PostgreSQL (NoSQL-Vorgabe), nicht nur MongoDB (didaktischer Vergleich zweier Paradigmen), nicht Elasticsearch (Milvus ist spezialisierter für Vektoren), nicht Neo4j (kein Graph-Use-Case), nicht Kafka (Batch reicht).

→ Details: [NoSQL-Entscheidungen](./NOSQL-ENTSCHEIDUNGEN.md)

---

## 7. Nur Teaser — meine Entscheidung oder Quellenlimit?

**Quellenlimit.** RSS-Feeds liefern nur `summary`. NewsAPI liefert kurze `description` und abgeschnittenes `content` (`"... [+1234 chars]"`). Ich speichere, was die APIs geben.

→ Details: [Import-Pipeline — Limitierung](./IMPORT-PIPELINE.md#limitierung-nur-teaser-kein-volltext)

---

## 8. Warum ist die Kategorisierung nicht perfekt?

Heuristische Keyword-Listen und RSS-Tags — kein ML. Erste passende Kategorie gewinnt. NewsAPI-Artikel haben keine RSS-Tags. Fallback ist `"gesellschaft"`. Ein Artikel über „KI in der Wirtschaft" passt in mehrere Kategorien, bekommt aber nur eine.

→ Details: [Import-Pipeline — Kategorisierung](./IMPORT-PIPELINE.md#④-kategorisierung--categorize)

---

## 9. War Groß-/Kleinschreibung mal ein Problem?

**Ja, bei Embeddings.** `normalize_for_embedding()` wandelt Text in lowercase um, bevor Vektoren berechnet werden. Ohne das erzeugen „Klimawandel" und „klimawandel" unterschiedliche Vektoren. Keyword-Suche (MongoDB `$text`) ist davon weniger betroffen.

→ Details: [Herausforderungen — Embedding-Normalisierung](./HERAUSFORDERUNGEN-UND-LEARNINGS.md#4-embedding-normalisierung-groß-kleinschreibung)

---

## 10. Ist die Duplikaterkennung problematisch?

**Nicht problematisch, aber heuristisch.** URL-Dedup verhindert identische URLs. Semantisch ähnliche Artikel werden nicht verworfen, sondern zu Story-Clustern gruppiert (Cosinus ≥ 0.90 innerhalb einer Quelle, ≥ 0.72 quellenübergreifend). In der App erscheinen sie als „Gleiche Story · N Quellen“. Die Schwellenwerte sind eingestellte Heuristiken, falsche Zuordnungen sind möglich.

→ Details: [Herausforderungen — Duplikate](./HERAUSFORDERUNGEN-UND-LEARNINGS.md#5-semantische-duplikate-vs-multi-source-stories)

---

## 11. Was macht Cache-Invalidierung nach Import — und warum?

`cache.invalidate_all()` löscht alle Redis-Keys mit Präfix `newsarchiv:*`. Nach Import sind Stats, Artikellisten und Suchergebnisse veraltet. Ohne Invalidierung würden bis zu 10 Minuten alte gecachte Antworten geliefert.

→ Details: [Architektur — Caching](./ARCHITEKTUR.md#caching-cache-aside)

---

## 12. Was heißt „Redis optional: API läuft weiter ohne Cache"?

Wenn Redis nicht erreichbar ist, setzt `cache.py` `_enabled = False`. `get_json()` gibt immer `None` zurück (wie Cache-Miss), `set_json()` tut nichts. FastAPI fragt immer MongoDB/Milvus ab — kein Absturz, nur langsamer, Header immer `X-Cache: MISS`. Graceful degradation.

→ Details: [Architektur — Caching](./ARCHITEKTUR.md#caching-cache-aside)

---

## Dokumenten-Übersicht

| Dokument | Inhalt |
|----------|--------|
| [ARCHITEKTUR.md](./ARCHITEKTUR.md) | Systemüberblick, Datenflüsse, IDs, Endpoints |
| [IMPORT-PIPELINE.md](./IMPORT-PIPELINE.md) | Collector, Heterogenität, Import-Schritte |
| [NOSQL-ENTSCHEIDUNGEN.md](./NOSQL-ENTSCHEIDUNGEN.md) | Warum MongoDB, Milvus, Redis |
| [HERAUSFORDERUNGEN-UND-LEARNINGS.md](./HERAUSFORDERUNGEN-UND-LEARNINGS.md) | Reflexion und Learnings |
| [PROJEKTBESCHREIBUNG.md](../PROJEKTBESCHREIBUNG.md) | Offizielle Projektbeschreibung |
