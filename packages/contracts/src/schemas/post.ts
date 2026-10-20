import { z } from "zod";

export const ModerationStatusSchema = z.enum(["pending", "approved", "flagged", "rejected"]);
export type ModerationStatus = z.infer<typeof ModerationStatusSchema>;

/**
 * Lifecycle of the background analysis job, separate from moderation:
 * pending -> completed, or pending -> failed (retries exhausted / unrecoverable error).
 * A failed post keeps moderationStatus "pending": a failure is never treated as approval.
 */
export const ProcessingStatusSchema = z.enum(["pending", "completed", "failed"]);
export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;

const TagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{1,40}$/, "Tags may only contain letters, numbers, - and _");

export const CreatePostInputSchema = z.object({
  caption: z.string().trim().max(2200, "Caption cannot exceed 2200 characters").default(""),
  mediaUrl: z
    .string()
    .url("Valid media URL is required")
    .refine((u) => u.startsWith("https://"), "Media URL must use https"),
  mediaType: z.enum(["image"]).default("image"),
  aspectRatio: z.number().positive().max(10).default(1),
  tags: z.array(TagSchema).max(20).default([]),
});

export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;

export const PostDtoSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  authorUsername: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.string().optional(),
  caption: z.string(),
  mediaUrl: z.string(),
  mediaType: z.enum(["image"]),
  aspectRatio: z.number(),
  tags: z.array(z.string()),
  likesCount: z.number().int().nonnegative(),
  commentsCount: z.number().int().nonnegative(),
  hasLiked: z.boolean(),
  moderationStatus: ModerationStatusSchema,
  moderationReason: z.string().optional(),
  processingStatus: ProcessingStatusSchema,
  /** True once the caption embedding is stored in Qdrant, i.e. the post is semantically searchable. */
  searchIndexed: z.boolean(),
  aiTags: z.array(z.string()),
  score: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PostDto = z.infer<typeof PostDtoSchema>;

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1, "Query is required").max(200),
  tag: TagSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchResponseSchema = z.object({
  results: z.array(PostDtoSchema),
  /**
   * hybrid: semantic hits (with score) then keyword matches. semantic / keyword: the other
   * half failed (keyword = AI service unavailable).
   */
  mode: z.enum(["hybrid", "semantic", "keyword"]),
  latencyMs: z.number(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const TrendingTagSchema = z.object({ tag: z.string(), count: z.number().int() });
export type TrendingTag = z.infer<typeof TrendingTagSchema>;

/**
 * Result of the AI service's rule-based caption check. It is a keyword filter, not a model:
 * there is no probability, so none is reported. It can only approve or flag for review.
 */
export const TextModerationResultSchema = z.object({
  status: z.enum(["approved", "flagged"]),
  method: z.literal("keyword_rules"),
  labels: z.array(z.string()),
  matchedTerms: z.array(z.string()),
  reason: z.string().nullish(),
});

export type TextModerationResult = z.infer<typeof TextModerationResultSchema>;

/** Job payload sent from the API worker to the AI service (camelCase on the wire). */
export const PostAnalyzeJobSchema = z.object({
  postId: z.string(),
  authorId: z.string(),
  authorUsername: z.string(),
  mediaUrl: z.string().url(),
  caption: z.string(),
  /** Author-supplied hashtags; embedded together with the caption. */
  tags: z.array(z.string()).default([]),
  timestamp: z.number(),
});

export type PostAnalyzeJob = z.infer<typeof PostAnalyzeJobSchema>;

export const PostAnalyzedResultSchema = z.object({
  postId: z.string(),
  tags: z.array(z.string()),
  indexed: z.boolean(),
  moderation: TextModerationResultSchema,
});

export type PostAnalyzedResult = z.infer<typeof PostAnalyzedResultSchema>;

/** Socket.IO event emitted to the author's room when AI analysis finishes. */
export interface PostProcessedEvent {
  postId: string;
  moderationStatus: ModerationStatus;
  moderationReason?: string;
  processingStatus: ProcessingStatus;
  searchIndexed: boolean;
  aiTags: string[];
}
