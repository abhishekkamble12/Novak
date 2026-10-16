import re

import numpy as np

from app.models.clip_loader import clip_service

# Zero-shot vocabulary. CLIP scores the image against "a photo of {label}" for each entry.
LABELS = [
    "architecture", "art", "beach", "bird", "books", "car", "cat", "city", "coffee", "concert",
    "dessert", "dog", "fashion", "fitness", "flowers", "food", "forest", "friends", "gaming",
    "interior", "landscape", "makeup", "mountains", "music", "nature", "neon", "night", "ocean",
    "pets", "portrait", "rain", "sky", "snow", "sports", "street", "sunset", "technology",
    "travel", "abstract", "anime", "bike", "desert", "drawing", "illustration", "lake",
    "minimalism", "plants", "selfie", "space", "wedding", "wildlife", "workspace",
]
_PROMPT = "a photo of {}"
_HASHTAG = re.compile(r"#([a-z0-9_-]{1,40})", re.IGNORECASE)


class ZeroShotTagger:
    def __init__(self):
        self._label_matrix: np.ndarray | None = None

    def _labels(self) -> np.ndarray:
        if self._label_matrix is None:
            self._label_matrix = np.array(
                [clip_service.get_text_embedding(_PROMPT.format(label)) for label in LABELS]
            )
        return self._label_matrix

    def image_tags(self, image_vec: list[float], top_k: int = 3) -> list[str]:
        sims = self._labels() @ np.array(image_vec)
        # Softmax over CLIP's logit scale (100) turns similarities into label probabilities
        probs = np.exp((sims - sims.max()) * 100)
        probs /= probs.sum()
        ranked = np.argsort(-probs)[:top_k]
        return [LABELS[i] for i in ranked if probs[i] >= 0.08]


def caption_hashtags(caption: str) -> list[str]:
    return [m.lower() for m in _HASHTAG.findall(caption)]


tagger = ZeroShotTagger()
