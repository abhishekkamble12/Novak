import { z } from "zod";

// Wire format of the FastAPI service's /api/v1/search (camelCase aliases).

export const SemanticSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  filterTag: z.string().optional(),
});

export type SemanticSearchRequest = z.infer<typeof SemanticSearchRequestSchema>;

export const SearchResultItemSchema = z.object({
  postId: z.string(),
  score: z.number(),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SemanticSearchResponseSchema = z.object({
  results: z.array(SearchResultItemSchema),
  total: z.number().int().nonnegative(),
  query: z.string(),
  /** Cosine-similarity floor applied by the AI service; hits below it are dropped. */
  minScore: z.number(),
  latencyMs: z.number(),
});

export type SemanticSearchResponse = z.infer<typeof SemanticSearchResponseSchema>;
