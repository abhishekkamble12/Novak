import crypto from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import type { Express } from "express";
import type { PostAnalyzeJob, PostAnalyzedResult, PostProcessedEvent } from "@novak/contracts";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AiServiceError } from "../../src/modules/ai/aiClient.js";
import { markProcessingFailed, processPostAnalysis } from "../../src/modules/ai/postAnalysis.processor.js";
import {
  analyzeJobFor,
  enqueuePostAnalysis,
  handleFailed,
  handleJob,
  reconcilePendingPosts,
} from "../../src/modules/ai/postAnalysis.queue.js";
import { PostModel } from "../../src/modules/posts/post.model.js";
import { bullConnection, createPost, registerUser, setupDb, teardown, type TestUser } from "./helpers.js";

let app: Express;
let author: TestUser;

beforeAll(async () => {
  app = await setupDb();
  author = await registerUser(app, "author");
});
afterAll(teardown);

const ok = (postId: string, overrides: Partial<PostAnalyzedResult> = {}): PostAnalyzedResult => ({
  postId,
  tags: ["beach"],
  indexed: true,
  moderation: { status: "approved", method: "keyword_rules", labels: [], matchedTerms: [], reason: null },
  ...overrides,
});

function deps(analyze: (job: PostAnalyzeJob) => Promise<PostAnalyzedResult>) {
  const events: PostProcessedEvent[] = [];
  return {
    events,
    analyzePost: vi.fn(analyze),
    deletePostVector: vi.fn(async () => undefined),
    emit: vi.fn((_authorId: string, e: PostProcessedEvent) => void events.push(e)),
  };
}

async function newPost(caption = "golden hour on the beach") {
  const post = await createPost(app, author, caption);
  const doc = await PostModel.findById(post.id).lean();
  return analyzeJobFor(doc!, { id: author.id, username: author.username });
}

const attempt1 = { attempt: 1, maxAttempts: 6 };

describe("processPostAnalysis (one delivery)", () => {
  it("stores the result, marks the post completed and notifies the author", async () => {
    const job = await newPost();
    const d = deps(async () => ok(job.postId));

    expect(await processPostAnalysis(job, attempt1, d)).toBe("completed");

    const doc = await PostModel.findById(job.postId).lean();
    expect(doc).toMatchObject({
      processingStatus: "completed",
      moderationStatus: "approved",
      searchIndexed: true,
      aiTags: ["beach"],
      processingAttempts: 1,
    });
    expect(d.events[0]).toMatchObject({
      postId: job.postId,
      processingStatus: "completed",
      searchIndexed: true,
    });
  });

  it("records a flagged caption with its reason", async () => {
    const job = await newPost("free crypto");
    const reason = "Held for review: caption matched spam rules";
    const d = deps(async () =>
      ok(job.postId, {
        moderation: {
          status: "flagged",
          method: "keyword_rules",
          labels: ["spam"],
          matchedTerms: ["free crypto"],
          reason,
        },
      })
    );
    await processPostAnalysis(job, attempt1, d);
    const doc = await PostModel.findById(job.postId).lean();
    expect(doc).toMatchObject({
      moderationStatus: "flagged",
      moderationReason: reason,
      processingStatus: "completed",
    });
  });

  it("on a retryable error keeps the post pending, records the attempt and rethrows", async () => {
    const job = await newPost();
    const d = deps(async () => {
      throw new AiServiceError("AI service responded 503: model not loaded", 503);
    });
    await expect(processPostAnalysis(job, { attempt: 2, maxAttempts: 6 }, d)).rejects.toThrow("503");
    const doc = await PostModel.findById(job.postId).lean();
    expect(doc).toMatchObject({
      processingStatus: "pending",
      moderationStatus: "pending",
      processingAttempts: 2,
    });
    expect(doc?.processingError).toContain("503");
    expect(d.emit).not.toHaveBeenCalled();
  });

  it("is idempotent: a redelivered job after success does no work", async () => {
    const job = await newPost();
    const d = deps(async () => ok(job.postId));
    await processPostAnalysis(job, attempt1, d);
    expect(await processPostAnalysis(job, attempt1, d)).toBe("skipped_completed");
    expect(d.analyzePost).toHaveBeenCalledTimes(1);
  });

  it("skips posts deleted before the job ran", async () => {
    const job = await newPost();
    await PostModel.deleteOne({ _id: job.postId });
    const d = deps(async () => ok(job.postId));
    expect(await processPostAnalysis(job, attempt1, d)).toBe("skipped_missing");
    expect(d.analyzePost).not.toHaveBeenCalled();
  });

  it("removes the vector when the post was deleted during analysis", async () => {
    const job = await newPost();
    const d = deps(async () => {
      await PostModel.deleteOne({ _id: job.postId });
      return ok(job.postId);
    });
    expect(await processPostAnalysis(job, attempt1, d)).toBe("deleted_during_analysis");
    expect(d.deletePostVector).toHaveBeenCalledWith(job.postId);
  });

  it("a terminal failure never counts as approval", async () => {
    const job = await newPost();
    const d = deps(async () => ok(job.postId));
    expect(await markProcessingFailed(job.postId, "retries exhausted", d.emit)).toBe(true);
    const doc = await PostModel.findById(job.postId).lean();
    expect(doc).toMatchObject({
      processingStatus: "failed",
      moderationStatus: "pending",
      processingError: "retries exhausted",
    });
    expect(d.events[0]).toMatchObject({ processingStatus: "failed" });
    // Only pending posts can fail
    expect(await markProcessingFailed(job.postId, "again", d.emit)).toBe(false);
  });
});

describe("with BullMQ and Redis", () => {
  let queue: Queue<PostAnalyzeJob>;
  let events: QueueEvents;
  let worker: Worker<PostAnalyzeJob> | null = null;
  const connections: ReturnType<typeof bullConnection>[] = [];

  const conn = () => {
    const c = bullConnection();
    connections.push(c);
    return c;
  };

  beforeEach(async () => {
    const name = `test-${crypto.randomBytes(4).toString("hex")}`;
    queue = new Queue<PostAnalyzeJob>(name, {
      connection: conn(),
      defaultJobOptions: { attempts: 3, backoff: { type: "fixed", delay: 50 } },
    });
    events = new QueueEvents(name, { connection: conn() });
    await events.waitUntilReady();
  });

  afterEach(async () => {
    await worker?.close();
    worker = null;
    await queue.obliterate({ force: true });
    await Promise.all([queue.close(), events.close()]);
    await Promise.all(connections.splice(0).map((c) => c.quit()));
  });

  function startWorker(d: ReturnType<typeof deps>) {
    worker = new Worker<PostAnalyzeJob>(queue.name, (job) => handleJob(job, d), { connection: conn() });
    worker.on("failed", (job, err) => void handleFailed(job, err, d.emit));
    return worker;
  }

  const settled = (jobId: string) =>
    new Promise<"completed" | "failed">((resolve) => {
      const done = (state: "completed" | "failed") => (args: { jobId: string; prev?: string }) => {
        if (args.jobId !== jobId) return;
        // "failed" fires per attempt; only resolve once no retry is scheduled
        void queue.getJob(jobId).then(async (j) => {
          const s = j ? await j.getState() : state;
          if (s === "completed" || s === "failed") resolve(s);
        });
      };
      events.on("completed", done("completed"));
      events.on("failed", done("failed"));
    });

  const waitForStatus = async (postId: string, status: string) => {
    for (let i = 0; i < 100; i++) {
      const doc = await PostModel.findById(postId).lean();
      if (doc?.processingStatus === status) return doc;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`post ${postId} never reached ${status}`);
  };

  it("retries transient AI failures with backoff, then completes", async () => {
    const job = await newPost();
    let calls = 0;
    const d = deps(async () => {
      if (++calls < 3) throw new AiServiceError("AI service unreachable: ECONNREFUSED");
      return ok(job.postId);
    });
    startWorker(d);
    const done = settled(job.postId);
    await enqueuePostAnalysis(job, { q: queue });

    expect(await done).toBe("completed");
    const doc = await waitForStatus(job.postId, "completed");
    expect(doc.processingAttempts).toBe(3);
  });

  it("marks the post failed once retries are exhausted", async () => {
    const job = await newPost();
    const d = deps(async () => {
      throw new AiServiceError("AI service responded 503", 503);
    });
    startWorker(d);
    const done = settled(job.postId);
    await enqueuePostAnalysis(job, { q: queue });

    expect(await done).toBe("failed");
    const doc = await waitForStatus(job.postId, "failed");
    expect(d.analyzePost).toHaveBeenCalledTimes(3);
    expect(doc.moderationStatus).toBe("pending");
  });

  it("does not retry a 4xx (the request itself is wrong)", async () => {
    const job = await newPost();
    const d = deps(async () => {
      throw new AiServiceError("AI service responded 422: validation error", 422);
    });
    startWorker(d);
    const done = settled(job.postId);
    await enqueuePostAnalysis(job, { q: queue });

    expect(await done).toBe("failed");
    await waitForStatus(job.postId, "failed");
    expect(d.analyzePost).toHaveBeenCalledTimes(1);
  });

  it("deduplicates repeated enqueues of the same post", async () => {
    const job = await newPost();
    await Promise.all(Array.from({ length: 5 }, () => enqueuePostAnalysis(job, { q: queue })));
    const counts = await queue.getJobCounts("waiting", "delayed", "active");
    expect(counts.waiting + counts.delayed + counts.active).toBe(1);
  });

  it("reconciler re-enqueues a pending post whose enqueue was lost, and the worker finishes it", async () => {
    const job = await newPost(); // createPost enqueued onto the app's queue, not this one
    const d = deps(async () => ok(job.postId));
    startWorker(d);

    const report = await reconcilePendingPosts({ olderThanMs: 0, q: queue, emit: d.emit });
    expect(report.requeued).toBeGreaterThanOrEqual(1);
    await waitForStatus(job.postId, "completed");
  });

  it("reconciler marks a post failed when its job failed but the failure write was lost", async () => {
    const job = await newPost();
    const d = deps(async () => {
      throw new AiServiceError("bad request", 400);
    });
    // Worker without the failed handler: simulates a crash before markProcessingFailed
    worker = new Worker<PostAnalyzeJob>(queue.name, (j) => handleJob(j, d), { connection: conn() });
    const done = settled(job.postId);
    await enqueuePostAnalysis(job, { q: queue });
    await done;
    expect((await PostModel.findById(job.postId).lean())?.processingStatus).toBe("pending");

    await reconcilePendingPosts({ olderThanMs: 0, q: queue, emit: d.emit });
    await waitForStatus(job.postId, "failed");
  });

  it("reconciler leaves in-flight jobs alone", async () => {
    await PostModel.updateMany({ processingStatus: "pending" }, { processingStatus: "completed" });
    const job = await newPost();
    await enqueuePostAnalysis(job, { q: queue }); // waiting, no worker
    const report = await reconcilePendingPosts({ olderThanMs: 0, q: queue });
    expect(report).toMatchObject({ scanned: 1, inFlight: 1, requeued: 0 });
  });

  it("a failed post can be reprocessed after the author retries", async () => {
    const job = await newPost();
    let fail = true;
    const d = deps(async () => {
      if (fail) throw new AiServiceError("bad", 400);
      return ok(job.postId);
    });
    startWorker(d);
    let done = settled(job.postId);
    await enqueuePostAnalysis(job, { q: queue });
    await done;
    await waitForStatus(job.postId, "failed");

    fail = false;
    await PostModel.updateOne({ _id: job.postId }, { processingStatus: "pending" });
    done = settled(job.postId);
    // Without replace, the failed job with the same id would block the new one
    await enqueuePostAnalysis(job, { q: queue, replace: true });
    expect(await done).toBe("completed");
    await waitForStatus(job.postId, "completed");
  });
});
