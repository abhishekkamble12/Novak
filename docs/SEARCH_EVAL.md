# Search evaluation

How well does Novak's caption search work, compared with plain keyword search? Everything below
comes from `apps/ai-service/eval/run_eval.py` on `apps/ai-service/eval/dataset.json`; the raw
output is in `apps/ai-service/eval/results.json`.

```bash
npm run infra:up                       # MongoDB, for the real keyword baseline
cd apps/ai-service && python -m eval.run_eval          # add --check to enforce the CI floors
```

## What is being evaluated

Novak searches **caption text**. Images are never analysed. A post is indexed as
`caption + " " + author tags`, embedded with **BAAI/bge-small-en-v1.5** (384 dimensions, ONNX on
CPU via FastEmbed). Queries go through the model's query instruction (`query_embed`), and
posts are ranked by cosine similarity in Qdrant.

Systems compared:

| System | What it is |
|---|---|
| semantic (no threshold) | Top 10 by cosine similarity |
| semantic (min score 0.62) | Same, dropping hits below the score floor the service applies |
| keyword: mongo $text | **The API's real fallback**: MongoDB `$text` over caption + tags + aiTags, same index definition as production |
| keyword: bm25 | In-process BM25 with light stemming, for runs without MongoDB |
| **hybrid** (what `/api/search` does) | Semantic hits above 0.62 first, then `$text` matches not already listed |

## Dataset

- 62 short, Instagram-style captions across about 20 topics, plus deliberate traps (the same
  "beach" in a sunset post and a rocket-launch post, "python" the snake and the language).
- 36 queries with binary relevance labels:
  - 10 **lexical**: they share words with the relevant captions ("coffee", "snow").
  - 20 **paraphrase**: mostly no shared words ("caffeine fix" → "Third espresso of the day").
  - 6 **no-answer**: nothing relevant exists ("filing my tax return").
- Split: odd query numbers are **dev** (used to choose the threshold); even numbers are **test**.

**Limitations, stated up front:** one person wrote the captions, the queries and the labels, so
the set reflects one vocabulary and one judgement. 36 queries is small: a single query moves
a per-split metric by about 0.05. Treat the numbers as evidence of large differences, not
small ones.

## Results (all 30 queries with relevant posts)

| System | Subset | Recall@5 | MRR@10 | nDCG@10 | Zero-result rate |
|---|---|---|---|---|---|
| semantic (no threshold) | lexical (10) | 0.850 | 1.000 | 0.932 | 0.00 |
| semantic (no threshold) | paraphrase (20) | 0.904 | 0.942 | 0.914 | 0.00 |
| semantic (no threshold) | all (30) | 0.886 | 0.961 | 0.920 | 0.00 |
| semantic (min score 0.62) | all (30) | 0.708 | 0.933 | 0.761 | 0.03 |
| keyword: bm25 | all (30) | 0.239 | 0.483 | 0.289 | 0.47 |
| keyword: mongo $text | lexical (10) | 0.842 | 1.000 | 0.877 | 0.00 |
| keyword: mongo $text | paraphrase (20) | 0.342 | 0.388 | 0.303 | 0.45 |
| keyword: mongo $text | all (30) | 0.508 | 0.592 | 0.494 | 0.30 |
| **hybrid** | lexical (10) | 0.875 | 1.000 | 0.905 | 0.00 |
| **hybrid** | paraphrase (20) | 0.787 | 0.925 | 0.811 | 0.05 |
| **hybrid** | all (30) | **0.817** | **0.950** | **0.842** | 0.03 |

| System | No-answer queries returning results (of 6) | Test-split set F1 |
|---|---|---|
| semantic (no threshold) | 6 | 0.314 |
| semantic (min score 0.62) | 1 | 0.652 |
| keyword: mongo $text | 1 | 0.449 |
| hybrid | 2 | 0.626 |

Set F1 compares the set of results shown with the set of relevant posts. It rewards returning
nothing for a no-answer query.

## What the numbers say

1. **Semantic search matters for paraphrases.** On queries without shared words, `$text` finds
   nothing for 45% of them and reaches nDCG 0.30; the embedding reaches 0.91. On lexical queries
   the two are close (0.93 vs 0.88), as expected.
2. **The `$text` baseline is stronger than plain keyword search** (0.49 vs BM25's 0.29 nDCG)
   because it also indexes `aiTags`, which come from the embedding model (zero-shot tagging). So
   part of the "keyword" result is already semantic.
3. **A score floor is necessary.** Without one, every no-answer query returns 10 confident-looking
   results. With 0.62, five of six return nothing.
4. **The floor costs recall** (0.886 → 0.708 Recall@5), mostly on lexical queries, where a
   caption that clearly contains the word can still score below 0.62. **Hybrid recovers most of
   it** (0.817) by appending `$text` matches, at the cost of one more no-answer query returning a
   result ("basketball championship game" matches a trivia-night post whose AI tag `gaming` Mongo stems
   to *game*).

## Choosing the threshold

The threshold that maximised mean set F1 on the **dev** queries was 0.62 (dev F1 0.701). On the
held-out **test** queries it scores 0.652.

| Threshold | Dev F1 | Test F1 |
|---|---|---|
| 0.55 | 0.443 | 0.508 |
| 0.58 | 0.660 | 0.596 |
| 0.60 | 0.662 | 0.623 |
| **0.62** | **0.701** | 0.652 |
| 0.64 | 0.643 | 0.712 |
| 0.66 | 0.562 | 0.719 |
| 0.70 | 0.467 | 0.433 |

The test optimum is a little higher (0.64–0.66). With 18 queries per split the curve is noisy, so
I kept the dev choice rather than tune on test. The value is **model-specific**: changing
`EMBED_MODEL_NAME` means re-running this eval and resetting `SEARCH_MIN_SCORE`.

## Failure cases worth knowing

| Query | Expected | What happened | Why |
|---|---|---|---|
| "live music" | "Front row at the festival…" | #1 was "Listening to the storm hammer the windows" (0.66) | The model weighs the word *listening*; it has no notion that a storm isn't music |
| "kitty" | 3 cat posts | "Our tabby watching birds…" scored 0.55, under the floor | Breed words like *tabby* sit far from *kitty* for this small model |
| "filing my tax return" | nothing | "Shipped my first open source pull request" scored 0.623 and was shown | "Paperwork / admin task" similarity just above the floor |
| "going on vacation abroad" | 3 travel posts | #1 was "Yoga on the balcony to start the weekend" (0.605) | Leisure and weekend vibes outrank "layover"/"passport" for a short query |

General limits: the model only sees caption text (truncated to 1,000 characters). It doesn't
understand images, sarcasm or most non-English text, and short or vague captions ("monday
vibes") carry almost no signal.

## Latency

On the development laptop (Ryzen 5 5600H, CPU only), embedding a caption takes about 5 ms and a
query 6–9 ms p50 (p95 up to 17 ms when other work competes for the CPU). End-to-end API numbers
are in [BENCHMARKS.md](BENCHMARKS.md).

## Regression gate

CI runs `python -m eval.run_eval --check`, which fails if semantic nDCG@10 drops below 0.85,
paraphrase Recall@5 below 0.80, or the thresholded test F1 below 0.55.
