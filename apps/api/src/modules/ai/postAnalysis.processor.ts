import type { PostAnalyzeJob, PostAnalyzedResult, PostProcessedEvent } from "@novak/contracts";
import { logger } from "../../config/logger.js";
import { PostModel } from "../posts/post.model.js";

/**
 * What one delivery of a post-analysis job does. Kept free of BullMQ so it can be tested
 * against a real MongoDB with the AI service stubbed out.
 *
 * Idempotency: the AI service upserts the vector under an id derived from the post id, and
 * the Mongo write below only applies while the post is not yet "completed". Redelivering a
 * job (BullMQ is at-least-once) therefore converges to the same state.
 */

export interface ProcessorDeps {
  analyzePost: (job: PostAnalyzeJob) => Promise<PostAnalyzedResult>;
  deletePostVector: (postId: string) => Promise<void>;
  emit: (authorId: string, event: PostProcessedEvent) => void;
}

export type ProcessOutcome =
  | "completed"
  | "skipped_missing" // post deleted before the job ran
  | "skipped_completed" // duplicate delivery after success
  | "deleted_during_analysis";

export interface AttemptInfo {
  attempt: number; // 1-based
  maxAttempts: number;
}

export async function processPostAnalysis(
  job: PostAnalyzeJob,
  attempt: AttemptInfo,
  deps: ProcessorDeps
): Promise<ProcessOutcome> {
  const post = await PostModel.findById(job.postId).select("processingStatus").lean();
  if (!post) return "skipped_missing";
  if (post.processingStatus === "completed") return "skipped_completed";

  let result: PostAnalyzedResult;
  try {
    result = await deps.analyzePost(job);
  } catch (err) {
    // Recorded so the author (and an operator) can see why it's still pending; BullMQ retries
    await PostModel.updateOne(
      { _id: job.postId, processingStatus: "pending" },
      { $set: { processingAttempts: attempt.attempt, processingError: truncate((err as Error).message) } }
    );
    throw err;
  }

  const { status, reason } = result.moderation;
  const updated = await PostModel.findOneAndUpdate(
    { _id: job.postId, processingStatus: { $ne: "completed" } },
    {
      $set: {
        moderationStatus: status,
        ...(status === "flagged" && reason ? { moderationReason: reason } : {}),
        aiTags: result.tags,
        searchIndexed: result.indexed,
        processingStatus: "completed",
        processingAttempts: attempt.attempt,
        analyzedAt: new Date(),
      },
      $unset: { processingError: 1, ...(status === "approved" ? { moderationReason: 1 } : {}) },
    },
    { new: true }
  )
    .select("author moderationStatus moderationReason aiTags searchIndexed")
    .lean();

  if (!updated) {
    if (await PostModel.exists({ _id: job.postId })) return "skipped_completed";
    // Deleted while the AI service was working: its delete-vector call may have run before
    // our upsert, so remove the vector we just created rather than leave an orphan.
    if (result.indexed) {
      await deps
        .deletePostVector(job.postId)
        .catch((err) => logger.warn({ err, postId: job.postId }, "Failed to remove vector of deleted post"));
    }
    return "deleted_during_analysis";
  }

  deps.emit(updated.author.toString(), {
    postId: job.postId,
    moderationStatus: updated.moderationStatus,
    moderationReason: updated.moderationReason ?? undefined,
    processingStatus: "completed",
    searchIndexed: updated.searchIndexed,
    aiTags: updated.aiTags,
  });
  return "completed";
}

/**
 * Terminal failure: retries exhausted or an unrecoverable error. moderationStatus stays
 * "pending"; a failure is never recorded as an approval. Returns false if the post is gone
 * or no longer pending.
 */
export async function markProcessingFailed(
  postId: string,
  reason: string,
  emit: ProcessorDeps["emit"]
): Promise<boolean> {
  const updated = await PostModel.findOneAndUpdate(
    { _id: postId, processingStatus: "pending" },
    { $set: { processingStatus: "failed", processingError: truncate(reason) } },
    { new: true }
  )
    .select("author moderationStatus aiTags searchIndexed")
    .lean();
  if (!updated) return false;
  emit(updated.author.toString(), {
    postId,
    moderationStatus: updated.moderationStatus,
    processingStatus: "failed",
    searchIndexed: updated.searchIndexed,
    aiTags: updated.aiTags,
  });
  return true;
}

function truncate(message: string, max = 300): string {
  return message.length > max ? `${message.slice(0, max)}…` : message;
}
