from datetime import datetime

from bson import ObjectId

# Nahezu identisch (z. B. RSS-Doppel derselben Quelle)
SAME_SOURCE_THRESHOLD = 0.90
# Gleiche Story, andere Formulierung / andere Quelle (≥ „verwandt“, z. B. NL-Schülerunfall ~73 %)
CROSS_SOURCE_THRESHOLD = 0.72

MILVUS_CANDIDATES = 20


def _canonical_mongo_id(articles_col, mongo_id: str) -> str | None:
    doc = articles_col.find_one(
        {"_id": ObjectId(mongo_id)},
        {"is_canonical": 1, "duplicate_of": 1, "hidden": 1, "language": 1},
    )
    if not doc or doc.get("language") != "de" or doc.get("hidden"):
        return None
    if doc.get("is_canonical") is False and doc.get("duplicate_of"):
        return doc["duplicate_of"]
    return mongo_id


def _threshold_for(source: str | None, candidate_source: str | None) -> float:
    if source and candidate_source and source == candidate_source:
        return SAME_SOURCE_THRESHOLD
    return CROSS_SOURCE_THRESHOLD


def _published_before(candidate_at, before: datetime | None) -> bool:
    if before is None or candidate_at is None:
        return True
    return candidate_at <= before


def find_story_cluster_match(
    embedding: list,
    source: str | None,
    milvus_col,
    articles_col,
    exclude_mongo_id: str | None = None,
    before_published_at: datetime | None = None,
) -> str | None:
    """Findet kanonischen Artikel einer bestehenden Story (Cross-Source-Schwelle niedriger)."""
    hits = milvus_col.search(
        data=[embedding],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"nprobe": 16}},
        limit=MILVUS_CANDIDATES,
        output_fields=["mongo_id"],
    )

    best_canonical: str | None = None
    best_score = 0.0

    for hit in hits[0]:
        mongo_id = hit.entity.get("mongo_id")
        if exclude_mongo_id and mongo_id == exclude_mongo_id:
            continue

        score = float(hit.distance)
        canonical_id = _canonical_mongo_id(articles_col, mongo_id)
        if not canonical_id or (exclude_mongo_id and canonical_id == exclude_mongo_id):
            continue

        candidate = articles_col.find_one(
            {"_id": ObjectId(canonical_id)},
            {"source": 1, "published_at": 1},
        )
        if not candidate or not _published_before(candidate.get("published_at"), before_published_at):
            continue

        threshold = _threshold_for(source, candidate.get("source"))
        if score < threshold:
            continue

        if score > best_score:
            best_score = score
            best_canonical = canonical_id

    return best_canonical


def find_semantic_duplicate(
    embedding: list,
    milvus_col,
    articles_col,
    exclude_mongo_id: str | None = None,
    source: str | None = None,
) -> str | None:
    return find_story_cluster_match(embedding, source, milvus_col, articles_col, exclude_mongo_id)
