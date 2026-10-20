import pytest

from app.models.moderation import screen_text

# Captions the old bare-word blocklist ("hate", "attack", "kill", ...) auto-rejected
BENIGN = [
    "I hate Mondays but this coffee helps",
    "Panic attack before my exam, sunset walk helped",
    "Killing it at the gym today",
    "Heart attack burger at the diner",
    "Violence in films: an essay",
    "Explicit instructions for building a birdhouse",
    "",
]

FLAGGED = [
    ("Free crypto for everyone who follows!", "spam"),
    ("Click here to claim your prize", "spam"),
    ("NSFW content inside", "sexual_content"),
    ("just kys already", "harassment"),
]


@pytest.mark.parametrize("caption", BENIGN)
def test_benign_captions_are_approved(caption):
    result = screen_text(caption)
    assert result.status == "approved"
    assert result.labels == []


@pytest.mark.parametrize(("caption", "label"), FLAGGED)
def test_rule_matches_are_flagged_not_rejected(caption, label):
    result = screen_text(caption)
    assert result.status == "flagged"
    assert label in result.labels
    assert result.matched_terms
    assert result.reason


def test_matches_whole_words_only():
    # "pornography" is not in the list and "xxx" must not match inside a word
    assert screen_text("Saxxxophone practice").status == "approved"


def test_reports_method_and_no_fabricated_scores():
    payload = screen_text("free crypto").model_dump(by_alias=True)
    assert payload["method"] == "keyword_rules"
    assert "confidence" not in payload
    assert "scores" not in payload
