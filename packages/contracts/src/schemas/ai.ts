import { z } from "zod";

export const ModerationRequestSchema = z.object({
  imageUrl: z.string().url().optional(),
  text: z.string().optional(),
});

export type ModerationRequest = z.infer<typeof ModerationRequestSchema>;

export const ModerationResponseSchema = z.object({
  isFlagged: z.boolean(),
  status: z.enum(["approved", "flagged", "rejected"]),
  confidence: z.number(),
  labels: z.array(z.string()),
  scores: z.record(z.string(), z.number()),
});

export type ModerationResponse = z.infer<typeof ModerationResponseSchema>;

export const SemanticSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  filterTag: z.string().optional(),
});

export type SemanticSearchRequest = z.infer<typeof SemanticSearchRequestSchema>;

export const SearchResultItemSchema = z.object({
  postId: z.string(),
  score: z.number(),
  caption: z.string(),
  mediaUrl: z.string(),
  authorUsername: z.string(),
  tags: z.array(z.string()),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SemanticSearchResponseSchema = z.object({
  results: z.array(SearchResultItemSchema),
  total: z.number().int().nonnegative(),
  query: z.string(),
  latencyMs: z.number(),
});

export type SemanticSearchResponse = z.infer<typeof SemanticSearchResponseSchema>;
