"""Rule-based caption screening.

This is a keyword filter, not a classifier. It matches a short list of phrases with word
boundaries and can only approve a caption or flag it for review; it never rejects outright,
because exact-match rules have false positives that a person should look at. There is no
probability behind a match, so none is reported.

What it does not do: understand context, sarcasm, misspellings or other languages, or look
at the image. Image moderation is not implemented anywhere in Novak.

The list favours precision over recall. Bare words like "hate", "attack" or "kill" used to
be on it and rejected captions such as "I hate Mondays" and "panic attack before my exam".
"""

import re

from app.schemas.contracts import TextModerationResult

RULES: dict[str, list[str]] = {
    "sexual_content": ["porn", "porno", "nsfw", "nudes", "xxx"],
    "harassment": ["kill yourself", "kys"],
    "spam": ["free crypto", "guaranteed 1000x", "earn money fast", "click here to claim"],
}

_PATTERNS: dict[str, list[tuple[str, re.Pattern[str]]]] = {
    label: [(term, re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)) for term in terms]
    for label, terms in RULES.items()
}


def screen_text(text: str | None) -> TextModerationResult:
    labels: list[str] = []
    matched: list[str] = []
    for label, patterns in _PATTERNS.items():
        hits = [term for term, pattern in patterns if pattern.search(text or "")]
        if hits:
            labels.append(label)
            matched.extend(hits)

    if not labels:
        return TextModerationResult(status="approved")
    return TextModerationResult(
        status="flagged",
        labels=labels,
        matched_terms=matched,
        reason=f"Held for review: caption matched {', '.join(labels).replace('_', ' ')} rules",
    )
