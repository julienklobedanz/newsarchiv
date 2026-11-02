from datetime import datetime, timedelta
from types import SimpleNamespace

from bson import ObjectId

from duplicate_utils import (
    CROSS_SOURCE_THRESHOLD,
    SAME_SOURCE_THRESHOLD,
    _published_before,
    _threshold_for,
    find_story_cluster_match,
)

NOW = datetime(2026, 6, 10, 12, 0)


class FakeMilvus:
    """Liefert vorgegebene Treffer (mongo_id, Cosinus-Ähnlichkeit) wie Collection.search."""

    def __init__(self, hits):
        self._hits = hits

    def search(self, **_kwargs):
        return [[
            SimpleNamespace(entity=SimpleNamespace(get=lambda _k, m=mongo_id: m), distance=score)
            for mongo_id, score in self._hits
        ]]


class FakeArticles:
    def __init__(self, docs):
        self._docs = {str(oid): {"_id": oid, **doc} for oid, doc in docs.items()}

    def find_one(self, query, _projection=None):
        return self._docs.get(str(query["_id"]))


def article(source, **extra):
    return {"language": "de", "source": source, "published_at": NOW - timedelta(hours=2), **extra}


def test_thresholds_depend_on_source():
    assert _threshold_for("spiegel", "spiegel") == SAME_SOURCE_THRESHOLD
    assert _threshold_for("spiegel", "zeit") == CROSS_SOURCE_THRESHOLD
    assert _threshold_for(None, "zeit") == CROSS_SOURCE_THRESHOLD
    assert CROSS_SOURCE_THRESHOLD < SAME_SOURCE_THRESHOLD


def test_published_before():
    assert _published_before(NOW, None)
    assert _published_before(None, NOW)
    assert _published_before(NOW - timedelta(minutes=1), NOW)
    assert not _published_before(NOW + timedelta(minutes=1), NOW)


def test_cross_source_match_above_threshold_joins_story():
    zeit = ObjectId()
    col = FakeArticles({zeit: article("zeit")})
    match = find_story_cluster_match([0.0], "spiegel", FakeMilvus([(str(zeit), 0.80)]), col)
    assert match == str(zeit)


def test_cross_source_below_threshold_is_not_a_match():
    zeit = ObjectId()
    col = FakeArticles({zeit: article("zeit")})
    assert find_story_cluster_match([0.0], "spiegel", FakeMilvus([(str(zeit), 0.60)]), col) is None


def test_same_source_needs_the_stricter_threshold():
    first, second = ObjectId(), ObjectId()
    col = FakeArticles({first: article("spiegel"), second: article("spiegel")})
    assert find_story_cluster_match([0.0], "spiegel", FakeMilvus([(str(first), 0.80)]), col) is None
    assert find_story_cluster_match([0.0], "spiegel", FakeMilvus([(str(second), 0.95)]), col) == str(second)


def test_hit_on_duplicate_resolves_to_canonical_article():
    canonical, duplicate = ObjectId(), ObjectId()
    col = FakeArticles({
        canonical: article("zeit", is_canonical=True),
        duplicate: article("taz", is_canonical=False, duplicate_of=str(canonical)),
    })
    match = find_story_cluster_match([0.0], "spiegel", FakeMilvus([(str(duplicate), 0.85)]), col)
    assert match == str(canonical)


def test_best_scoring_story_wins():
    low, high = ObjectId(), ObjectId()
    col = FakeArticles({low: article("zeit"), high: article("taz")})
    hits = [(str(low), 0.75), (str(high), 0.91)]
    assert find_story_cluster_match([0.0], "spiegel", FakeMilvus(hits), col) == str(high)


def test_excluded_article_and_newer_candidates_are_skipped():
    me, newer = ObjectId(), ObjectId()
    col = FakeArticles({
        me: article("spiegel"),
        newer: article("zeit", published_at=NOW + timedelta(hours=1)),
    })
    hits = [(str(me), 0.99), (str(newer), 0.95)]
    match = find_story_cluster_match(
        [0.0], "spiegel", FakeMilvus(hits), col, exclude_mongo_id=str(me), before_published_at=NOW
    )
    assert match is None


def test_hidden_and_non_german_articles_are_ignored():
    hidden, english = ObjectId(), ObjectId()
    col = FakeArticles({
        hidden: article("zeit", hidden=True),
        english: {**article("taz"), "language": "en"},
    })
    hits = [(str(hidden), 0.95), (str(english), 0.95)]
    assert find_story_cluster_match([0.0], "spiegel", FakeMilvus(hits), col) is None
