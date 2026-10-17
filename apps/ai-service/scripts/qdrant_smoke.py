"""End-to-end check against the Dockerized Qdrant (npm run infra:up), no embedding model needed.

Runs QdrantVectorStore against a throwaway collection: create, upsert, ANN search,
tag-filtered search, delete. Usage from apps/ai-service:  python -m scripts.qdrant_smoke
"""

import random
import sys

from app.config import settings

settings.QDRANT_COLLECTION_POSTS = "novak_smoke_test"

from app.vectorstore.qdrant import qdrant_store  # noqa: E402


def unit(vec: list[float]) -> list[float]:
    norm = sum(x * x for x in vec) ** 0.5
    return [x / norm for x in vec]


def main() -> int:
    if not qdrant_store.connect():
        print("FAIL: start Qdrant first with `npm run infra:up`")
        return 1
    client = qdrant_store.client
    print(f"Qdrant server {client.info().version} at {qdrant_store.target}")

    try:
        rng = random.Random(42)
        anchor = unit([rng.gauss(0, 1) for _ in range(settings.VECTOR_DIM)])
        posts = {}
        for i in range(50):
            # post-0 is a near copy of the anchor; the rest are random
            noise = 0.05 if i == 0 else 10.0
            posts[f"post-{i}"] = unit([a + rng.gauss(0, noise) for a in anchor])
        for post_id, vec in posts.items():
            tags = ["sunset"] if int(post_id.split("-")[1]) % 2 else ["city"]
            assert qdrant_store.upsert_post(post_id, vec, {"caption": post_id, "tags": tags})
        print(f"Upserted {len(posts)} points")

        hits = qdrant_store.search_posts(anchor, limit=3)
        assert hits[0]["post_id"] == "post-0", hits
        print(f"Nearest neighbour: {hits[0]['post_id']} (score {hits[0]['score']:.3f})")

        filtered = qdrant_store.search_posts(anchor, limit=10, filter_tag="sunset")
        assert filtered and all("sunset" in h["payload"]["tags"] for h in filtered)
        print(f"Tag filter 'sunset': {len(filtered)} hits, all tagged correctly")

        qdrant_store.delete_post("post-0")
        assert qdrant_store.search_posts(anchor, limit=1)[0]["post_id"] != "post-0"
        print("Delete removed post-0 from results")
        print("PASS")
        return 0
    finally:
        client.delete_collection(settings.QDRANT_COLLECTION_POSTS)


if __name__ == "__main__":
    sys.exit(main())
