import { Router } from "express";
import type { z } from "zod";
import { SearchQuerySchema, type SearchResponse } from "@novak/contracts";
import { logger } from "../../config/logger.js";
import { optionalAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/responseEnvelope.js";
import { semanticSearch } from "../ai/aiClient.js";
import { getPostsByIds, keywordSearch } from "../posts/posts.service.js";

const router = Router();

router.get(
  "/",
  optionalAuth,
  validate({ query: SearchQuerySchema }),
  asyncHandler(async (req, res) => {
    const { q, tag, limit } = req.query as unknown as z.infer<typeof SearchQuerySchema>;
    const viewerId = req.user?.userId;
    const started = Date.now();

    let response: SearchResponse;
    try {
      const ai = await semanticSearch(q, limit, tag);
      const scores = new Map(ai.results.map((r) => [r.postId, r.score]));
      // Hydrate from Mongo so counts, likes and moderation state are current
      const results = (await getPostsByIds(ai.results.map((r) => r.postId), viewerId)).map((p) => ({
        ...p,
        score: scores.get(p.id),
      }));
      response = { results, mode: "semantic", latencyMs: Date.now() - started };
    } catch (err) {
      // Expected when the AI service runs without CLIP, so keep it to one line
      logger.warn({ reason: (err as Error).message }, "Semantic search unavailable, using keyword search");
      const results = await keywordSearch(q, limit, tag, viewerId);
      response = { results, mode: "keyword", latencyMs: Date.now() - started };
    }

    sendSuccess(res, response);
  })
);

export const searchRoutes = router;
