# NewsArchiv — Setup (Details)

Kurzfassung siehe [README](README.md). Voraussetzungen: Docker, Python 3.11+, Node.js 20+.

## 1. Konfiguration

```bash
cp .env.example .env
```

In der `.env` mindestens `MONGO_ROOT_PASSWORD` setzen. Optional: `NEWSAPI_KEY` für den Import über die NewsAPI (ohne Key werden nur RSS-Feeds importiert), `REDIS_URL`, `CACHE_TTL_SECONDS`. Die `.env` wird nicht eingecheckt.

Hinweis: MongoDB legt den Root-Nutzer nur beim ersten Start mit leerem Volume an. Wer bereits Daten mit einem anderen Passwort hat, trägt dieses Passwort ein oder legt das Volume neu an.

## 2. Datenbanken starten

```bash
docker compose up -d mongo-db redis-db milvus milvus-etcd milvus-minio
```

Optional: `attu` (Milvus-Oberfläche) unter http://localhost:3001.

## 3. Python-Umgebung

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## 4. Artikel importieren

```bash
cd backend
python collector.py
```

Bestehende Daten lassen sich mit `python dedupe_articles.py` clustern, `python recluster_stories.py` berechnet alle Story-Cluster mit den aktuellen Schwellenwerten neu.

## 5. Backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

## 6. Frontend

```bash
cd newsarchiv
npm install
npm run dev
```

→ http://localhost:5173

## 7. Tests

```bash
pip install pytest
pytest
```
