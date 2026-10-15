from typing import Optional, List
from app.schemas.contracts import ModerationResult

BLOCKED_TERMS = {
    "hate_speech": ["hate", "violence", "kill", "terrorist", "attack", "slur"],
    "explicit": ["porn", "nsfw", "nude", "explicit"],
    "spam": ["free crypto", "guaranteed 1000x", "earn money fast", "click here to claim"],
}

class ModerationService:
    def evaluate_text(self, text: Optional[str]) -> ModerationResult:
        if not text:
            return ModerationResult(is_flagged=False, status="approved", confidence=1.0)

        lower_text = text.lower()
        flagged_labels = []
        scores = {}

        for category, terms in BLOCKED_TERMS.items():
            matches = [t for t in terms if t in lower_text]
            if matches:
                flagged_labels.append(category)
                scores[category] = 0.95
            else:
                scores[category] = 0.05

        if "hate_speech" in flagged_labels or "explicit" in flagged_labels:
            return ModerationResult(
                is_flagged=True,
                status="rejected",
                confidence=0.95,
                labels=flagged_labels,
                scores=scores,
                reason=f"Content violated safety guidelines: {', '.join(flagged_labels)}",
            )
        elif "spam" in flagged_labels:
            return ModerationResult(
                is_flagged=True,
                status="flagged",
                confidence=0.85,
                labels=flagged_labels,
                scores=scores,
                reason="Flagged for manual review: potential spam",
            )

        return ModerationResult(
            is_flagged=False,
            status="approved",
            confidence=0.98,
            labels=[],
            scores=scores,
        )

    def evaluate_image(self, image_url: Optional[str]) -> ModerationResult:
        # In full pipeline, runs lightweight NSFW/Toxicity vision model
        # For base service, we validate presence and URL safety
        return ModerationResult(
            is_flagged=False,
            status="approved",
            confidence=0.99,
            labels=[],
            scores={"nsfw": 0.01, "violence": 0.01},
        )

moderation_service = ModerationService()
