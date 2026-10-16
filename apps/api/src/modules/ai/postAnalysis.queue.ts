import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import type { PostAnalyzeJob } from "@novak/contracts";
import { createBullConnection } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { emitPostProcessed } from "../../realtime/socket.js";
import { PostModel } from "../posts/post.model.js";
import { analyzePost, AiServiceError } from "./aiClient.js";

const QUEUE_NAME = "post-analysis";

let queue: Queue<PostAnalyzeJob> | null = null;
let worker: Worker<PostAnalyzeJob> | null = null;

function getQueue(): Queue<PostAnalyzeJob> {
  if (!queue) {
    queue = new Queue<PostAnalyzeJob>(QUEUE_NAME, {
      connection: createBullConnection(),
      defaultJobOptions: {
        attempts: 6,
        // 5s, 10s, 20s, 40s, 80s: rides out AI-service cold starts and redeploys
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
    queue.on("error", (err) => logger.warn({ err }, "post-analysis queue error"));
  }
  return queue;
}

export async function enqueuePostAnalysis(job: PostAnalyzeJob): Promise<void> {
  // jobId = postId makes enqueueing idempotent
  await getQueue().add("analyze", job, { jobId: job.postId });
}

async function processJob(job: Job<PostAnalyzeJob>) {
  const post = await PostModel.findById(job.data.postId).select("_id author");
  if (!post) {
    logger.info({ postId: job.data.postId }, "Post deleted before analysis; skipping");
    return;
  }

  let result;
  try {
    result = await analyzePost(job.data);
  } catch (err) {
    // 4xx (e.g. the image URL can't be fetched) won't succeed on retry: flag for review
    if (err instanceof AiServiceError && err.status && err.status < 500) {
      await PostModel.updateOne(
        { _id: post._id },
        {
          moderationStatus: "flagged",
          moderationReason: "Image could not be analyzed",
          analyzedAt: new Date(),
        }
      );
      emitPostProcessed(post.author.toString(), {
        postId: job.data.postId,
        moderationStatus: "flagged",
        aiTags: [],
      });
      throw new UnrecoverableError(err.message);
    }
    throw err;
  }
  const { status, reason } = result.moderation;

  const updated = await PostModel.findByIdAndUpdate(
    post._id,
    status === "approved" || !reason
      ? {
          $set: { moderationStatus: status, aiTags: result.tags, analyzedAt: new Date() },
          $unset: { moderationReason: 1 },
        }
      : {
          $set: {
            moderationStatus: status,
            moderationReason: reason,
            aiTags: result.tags,
            analyzedAt: new Date(),
          },
        },
    { new: true }
  )
    .select("author moderationStatus aiTags")
    .lean();

  if (updated) {
    emitPostProcessed(updated.author.toString(), {
      postId: job.data.postId,
      moderationStatus: updated.moderationStatus,
      aiTags: updated.aiTags,
    });
  }
  logger.info({ postId: job.data.postId, status, indexed: result.indexed }, "Post analyzed");
}

export function startPostAnalysisWorker(): void {
  worker = new Worker<PostAnalyzeJob>(QUEUE_NAME, processJob, {
    connection: createBullConnection(),
    concurrency: 2,
  });
  worker.on("failed", (job, err) => {
    logger.warn(
      { postId: job?.data.postId, attempt: job?.attemptsMade, err: err.message },
      "Post analysis failed"
    );
  });
  worker.on("error", (err) => logger.warn({ err }, "post-analysis worker error"));
  logger.info("Post analysis worker started");
}

export async function closePostAnalysis(): Promise<void> {
  await Promise.allSettled([worker?.close(), queue?.close()]);
}
