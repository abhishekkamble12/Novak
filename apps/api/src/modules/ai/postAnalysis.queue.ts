import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import type { PostAnalyzeJob } from "@novak/contracts";
import { env } from "../../config/env.js";
import { createBullConnection } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { emitPostProcessed } from "../../realtime/socket.js";
import { PostModel } from "../posts/post.model.js";
import { analyzePost, AiServiceError, deletePostVector } from "./aiClient.js";
import { markProcessingFailed, processPostAnalysis, type ProcessorDeps } from "./postAnalysis.processor.js";

export const QUEUE_NAME = "post-analysis";
export const MAX_ATTEMPTS = 6;
const ENQUEUE_TIMEOUT_MS = 2000;

let queue: Queue<PostAnalyzeJob> | null = null;
let worker: Worker<PostAnalyzeJob> | null = null;
let reconcileTimer: NodeJS.Timeout | null = null;

const defaultDeps: ProcessorDeps = { analyzePost, deletePostVector, emit: emitPostProcessed };

export function getQueue(): Queue<PostAnalyzeJob> {
  if (!queue) {
    queue = new Queue<PostAnalyzeJob>(QUEUE_NAME, {
      // Producer connection fails fast while Redis is down, so POST /posts never hangs on it
      connection: createBullConnection({ failFast: true }),
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        // 5s, 10s, 20s, 40s, 80s: rides out AI-service cold starts and redeploys
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
    queue.on("error", (err) => logger.warn({ err: err.message }, "post-analysis queue error"));
  }
  return queue;
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * jobId = postId makes enqueueing idempotent: adding a job whose id already exists in Redis
 * (waiting, delayed, active, or kept as completed/failed) is a no-op. `replace` removes a
 * finished job first so the post can be processed again.
 */
export async function enqueuePostAnalysis(
  job: PostAnalyzeJob,
  { replace = false, q = getQueue() }: { replace?: boolean; q?: Queue<PostAnalyzeJob> } = {}
): Promise<void> {
  await withTimeout(
    (async () => {
      if (replace) {
        const existing = await q.getJob(job.postId);
        if (existing && ["completed", "failed"].includes(await existing.getState())) {
          await existing.remove();
        }
      }
      await q.add("analyze", job, { jobId: job.postId });
    })(),
    ENQUEUE_TIMEOUT_MS,
    "Enqueue"
  );
}

export function analyzeJobFor(
  post: {
    _id: { toString(): string };
    caption?: string | null;
    mediaUrl: string;
    tags?: string[];
    createdAt: Date;
  },
  author: { id: string; username: string }
): PostAnalyzeJob {
  return {
    postId: post._id.toString(),
    authorId: author.id,
    authorUsername: author.username,
    mediaUrl: post.mediaUrl,
    caption: post.caption ?? "",
    tags: post.tags ?? [],
    timestamp: post.createdAt.getTime(),
  };
}

export async function handleJob(job: Job<PostAnalyzeJob>, deps: ProcessorDeps = defaultDeps) {
  try {
    const outcome = await processPostAnalysis(
      job.data,
      { attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts ?? 1 },
      deps
    );
    logger.info(
      { postId: job.data.postId, outcome, attempt: job.attemptsMade + 1 },
      "Post analysis finished"
    );
    return outcome;
  } catch (err) {
    // A 4xx means the request itself is wrong (contract mismatch, bad payload): retrying
    // the same payload cannot succeed. 5xx, timeouts and network errors are retried.
    if (err instanceof AiServiceError && err.status && err.status >= 400 && err.status < 500) {
      throw new UnrecoverableError(err.message);
    }
    throw err;
  }
}

/** Called by BullMQ after every failed attempt; records the terminal ones. */
export async function handleFailed(
  job: Job<PostAnalyzeJob> | undefined,
  err: Error,
  emit: ProcessorDeps["emit"] = emitPostProcessed
) {
  if (!job) return;
  const terminal =
    err instanceof UnrecoverableError ||
    err.name === "UnrecoverableError" ||
    job.attemptsMade >= (job.opts.attempts ?? 1);
  logger.warn(
    { postId: job.data.postId, attempt: job.attemptsMade, terminal, err: err.message },
    "Post analysis attempt failed"
  );
  if (terminal) {
    // If this write is lost, the reconciler sees the failed job and repeats it
    await markProcessingFailed(job.data.postId, err.message, emit).catch((e) =>
      logger.error({ err: e, postId: job.data.postId }, "Could not record terminal failure")
    );
  }
}

export interface ReconcileReport {
  scanned: number;
  requeued: number;
  markedFailed: number;
  inFlight: number;
}

/**
 * Converges Redis to Mongo. A post can be "pending" with no job in Redis when the enqueue
 * failed (Redis down at publish time), Redis lost data, or the failure write was lost.
 * Every pending post older than `olderThanMs` is checked against its job:
 *   no job          -> enqueue again
 *   job failed      -> mark the post failed
 *   job completed   -> stale leftover (e.g. legacy data): replace it and run again
 *   waiting/active/delayed -> in flight, leave it (BullMQ recovers stalled active jobs)
 */
export async function reconcilePendingPosts({
  olderThanMs = env.RECONCILE_STALE_MS,
  limit = 100,
  q = getQueue(),
  emit = emitPostProcessed,
}: {
  olderThanMs?: number;
  limit?: number;
  q?: Queue<PostAnalyzeJob>;
  emit?: ProcessorDeps["emit"];
} = {}): Promise<ReconcileReport> {
  const stale = await PostModel.find({
    processingStatus: "pending",
    createdAt: { $lt: new Date(Date.now() - olderThanMs) },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .populate<{ author: { _id: { toString(): string }; username: string } | null }>("author", "username")
    .lean();

  const report: ReconcileReport = { scanned: stale.length, requeued: 0, markedFailed: 0, inFlight: 0 };
  for (const post of stale) {
    const postId = post._id.toString();
    if (!post.author) continue;
    const job = await q.getJob(postId);
    const state = job ? await job.getState() : "missing";

    if (state === "failed") {
      if (await markProcessingFailed(postId, job?.failedReason || "Analysis failed", emit))
        report.markedFailed++;
    } else if (state === "missing" || state === "unknown" || state === "completed") {
      await enqueuePostAnalysis(
        analyzeJobFor(post, { id: post.author._id.toString(), username: post.author.username }),
        { replace: true, q }
      );
      report.requeued++;
    } else {
      report.inFlight++;
    }
  }
  if (report.requeued || report.markedFailed) logger.info(report, "Reconciled pending posts");
  return report;
}

export function startPostAnalysisWorker(): void {
  worker = new Worker<PostAnalyzeJob>(QUEUE_NAME, (job) => handleJob(job), {
    connection: createBullConnection(),
    concurrency: 2,
  });
  worker.on("failed", (job, err) => void handleFailed(job, err));
  worker.on("error", (err) => logger.warn({ err: err.message }, "post-analysis worker error"));

  let running = false;
  reconcileTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await reconcilePendingPosts();
    } catch (err) {
      // Expected while Redis or Mongo is down; the next tick tries again
      logger.warn({ err: (err as Error).message }, "Reconcile pass failed");
    } finally {
      running = false;
    }
  }, env.RECONCILE_INTERVAL_MS);
  reconcileTimer.unref();

  logger.info("Post analysis worker and reconciler started");
}

export async function getQueueCounts() {
  return withTimeout(getQueue().getJobCounts("waiting", "active", "delayed", "failed"), 1000, "Queue counts");
}

export async function closePostAnalysis(): Promise<void> {
  if (reconcileTimer) clearInterval(reconcileTimer);
  await Promise.allSettled([worker?.close(), queue?.close()]);
  worker = null;
  queue = null;
}
