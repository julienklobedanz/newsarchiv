# NewsArchiv

A personal news archive that collects German-language articles from RSS feeds and the NewsAPI and makes them searchable in two ways: **by keyword** and **by meaning**. I built it on my own as a NoSQL / Big Data course project to compare a document store with a vector database on the same data.

<!-- TODO: add a dashboard screenshot as docs/img/dashboard.png and embed it here -->

## What it does

- **Keyword search** with MongoDB full-text index (`$text`, ranked by text score)
- **Semantic search** with multilingual sentence embeddings (384 dimensions) stored in Milvus. A query for "Klimawandel" also finds related articles that never use the word, and the UI marks those hits
- **Story clusters**: articles about the same event from different outlets are grouped into one story ("Gleiche Story · 3 Quellen") instead of being dropped as duplicates
- **Cache-aside layer** in Redis with TTLs and cache invalidation after each import. The API keeps working without Redis
- **Dashboard** with filters (source, category, time range), insights (timeline, sources, trending categories), bookmarks and a related-articles view

## Architecture

```
RSS feeds (12) / NewsAPI
        │
        ▼
 collector.py ── clean HTML → language filter → URL dedup → categorize
        │                     → embedding → story clustering
        ├──► MongoDB   full article documents, text index, story-cluster fields
        └──► Milvus    384-dim embeddings (cosine), linked by mongo_id

 React (Vite) ──► FastAPI ──► Redis (cache-aside) ──► MongoDB / Milvus
```

Each database does what it is good at (polyglot persistence): MongoDB for flexible documents and keyword search, Milvus for similarity search, Redis for hot read paths. The reasoning, including why not PostgreSQL or Elasticsearch, is in [`newsarchiv/docs/NOSQL-ENTSCHEIDUNGEN.md`](newsarchiv/docs/NOSQL-ENTSCHEIDUNGEN.md).

## Tech stack

Python 3.11, FastAPI, MongoDB, Milvus, Redis, sentence-transformers (`paraphrase-multilingual-MiniLM-L12-v2`), React 19, Vite, Tailwind CSS 4, Docker Compose.

## Quick start

Requires Docker, Python 3.11+ and Node.js 20+.

```bash
cp .env.example .env            # set MONGO_ROOT_PASSWORD, optionally NEWSAPI_KEY
docker compose up -d mongo-db redis-db milvus milvus-etcd milvus-minio

python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

cd backend
python collector.py                       # first import (RSS, plus NewsAPI if a key is set)
uvicorn main:app --reload --port 8000     # API

cd ../newsarchiv && npm install && npm run dev   # UI on http://localhost:5173
```

The compose file binds all ports to `127.0.0.1` and is meant for local development only. The MinIO credentials in it are the Milvus defaults.

More detail: [`SETUP.md`](SETUP.md) (German).

## Tests

```bash
pip install pytest
pytest
```

The unit tests cover the pure logic of the pipeline: URL and text normalization, date parsing, categorization, and the story-matching rules (source-dependent thresholds, canonical-article resolution) against fake Milvus and MongoDB collections. The database-backed paths are not covered by automated tests.

## What went wrong first

- **Duplicates:** My first version dropped articles that were semantically too similar to an existing one. The archive stayed clean, but it hid the interesting fact that several outlets cover the same story. I replaced it with story clusters and source-dependent thresholds (0.90 within one source, 0.72 across sources).
- **Embeddings are sensitive to input:** "OpenAI" and "openai" produced noticeably different vectors until I normalized text before every `encode()` call.
- **Two databases drift apart:** Keeping MongoDB and Milvus in sync needs a shared id and explicit re-import and migration scripts.

The full write-up is in [`newsarchiv/docs/HERAUSFORDERUNGEN-UND-LEARNINGS.md`](newsarchiv/docs/HERAUSFORDERUNGEN-UND-LEARNINGS.md).

## How it was built

I designed the architecture, data pipeline and database choices myself and used AI assistance for the implementation: Cursor for code and a Claude Design prototype for the UI, which I then connected to the real API.

## Limitations

- Only teasers, no full texts. RSS and the NewsAPI free tier do not deliver them
- Categories come from keyword rules and RSS tags, not from a classifier
- Story clusters use hand-tuned similarity thresholds, so wrong groupings are possible
- Imports run as a batch job, not as a stream

## Documentation (German)

[Project description](newsarchiv/PROJEKTBESCHREIBUNG.md) · [Architecture](newsarchiv/docs/ARCHITEKTUR.md) · [Import pipeline](newsarchiv/docs/IMPORT-PIPELINE.md) · [NoSQL decisions](newsarchiv/docs/NOSQL-ENTSCHEIDUNGEN.md) · [Challenges and learnings](newsarchiv/docs/HERAUSFORDERUNGEN-UND-LEARNINGS.md) · [FAQ](newsarchiv/docs/FAQ.md)

## Notes on content

NewsArchiv stores titles, teasers and links that publishers provide through public RSS feeds and the NewsAPI. Publisher names and logos belong to their respective owners and are only used to identify sources. The repository contains no article data.

## License

MIT, see [`LICENSE`](LICENSE).
