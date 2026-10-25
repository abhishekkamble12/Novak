"""Offline evaluation of Novak's caption search.

Compares, on eval/dataset.json:
  * semantic: the production embedder (FastEmbed bge-small-en-v1.5, same document text and
    query instruction as the service) with exact cosine ranking. Qdrant's HNSW index returns
    the same top-k at this size, so this measures the model, not the index.
  * keyword (mongo): the API's real fallback, MongoDB $text over caption + tags + aiTags with
    the production index definition. Needs MongoDB (npm run infra:up); skipped otherwise.
  * keyword (bm25): an in-process BM25 baseline that needs nothing, for reproducibility.

Then picks the semantic score threshold on the dev split and reports it on the test split.

    cd apps/ai-service && python -m eval.run_eval [--mongo mongodb://127.0.0.1:27017]
"""

import argparse
import json
import math
import re
import time
import uuid
from collections import Counter
from pathlib import Path

import numpy as np

from app.api.inference import build_document
from app.models.embedder import embedder
from app.models.tagger import tagger

HERE = Path(__file__).parent
K = 10


# ---------- metrics ----------
def recall_at(ranked, relevant, k):
    return len(set(ranked[:k]) & relevant) / len(relevant)


def mrr(ranked, relevant, k=K):
    for i, pid in enumerate(ranked[:k]):
        if pid in relevant:
            return 1 / (i + 1)
    return 0.0


def ndcg(ranked, relevant, k=K):
    dcg = sum(1 / math.log2(i + 2) for i, pid in enumerate(ranked[:k]) if pid in relevant)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(len(relevant), k)))
    return dcg / ideal


def set_f1(returned, relevant):
    if not returned and not relevant:
        return 1.0
    tp = len(set(returned) & relevant)
    if tp == 0:
        return 0.0
    p, r = tp / len(returned), tp / len(relevant)
    return 2 * p * r / (p + r)


def summarize(rankings, queries):
    """Ranking quality over queries that have relevant posts, per query type."""
    rows = {}
    for qtype in ["lexical", "paraphrase", "all"]:
        qs = [q for q in queries if q["relevant"] and (qtype == "all" or q["type"] == qtype)]
        if not qs:
            continue
        rows[qtype] = {
            "queries": len(qs),
            "recall@5": float(np.mean([recall_at(rankings[q["id"]], set(q["relevant"]), 5) for q in qs])),
            "mrr@10": float(np.mean([mrr(rankings[q["id"]], set(q["relevant"])) for q in qs])),
            "ndcg@10": float(np.mean([ndcg(rankings[q["id"]], set(q["relevant"])) for q in qs])),
            "zero_result_rate": float(np.mean([len(rankings[q["id"]]) == 0 for q in qs])),
        }
    return rows


# ---------- keyword baselines ----------
STOP = set("a an and are as at be by for from has have i in is it its".split()) | set(
    "my of on or our the this to was we with".split()
)


def tokens(text):
    out = []
    for t in re.findall(r"[a-z0-9]+", text.lower()):
        if t in STOP:
            continue
        for suf in ("ing", "ed", "es", "s"):
            if len(t) > len(suf) + 2 and t.endswith(suf):
                t = t[: -len(suf)]
                break
        out.append(t)
    return out


def bm25_rankings(docs, queries, k1=1.2, b=0.75):
    toks = {pid: tokens(text) for pid, text in docs.items()}
    avgdl = np.mean([len(t) for t in toks.values()])
    df = Counter(t for ts in toks.values() for t in set(ts))
    n = len(docs)
    out = {}
    for q in queries:
        scores = {}
        for pid, ts in toks.items():
            tf = Counter(ts)
            s = 0.0
            for term in tokens(q["query"]):
                if term in tf:
                    idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
                    s += idf * tf[term] * (k1 + 1) / (tf[term] + k1 * (1 - b + b * len(ts) / avgdl))
            if s > 0:
                scores[pid] = s
        out[q["id"]] = sorted(scores, key=lambda p: -scores[p])[:K]
    return out


def mongo_rankings(uri, posts, ai_tags, queries):
    try:
        from pymongo import MongoClient
    except ImportError:
        return None, "pymongo not installed (pip install -r requirements-dev.txt)"
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=2000)
        client.admin.command("ping")
    except Exception as e:
        return None, f"MongoDB not reachable at {uri} ({e.__class__.__name__})"

    coll = client["novak_eval"][f"posts_{uuid.uuid4().hex[:8]}"]
    try:
        coll.insert_many(
            [
                {"pid": p["id"], "caption": p["caption"], "tags": p["tags"], "aiTags": ai_tags[p["id"]]}
                for p in posts
            ]
        )
        # Same definition as apps/api/src/modules/posts/post.model.ts
        coll.create_index([("caption", "text"), ("tags", "text"), ("aiTags", "text")])
        out = {}
        for q in queries:
            cur = (
                coll.find({"$text": {"$search": q["query"]}}, {"pid": 1, "score": {"$meta": "textScore"}})
                # pid breaks textScore ties so the baseline is deterministic across runs
                .sort([("score", {"$meta": "textScore"}), ("pid", 1)])
                .limit(K)
            )
            out[q["id"]] = [d["pid"] for d in cur]
        return out, None
    finally:
        coll.drop()


# Regression floors for --check, a little under the measured values in docs/SEARCH_EVAL.md,
# so a model, prompt or document-text change that hurts retrieval fails CI.
CHECKS = {"semantic_ndcg10_all": 0.85, "semantic_paraphrase_recall5": 0.80, "thresholded_test_f1": 0.55}


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mongo", default="mongodb://127.0.0.1:27017")
    ap.add_argument("--out", default=str(HERE / "results.json"))
    ap.add_argument(
        "--check",
        action="store_true",
        help="exit non-zero if semantic quality drops below the floors in CHECKS (used by CI)",
    )
    args = ap.parse_args()

    data = json.loads((HERE / "dataset.json").read_text(encoding="utf-8"))
    posts, queries = data["posts"], data["queries"]

    embedder.load_model()
    if not embedder.is_loaded:
        raise SystemExit("Embedding model failed to load")

    docs = {p["id"]: build_document(p["caption"], p["tags"]) for p in posts}
    ids = list(docs)
    t0 = time.perf_counter()
    doc_vecs = np.array(embedder.embed_documents([docs[i] for i in ids]))
    embed_ms = (time.perf_counter() - t0) * 1000 / len(ids)
    ai_tags = {pid: tagger.text_tags(list(vec)) for pid, vec in zip(ids, doc_vecs, strict=True)}

    # Semantic: full ranked list with scores
    sem_scored, q_ms = {}, []
    for q in queries:
        t0 = time.perf_counter()
        qv = np.array(embedder.embed_query(q["query"]))
        q_ms.append((time.perf_counter() - t0) * 1000)
        sims = doc_vecs @ qv
        order = np.argsort(-sims)[:K]
        sem_scored[q["id"]] = [(ids[i], float(sims[i])) for i in order]
    sem_rank = {qid: [pid for pid, _ in hits] for qid, hits in sem_scored.items()}

    # Threshold: maximise mean set-F1 of the returned hits (top-10, score >= t) on dev
    def mean_f1(t, split):
        qs = [q for q in queries if q["split"] == split]
        return float(
            np.mean([set_f1([p for p, s in sem_scored[q["id"]] if s >= t], set(q["relevant"])) for q in qs])
        )

    grid = [round(x, 3) for x in np.arange(0.40, 0.851, 0.01)]
    sweep = [{"threshold": t, "dev_f1": mean_f1(t, "dev"), "test_f1": mean_f1(t, "test")} for t in grid]
    best = max(sweep, key=lambda r: (r["dev_f1"], -r["threshold"]))
    t_best = best["threshold"]

    def thresholded(t):
        return {qid: [p for p, s in hits if s >= t] for qid, hits in sem_scored.items()}

    def no_answer_fp(rankings, split=None):
        qs = [q for q in queries if q["type"] == "no_answer" and (split is None or q["split"] == split)]
        return float(np.mean([len(rankings[q["id"]]) > 0 for q in qs]))

    test_q = [q for q in queries if q["split"] == "test"]
    systems = {"semantic (no threshold)": sem_rank, f"semantic (min score {t_best})": thresholded(t_best)}
    systems["keyword: bm25"] = bm25_rankings(docs, queries)
    mongo, mongo_err = mongo_rankings(args.mongo, posts, ai_tags, queries)
    if mongo is not None:
        systems["keyword: mongo $text (production fallback)"] = mongo
        # What the API's /search does: thresholded semantic hits, then keyword hits not already shown
        sem_t = thresholded(t_best)
        systems[f"hybrid: semantic>={t_best} then mongo $text"] = {
            qid: list(dict.fromkeys(sem_t[qid] + mongo[qid]))[:K] for qid in sem_t
        }

    report = {
        "dataset": {"posts": len(posts), "queries": len(queries), "test_queries": len(test_q)},
        "model": "BAAI/bge-small-en-v1.5 via FastEmbed (ONNX, CPU)",
        "timing_ms": {
            "embed_document_avg": round(embed_ms, 2),
            "embed_query_p50": round(float(np.percentile(q_ms, 50)), 2),
            "embed_query_p95": round(float(np.percentile(q_ms, 95)), 2),
        },
        "threshold": {"chosen": t_best, "dev_f1": best["dev_f1"], "test_f1": best["test_f1"], "sweep": sweep},
        "mongo_baseline": "ok" if mongo is not None else f"skipped: {mongo_err}",
        "systems": {},
    }
    for name, rankings in systems.items():
        report["systems"][name] = {
            "all_queries": summarize(rankings, queries),
            "test_split": summarize(rankings, test_q),
            "no_answer_queries_returning_results": no_answer_fp(rankings),
            "no_answer_test_returning_results": no_answer_fp(rankings, "test"),
            "test_set_f1": float(np.mean([set_f1(rankings[q["id"]], set(q["relevant"])) for q in test_q])),
        }
    report["per_query"] = {
        q["id"]: {
            "query": q["query"],
            "type": q["type"],
            "relevant": q["relevant"],
            "semantic_top5": [(p, round(s, 3)) for p, s in sem_scored[q["id"]][:5]],
            **({"mongo_top5": mongo[q["id"]][:5]} if mongo else {}),
        }
        for q in queries
    }
    Path(args.out).write_text(json.dumps(report, indent=1), encoding="utf-8")

    # Console summary
    print(f"\n{report['dataset']}  model: {report['model']}")
    print(f"mongo baseline: {report['mongo_baseline']}")
    print(f"chosen min score {t_best}: dev F1 {best['dev_f1']:.3f}, test F1 {best['test_f1']:.3f}\n")
    hdr = f"{'system':52} {'subset':11} {'R@5':>6} {'MRR':>6} {'nDCG':>6} {'0-res':>6}"
    print(hdr)
    print("-" * len(hdr))
    for name, r in report["systems"].items():
        for subset, m in r["all_queries"].items():
            print(
                f"{name:52} {subset:11} {m['recall@5']:6.3f} {m['mrr@10']:6.3f} "
                f"{m['ndcg@10']:6.3f} {m['zero_result_rate']:6.3f}"
            )
        print(
            f"{'':52} no-answer queries returning results: {r['no_answer_queries_returning_results']:.2f}"
            f"   test set-F1: {r['test_set_f1']:.3f}"
        )
    print(f"\ntimings: {report['timing_ms']}\nwrote {args.out}")

    if args.check:
        sem = report["systems"]["semantic (no threshold)"]["all_queries"]
        actual = {
            "semantic_ndcg10_all": sem["all"]["ndcg@10"],
            "semantic_paraphrase_recall5": sem["paraphrase"]["recall@5"],
            "thresholded_test_f1": best["test_f1"],
        }
        failed = {k: (round(v, 3), CHECKS[k]) for k, v in actual.items() if v < CHECKS[k]}
        if failed:
            raise SystemExit(f"search quality regression (actual, floor): {failed}")
        print("quality checks passed:", {k: round(v, 3) for k, v in actual.items()})


if __name__ == "__main__":
    main()
