import re

import numpy as np

from app.models.embedder import embedder

# Zero-shot vocabulary. The caption is scored against "a photo of {label}" for each entry.
LABELS = [
    "architecture",
    "art",
    "beach",
    "bird",
    "books",
    "car",
    "cat",
    "city",
    "coffee",
    "concert",
    "dessert",
    "dog",
    "fashion",
    "fitness",
    "flowers",
    "food",
    "forest",
    "friends",
    "gaming",
    "interior",
    "landscape",
    "makeup",
    "mountains",
    "music",
    "nature",
    "neon",
    "night",
    "ocean",
    "pets",
    "portrait",
    "rain",
    "sky",
    "snow",
    "sports",
    "street",
    "sunset",
    "technology",
    "travel",
    "abstract",
    "anime",
    "bike",
    "desert",
    "drawing",
    "illustration",
    "lake",
    "minimalism",
    "plants",
    "selfie",
    "space",
    "wedding",
    "wildlife",
    "workspace",
]
_PROMPT = "a photo of {}"
_HASHTAG = re.compile(r"#([a-z0-9_-]{1,40})", re.IGNORECASE)

# Sentence-embedding similarities sit in a narrow band (~0.5-0.75), so labels are judged
# relative to the caption's median score: vague captions ("monday vibes") get no tags.
MIN_GAP_OVER_MEDIAN = 0.09
MAX_GAP_FROM_TOP = 0.025


class ZeroShotTagger:
    def __init__(self):
        self._label_matrix: np.ndarray | None = None

    def _labels(self) -> np.ndarray:
        if self._label_matrix is None:
            self._label_matrix = np.array(
                embedder.embed_documents([_PROMPT.format(label) for label in LABELS])
            )
        return self._label_matrix

    def text_tags(self, text_vec: list[float], top_k: int = 3) -> list[str]:
        sims = self._labels() @ np.array(text_vec)
        median, top = float(np.median(sims)), float(sims.max())
        ranked = np.argsort(-sims)[:top_k]
        return [
            LABELS[i]
            for i in ranked
            if sims[i] - median >= MIN_GAP_OVER_MEDIAN and sims[i] >= top - MAX_GAP_FROM_TOP
        ]


def caption_hashtags(caption: str) -> list[str]:
    return [m.lower() for m in _HASHTAG.findall(caption)]


tagger = ZeroShotTagger()
