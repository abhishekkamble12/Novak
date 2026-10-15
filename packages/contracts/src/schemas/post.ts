import { z } from "zod";

export const CreatePostInputSchema = z.object({
  caption: z.string().max(2200, "Caption cannot exceed 2200 characters").default(""),
  mediaUrl: z.string().url("Valid media URL is required"),
  mediaType: z.enum(["image", "video"]).default("image"),
  aspectRatio: z.number().positive().default(1),
  tags: z.array(z.string()).default([]),
});

export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;

export const PostDtoSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  authorUsername: z.string(),
  authorAvatarUrl: z.string().optional(),
  caption: z.string(),
  mediaUrl: z.string(),
  mediaType: z.enum(["image", "video"]),
  aspectRatio: z.number(),
  likesCount: z.number().int().nonnegative().default(0),
  commentsCount: z.number().int().nonnegative().default(0),
  hasLiked: z.boolean().default(false),
  hasSaved: z.boolean().default(false),
  moderationStatus: z.enum(["pending", "approved", "flagged", "rejected"]).default("pending"),
  aiTags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PostDto = z.infer<typeof PostDtoSchema>;

export const PostAnalyzeJobSchema = z.object({
  postId: z.string(),
  authorId: z.string(),
  mediaUrl: z.string().url(),
  caption: z.string(),
  timestamp: z.number(),
});

export type PostAnalyzeJob = z.infer<typeof PostAnalyzeJobSchema>;

export const PostAnalyzedResultSchema = z.object({
  postId: z.string(),
  embedding: z.array(z.number()),
  tags: z.array(z.string()),
  moderation: z.object({
    status: z.enum(["approved", "flagged", "rejected"]),
    confidence: z.number(),
    labels: z.array(z.string()),
    reason: z.string().optional(),
  }),
});

export type PostAnalyzedResult = z.infer<typeof PostAnalyzedResultSchema>;
