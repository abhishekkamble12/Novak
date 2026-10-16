import { z } from "zod";

export const ModerationStatusSchema = z.enum(["pending", "approved", "flagged", "rejected"]);
export type ModerationStatus = z.infer<typeof ModerationStatusSchema>;

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
  mode: z.enum(["semantic", "keyword"]),
  latencyMs: z.number(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const TrendingTagSchema = z.object({ tag: z.string(), count: z.number().int() });
export type TrendingTag = z.infer<typeof TrendingTagSchema>;

/** Job payload sent from the API worker to the AI service (camelCase on the wire). */
export const PostAnalyzeJobSchema = z.object({
  postId: z.string(),
  authorId: z.string(),
  authorUsername: z.string(),
  mediaUrl: z.string().url(),
  caption: z.string(),
  timestamp: z.number(),
});

export type PostAnalyzeJob = z.infer<typeof PostAnalyzeJobSchema>;

export const PostAnalyzedResultSchema = z.object({
  postId: z.string(),
  tags: z.array(z.string()),
  indexed: z.boolean(),
  moderation: z.object({
    isFlagged: z.boolean(),
    status: z.enum(["approved", "flagged", "rejected"]),
    confidence: z.number(),
    labels: z.array(z.string()),
    reason: z.string().nullish(),
  }),
});

export type PostAnalyzedResult = z.infer<typeof PostAnalyzedResultSchema>;

/** Socket.IO event emitted to the author's room when AI analysis finishes. */
export interface PostProcessedEvent {
  postId: string;
  moderationStatus: ModerationStatus;
  aiTags: string[];
}
