import { Router } from "express";
import type { z } from "zod";
import { SearchQuerySchema, type PostDto, type SearchResponse } from "@novak/contracts";
import { logger } from "../../config/logger.js";
import { optionalAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/errors.js";
import { sendSuccess } from "../../utils/responseEnvelope.js";
import { semanticSearch } from "../ai/aiClient.js";
import { getPostsByIds, keywordSearch } from "../posts/posts.service.js";

const router = Router();

/**
 * Hybrid ranking: semantic hits above the AI service's score floor first, then MongoDB
 * $text matches not already listed. On the labelled eval set, appending keyword matches lifted
 * recall@5 from 0.71 (semantic above the 0.62 floor) to 0.82 (docs/SEARCH_EVAL.md). The floor
 * itself costs recall (0.89 without it) but stops no-answer queries returning junk.
 * The halves fail independently: the response's mode says which ran, and only when both
 * fail is it a 503.
 */
router.get(
  "/",
  optionalAuth,
  validate({ query: SearchQuerySchema }),
  asyncHandler(async (req, res) => {
    const { q, tag, limit } = req.query as unknown as z.infer<typeof SearchQuerySchema>;
    const viewerId = req.user?.userId;
    const started = Date.now();

    const [semantic, keyword] = await Promise.all([
      semanticSearch(q, limit, tag).catch((err: Error) => {
        // Expected when the AI service or its model is down, so keep it to one line
        logger.warn({ reason: err.message }, "Semantic search unavailable, using keyword search");
        return null;
      }),
      keywordSearch(q, limit, tag, viewerId).catch((err: Error) => {
        logger.error({ err }, "Keyword search failed");
        return null;
      }),
    ]);
    if (!semantic && !keyword) {
      throw new AppError("Search is temporarily unavailable", 503, "SEARCH_UNAVAILABLE");
    }

    let results: PostDto[] = keyword ?? [];
    if (semantic) {
      const scores = new Map(semantic.results.map((r) => [r.postId, r.score]));
      // Hydrate from Mongo: visibility, counts and likes are always current, and posts that
      // were deleted or hidden after indexing are dropped here
      const ranked = (await getPostsByIds([...scores.keys()], viewerId)).map((p) => ({
        ...p,
        score: scores.get(p.id),
      }));
      const seen = new Set(ranked.map((p) => p.id));
      results = [...ranked, ...(keyword ?? []).filter((p) => !seen.has(p.id))].slice(0, limit);
    }

    const response: SearchResponse = {
      results,
      mode: semantic && keyword ? "hybrid" : semantic ? "semantic" : "keyword",
      latencyMs: Date.now() - started,
    };
    sendSuccess(res, response);
  })
);

export const searchRoutes = router;
