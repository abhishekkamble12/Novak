import io

import numpy as np
from PIL import Image

from app.config import settings


class ClipModelService:
    """OpenCLIP wrapper. Image and text embeddings share one vector space, so a text query
    can be matched against image vectors. When torch/open_clip aren't installed the service
    runs without embeddings: moderation still works, semantic search reports unavailable and
    the API falls back to keyword search."""

    def __init__(self):
        self.device = settings.DEVICE
        self.model = None
        self.preprocess = None
        self.tokenizer = None
        self._is_loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def load_model(self):
        try:
            import open_clip

            model, _, preprocess = open_clip.create_model_and_transforms(
                settings.CLIP_MODEL_NAME, pretrained=settings.CLIP_PRETRAINED, device=self.device
            )
            model.eval()
            self.model = model
            self.preprocess = preprocess
            self.tokenizer = open_clip.get_tokenizer(settings.CLIP_MODEL_NAME)
            self._is_loaded = True
            print(f"[CLIP] Loaded model {settings.CLIP_MODEL_NAME} on {self.device}")
        except Exception as e:
            print(f"[CLIP] Model not available ({e}). Running without embeddings.")
            self._is_loaded = False

    def get_text_embedding(self, text: str) -> list[float]:
        import torch

        with torch.no_grad():
            tokens = self.tokenizer([text]).to(self.device)
            features = self.model.encode_text(tokens)
            features /= features.norm(dim=-1, keepdim=True)
            return features.cpu().numpy()[0].tolist()

    def get_image_embedding(self, image_bytes: bytes) -> list[float]:
        import torch

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        with torch.no_grad():
            tensor = self.preprocess(image).unsqueeze(0).to(self.device)
            features = self.model.encode_image(tensor)
            features /= features.norm(dim=-1, keepdim=True)
            return features.cpu().numpy()[0].tolist()

    def get_post_embedding(self, image_vec: list[float], caption: str) -> list[float]:
        """The image vector, nudged towards the caption so search also matches what the
        author wrote. Weighted towards the image, which is the post's primary content."""
        if not caption.strip():
            return image_vec
        # CLIP's text encoder takes 77 tokens; the tokenizer truncates, this just bounds work
        text_vec = np.array(self.get_text_embedding(caption[:300]))
        combined = 0.7 * np.array(image_vec) + 0.3 * text_vec
        return (combined / np.linalg.norm(combined)).tolist()


clip_service = ClipModelService()
