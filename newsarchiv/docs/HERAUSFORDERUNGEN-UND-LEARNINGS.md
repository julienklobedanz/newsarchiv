# NewsArchiv — Herausforderungen & Learnings

Reflexion: Was war schwierig, was habe ich gelernt, was würde ich anders machen.

---

## Einordnung: Implementierung vs. Konzeption

Ich habe NewsArchiv allein entwickelt und die Code-Umsetzung mit KI-Unterstützung (Cursor) beschleunigt. Das verschiebt die eigentliche Arbeit:

| Bereich | Aufwand |
|---------|---------|
| Syntax, Boilerplate, UI-Komponenten | Geringer (KI-unterstützt) |
| Architekturentscheidungen (welche DB wofür?) | Hoch — bewusste Designentscheidungen |
| Datenpipeline (Normalisierung, Dedup, Embedding) | Hoch — fachliches Verständnis nötig |
| Integration (Docker, zwei DBs, Cache) | Mittel — typische DevOps-Hürden |
| Didaktischer Kern sichtbar machen (Keyword vs. Semantik) | Hoch — Produktentscheidung |

Die inhaltliche Arbeit lag nicht beim Tippen, sondern bei den Entscheidungen in den Zeilen mit hohem Aufwand.

---

## Herausforderungen

### 1. Heterogene Quelldaten normalisieren

RSS und NewsAPI liefern dieselbe Information in unterschiedlichen Formaten:

- XML vs. JSON
- HTML-Teaser vs. Plaintext-Beschreibungen
- RFC-2822-Datum vs. ISO-8601
- Quellen-ID unterschiedlich benannt (`spiegel-online` vs. `spiegel`)

**Lösung:** Einheitliche `import_article()`-Pipeline mit `clean_html()`, `parse_date()`, `resolve_newsapi_source()` und festem MongoDB-Dokumentschema.

**Learning:** Heterogenität ist nicht nur ein Buzzword — sie zeigt sich in konkreten Feldunterschieden, die aktiv normalisiert werden müssen.

---

### 2. Zwei Datenbanken synchron halten

MongoDB speichert das volle Dokument, Milvus nur `mongo_id` + Vektor. Beide müssen beim Import konsistent befüllt werden.

**Herausforderung:**
- `mongo_id` erst nach `insert_one()` bekannt → Milvus-Insert danach
- Semantische Suche: Milvus liefert IDs → MongoDB-Nachladen nötig
- Kein transaktionaler Dual-Write über beide Systeme

**Lösung:** `mongo_id` als String-Brücke; FastAPI orchestriert beide DBs bei Lesezugriffen.

**Learning:** Polyglot Persistence erfordert explizite Verknüpfungslogik — das ist Architekturarbeit, nicht nur „zwei DBs anschließen".

---

### 3. Docker-Stack mit Milvus

Milvus benötigt etcd (Metadaten) und MinIO (Objektspeicher) — drei Container statt einer Datenbank.

**Herausforderungen:**
- Längere Startzeit als MongoDB allein
- Port-Konflikte (z. B. Attu auf 8000 vs. FastAPI auf 8000)
- `milvus_col.flush()` nach Import nicht vergessen

**Learning:** Spezialisierte NoSQL-Systeme haben eigene Infrastruktur-Anforderungen — das ist Teil des Trade-offs.

---

### 4. Embedding-Normalisierung (Groß-/Kleinschreibung)

Ohne Normalisierung erzeugen „Klimawandel" und „klimawandel" leicht unterschiedliche Vektoren. „OpenAI" vs. „openai" verschlechtert die Ähnlichkeitssuche.

**Lösung:** `normalize_for_embedding()` — lowercase + Whitespace-Bereinigung vor jedem `model.encode()`.

**Learning:** Semantische Suche ist empfindlicher als Keyword-Suche. Kleine Inkonsistenzen in der Eingabe haben große Auswirkungen auf Vektorqualität.

---

### 5. Semantische Duplikate vs. Multi-Source-Stories

Dieselbe Meldung erscheint oft bei Spiegel, Zeit und taz — mit unterschiedlichen URLs.

**Erster Ansatz:** Neue Artikel mit Cosinus-Ähnlichkeit ≥ 0.92 zu einem vorhandenen Artikel habe ich beim Import **verworfen**. Das hielt das Archiv sauber, aber man sah nicht mehr, dass mehrere Zeitungen über dieselbe Geschichte berichten.

**Heutige Lösung (Story-Cluster):** Ähnliche Artikel werden gespeichert und zu einer Story gruppiert. Der älteste Artikel ist der kanonische Artikel, alle weiteren verweisen mit `duplicate_of` auf ihn und teilen die `story_cluster_id`; `cluster_size` zählt die Berichte. Die Schwelle hängt von der Quelle ab: innerhalb derselben Quelle 0.90 (fast identische RSS-Doppel), quellenübergreifend 0.72 (gleiche Story, andere Formulierung). In der App zeigt der Tab „Stories“ Meldungen mit mehreren Quellen als gestapelte Karte (`StoryStackCard`), die Detailansicht (`StorySheet`) listet alle Quellen, und Artikelkarten tragen das Badge „Gleiche Story · N Quellen“. `recluster_stories.py` berechnet die Cluster mit neuen Schwellenwerten komplett neu.

**Learning:** Technische Dedup-Logik und Produktwert können in Konflikt stehen — Verwerfen ist sauber, Clustern ist nützlicher. Die Schwellen sind Heuristiken, die ich an echten Artikeln eingestellt habe: zu niedrig bündelt Unverwandtes, zu hoch trennt dieselbe Geschichte.

---

### 6. Heuristische Kategorisierung

Kategorien werden per Keyword-Listen und RSS-Tags zugewiesen — kein ML-Modell.

**Probleme:**
- Ein Artikel über „KI in der Wirtschaft" passt in mehrere Kategorien — es gewinnt nur die erste
- NewsAPI-Artikel haben keine RSS-Tags
- Fallback `"gesellschaft"` ist unspezifisch

**Learning:** Einfache Heuristiken reichen für Filter-Dropdowns, aber Qualität hat Grenzen. Für Produktion: ML-Klassifikation oder LLM-basiertes Tagging.

---

### 7. Cache-Invalidierung nach Import

Ohne Invalidierung würden gecachte Suchergebnisse und Stats bis zu 10 Minuten veraltet bleiben — obwohl neue Artikel importiert wurden.

**Lösung:** `cache.invalidate_all()` nach jedem `collector.py`-Lauf.

**Learning:** Caching ist nicht nur „schneller machen" — Invalidierungsstrategie ist Teil der Architektur.

---

### 8. Betrieb und Debugging

Typische Integrationsprobleme:

- Alter uvicorn-Prozess ohne `--reload` lieferte veralteten Code
- Redis-Cache musste nach Codeänderungen manuell geleert werden
- Embedding-Modell lädt beim API-Start (~2–3 Sekunden)

**Learning:** Auch mit KI-generiertem Code gilt: Systemverständnis für Debugging ist unverzichtbar.

---

## Learnings

1. **Nicht jede Abfrage braucht dieselbe Datenbank** — Document Store und Vector DB sind komplementär, nicht konkurrierend.

2. **NoSQL heißt nicht schemafrei im Chaos** — ein konsistentes Artikelmodell mit Migrationen ist trotzdem nötig.

3. **Caching ist Architektur, nicht nur Optimierung** — TTL, Invalidierung und graceful degradation gehören zum Design.

4. **Semantische Suche braucht UI-Erklärung** — Nutzer verstehen Keyword-Suche intuitiv, Embedding-Suche nicht. Die violette Markierung „enthält das Suchwort nicht" ist bewusst.

5. **KI beschleunigt Implementierung, ersetzt aber nicht Verständnis** — Architektur, Datenqualität und NoSQL-Trade-offs bleiben menschliche Entscheidungen.

6. **Heterogenität ist messbar** — nicht abstrakt, sondern in konkreten Feldunterschieden zwischen RSS und NewsAPI.

7. **Ehrliche Limitierungen gehören dazu** — Teaser only, heuristische Kategorien und Cluster-Schwellen sind dokumentiert, nicht versteckt.

---

## Was ich anders machen würde

| Thema | Aktuell | Alternative |
|-------|---------|-------------|
| Cluster-Schwellen | Von Hand an Beispielen eingestellt | Evaluation an gelabelten Story-Paaren |
| Kategorisierung | Keyword-Heuristik | ML-Klassifikation oder LLM-Tagging |
| Import | Manueller Batch | Cron-Job oder Kafka-Pipeline |
| Volltext | Nur Teaser | Scraping oder kostenpflichtige API |
| Embeddings | Ein Modell für alles | Separate Modelle für Titel vs. Body |
| Monitoring | `X-Cache`-Header | Strukturiertes Logging, Metriken |

---

## Fazit

Die Umsetzung ging mit KI-Unterstützung schneller. Die eigentlichen Herausforderungen lagen bei der Systemarchitektur, der Datenpipeline und dem Nachweis, dass zwei NoSQL-Systeme für unterschiedliche Abfragen wirklich unterschiedliche Ergebnisse liefern.

---

## Verwandte Dokumente

- [NoSQL-Entscheidungen](./NOSQL-ENTSCHEIDUNGEN.md) — Architektur-Begründung
- [Import-Pipeline](./IMPORT-PIPELINE.md) — Dedup, Normalisierung
- [FAQ](./FAQ.md) — Kurzantworten auf häufige Fragen
