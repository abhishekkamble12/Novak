import hashlib
import numpy as np
from typing import List, Optional
from app.config import settings

class ClipModelService:
    def __init__(self):
        self.device = settings.DEVICE
        self.model = None
        self.preprocess = None
        self.tokenizer = None
        self._is_loaded = False

    def load_model(self):
        try:
            import open_clip
            import torch

            model, _, preprocess = open_clip.create_model_and_transforms(
                settings.CLIP_MODEL_NAME,
                pretrained=settings.CLIP_PRETRAINED,
                device=self.device
            )
            tokenizer = open_clip.get_tokenizer(settings.CLIP_MODEL_NAME)
            self.model = model
            self.preprocess = preprocess
            self.tokenizer = tokenizer
            self._is_loaded = True
            print(f"[CLIP] Loaded model {settings.CLIP_MODEL_NAME} on {self.device}")
        except Exception as e:
            print(f"[CLIP] PyTorch/OpenCLIP not fully initialized or weights missing ({e}). Using deterministic mock embedding.")
            self._is_loaded = False

    def get_text_embedding(self, text: str) -> List[float]:
        if self._is_loaded and self.model is not None:
            import torch
            with torch.no_grad():
                tokens = self.tokenizer([text]).to(self.device)
                features = self.model.encode_text(tokens)
                features /= features.norm(dim=-1, keepdim=True)
                return features.cpu().numpy()[0].tolist()

        # Deterministic normalized vector fallback based on text hash
        return self._generate_fallback_vector(text, settings.VECTOR_DIM)

    def get_image_embedding(self, image_data) -> List[float]:
        if self._is_loaded and self.model is not None and self.preprocess is not None:
            import torch
            with torch.no_grad():
                tensor = self.preprocess(image_data).unsqueeze(0).to(self.device)
                features = self.model.encode_image(tensor)
                features /= features.norm(dim=-1, keepdim=True)
                return features.cpu().numpy()[0].tolist()

        # Fallback pseudo-vector for development
        seed_str = str(getattr(image_data, "size", "fallback_image"))
        return self._generate_fallback_vector(seed_str, settings.VECTOR_DIM)

    def _generate_fallback_vector(self, seed_text: str, dim: int) -> List[float]:
        h = int(hashlib.md5(seed_text.encode("utf-8")).hexdigest(), 16)
        rng = np.random.default_rng(h % (2**32))
        vec = rng.standard_normal(dim)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

clip_service = ClipModelService()
