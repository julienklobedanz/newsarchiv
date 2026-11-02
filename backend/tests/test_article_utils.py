from datetime import datetime, timezone

import pytest
from langdetect import DetectorFactory

from article_utils import (
    categorize,
    clean_html,
    is_german,
    normalize_article_url,
    normalize_for_embedding,
    parse_date,
    primary_category,
    resolve_source_from_url,
    similarity_label,
)

DetectorFactory.seed = 0


def test_normalize_for_embedding_lowercases_and_collapses_whitespace():
    assert normalize_for_embedding("  OpenAI   steigt \n ein ") == "openai steigt ein"


def test_normalize_for_embedding_same_vector_input_for_case_variants():
    assert normalize_for_embedding("Klimawandel") == normalize_for_embedding("klimawandel")


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("https://www.Spiegel.de/politik/artikel-a/#kommentare", "https://spiegel.de/politik/artikel-a"),
        ("http://zeit.de/wirtschaft/", "http://zeit.de/wirtschaft"),
        ("https://taz.de/", "https://taz.de/"),
        ("https://heise.de/news?id=5", "https://heise.de/news?id=5"),
        ("", ""),
    ],
)
def test_normalize_article_url(raw, expected):
    assert normalize_article_url(raw) == expected


@pytest.mark.parametrize(
    "url, source",
    [
        ("https://www.spiegel.de/politik/x", "spiegel"),
        ("https://www.sueddeutsche.de/wirtschaft/y", "sz"),
        ("https://newsletter.zeit.de/z", "zeit"),
        ("https://example.com/news", None),
        ("", None),
    ],
)
def test_resolve_source_from_url(url, source):
    assert resolve_source_from_url(url) == source


def test_clean_html_strips_tags_entities_and_teaser_suffix():
    raw = "<p>Hallo<br/>Welt &amp; mehr</p> Continue reading..."
    assert clean_html(raw) == "Hallo Welt & mehr"


def test_clean_html_handles_empty_input():
    assert clean_html("") == ""


def test_parse_date_rfc2822_and_iso():
    rfc = parse_date("Wed, 10 Jun 2026 08:30:00 +0000")
    iso = parse_date("2026-06-10T08:30:00Z")
    assert rfc == iso == datetime(2026, 6, 10, 8, 30, tzinfo=timezone.utc)


@pytest.mark.parametrize("value", ["", "kein datum"])
def test_parse_date_falls_back_to_minimum(value):
    assert parse_date(value) == datetime.min.replace(tzinfo=timezone.utc)


def test_is_german_detects_german_and_rejects_short_text():
    assert is_german("Die Bundesregierung beschließt ein neues Gesetz", "Der Bundestag stimmt am Donnerstag darüber ab.")
    assert not is_german("Kurz", "Text")


def test_categorize_prefers_best_matching_category():
    cats = categorize("Neue Studie zum Klimawandel", "Die Emissionen sinken.", "spiegel")
    assert cats[0] == "klima"
    assert "wissenschaft" in cats


def test_categorize_uses_feed_tags_first():
    assert categorize("Hallo", "Welt", "spiegel", feed_tags=["Wirtschaft"])[0] == "wirtschaft"


def test_categorize_limits_to_three_categories():
    text = "Regierung Klimawandel Börse Forschung Software Fußball"
    assert len(categorize(text, "", "spiegel")) == 3


def test_categorize_falls_back_to_source_hint_or_default():
    assert categorize("Hallo", "Welt", "heise") == ["technik"]
    assert categorize("Hallo", "Welt", "spiegel") == ["gesellschaft"]


def test_primary_category_defaults_when_empty():
    assert primary_category([]) == "gesellschaft"
    assert primary_category(["ki", "technik"]) == "ki"


@pytest.mark.parametrize(
    "score, label",
    [(0.95, "sehr ähnlich"), (0.85, "ähnlich"), (0.75, "verwandt"), (0.5, "thematisch nah")],
)
def test_similarity_label(score, label):
    assert similarity_label(score) == label
