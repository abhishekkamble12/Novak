import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { LikeModel, PostModel } from "../../src/modules/posts/post.model.js";
import { createPost, registerUser, setupDb, teardown, type TestUser } from "./helpers.js";

let app: Express;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  app = await setupDb();
  alice = await registerUser(app, "alice");
  bob = await registerUser(app, "bob");
});

afterAll(teardown);

describe("creating posts", () => {
  it("returns 201 with the post pending analysis", async () => {
    const post = await createPost(app, alice, "first post");
    expect(post.processingStatus).toBe("pending");
    expect(post.moderationStatus).toBe("pending");
    expect(await PostModel.exists({ _id: post.id })).toBeTruthy();
  });

  it("rejects unauthenticated, invalid and malformed requests", async () => {
    await request(app).post("/api/posts").send({ mediaUrl: "https://x.dev/a.jpg" }).expect(401);
    const bad = await request(app).post("/api/posts").set(alice.auth).send({ mediaUrl: "http://x.dev/a.jpg" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    await request(app)
      .post("/api/posts")
      .set({ ...alice.auth, "Content-Type": "application/json" })
      .send("{bad json")
      .expect(400);
  });

  it("returns 400 for a malformed id and 404 for a missing post", async () => {
    await request(app).get("/api/posts/not-an-id").expect(400);
    await request(app).get("/api/posts/65f000000000000000000000").expect(404);
  });
});

describe("visibility", () => {
  let flaggedId: string;
  let rejectedId: string;

  beforeAll(async () => {
    flaggedId = (await createPost(app, alice, "free crypto flagged post")).id;
    rejectedId = (await createPost(app, alice, "rejected post")).id;
    await PostModel.updateOne(
      { _id: flaggedId },
      { moderationStatus: "flagged", moderationReason: "spam", processingStatus: "completed" }
    );
    await PostModel.updateOne({ _id: rejectedId }, { moderationStatus: "rejected", processingStatus: "completed" });
  });

  const feedIds = async (user?: TestUser) => {
    const req = request(app).get("/api/posts/feed?limit=50");
    const res = await (user ? req.set(user.auth) : req).expect(200);
    return res.body.data.map((p: { id: string }) => p.id) as string[];
  };

  it("hides flagged posts from everyone but the author, on every read path", async () => {
    expect(await feedIds(alice)).toContain(flaggedId);
    expect(await feedIds(bob)).not.toContain(flaggedId);
    expect(await feedIds()).not.toContain(flaggedId);

    await request(app).get(`/api/posts/${flaggedId}`).set(alice.auth).expect(200);
    await request(app).get(`/api/posts/${flaggedId}`).set(bob.auth).expect(404);
    await request(app).get(`/api/posts/${flaggedId}`).expect(404);

    const profile = await request(app).get(`/api/users/${alice.username}/posts?limit=50`).set(bob.auth).expect(200);
    expect(profile.body.data.map((p: { id: string }) => p.id)).not.toContain(flaggedId);

    // Keyword search (AI service is unreachable in this suite)
    const search = await request(app).get("/api/search?q=crypto").set(bob.auth).expect(200);
    expect(search.body.data.mode).toBe("keyword");
    expect(search.body.data.results.map((p: { id: string }) => p.id)).not.toContain(flaggedId);
    const ownSearch = await request(app).get("/api/search?q=crypto").set(alice.auth).expect(200);
    expect(ownSearch.body.data.results.map((p: { id: string }) => p.id)).toContain(flaggedId);
  });

  it("does not let other users like a hidden post", async () => {
    await request(app).post(`/api/posts/${flaggedId}/like`).set(bob.auth).expect(404);
  });

  it("hides rejected posts from the author too", async () => {
    expect(await feedIds(alice)).not.toContain(rejectedId);
    await request(app).get(`/api/posts/${rejectedId}`).set(alice.auth).expect(404);
  });
});

describe("feed pagination", () => {
  it("returns every post exactly once when many share a timestamp", async () => {
    const carol = await registerUser(app, "carol");
    const sameInstant = new Date("2030-01-01T00:00:00Z");
    await PostModel.insertMany(
      Array.from({ length: 25 }, (_, i) => ({
        author: carol.id,
        caption: `tie ${i}`,
        mediaUrl: "https://example.com/t.jpg",
        createdAt: sameInstant,
        updatedAt: sameInstant,
        moderationStatus: "approved",
        processingStatus: "completed",
      }))
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await request(app)
        .get(`/api/users/${carol.username}/posts`)
        .query({ limit: 10, ...(cursor ? { cursor } : {}) })
        .expect(200);
      seen.push(...res.body.data.map((p: { id: string }) => p.id));
      cursor = res.body.meta.cursor;
      if (!res.body.meta.hasMore) break;
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });

  it("does not duplicate or skip when new posts arrive between pages", async () => {
    const dave = await registerUser(app, "dave");
    for (let i = 0; i < 6; i++) await createPost(app, dave, `dave ${i}`);
    const first = await request(app).get(`/api/users/${dave.username}/posts?limit=3`).expect(200);
    await createPost(app, dave, "arrived later");
    const second = await request(app)
      .get(`/api/users/${dave.username}/posts`)
      .query({ limit: 3, cursor: first.body.meta.cursor })
      .expect(200);
    const captions = [...first.body.data, ...second.body.data].map((p: { caption: string }) => p.caption);
    expect(captions).toEqual(["dave 5", "dave 4", "dave 3", "dave 2", "dave 1", "dave 0"]);
  });

  it("rejects a tampered cursor and an out-of-range limit", async () => {
    await request(app).get("/api/posts/feed?cursor=abc").expect(400);
    await request(app).get("/api/posts/feed?limit=500").expect(400);
  });
});

describe("likes", () => {
  it("counts concurrent likes from one user once", async () => {
    const post = await createPost(app, alice, "likeable");
    const results = await Promise.all(
      Array.from({ length: 20 }, () => request(app).post(`/api/posts/${post.id}/like`).set(bob.auth))
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const doc = await PostModel.findById(post.id).lean();
    expect(doc?.likesCount).toBe(1);
    expect(await LikeModel.countDocuments({ post: post.id })).toBe(1);
  });

  it("keeps the counter equal to the like documents after a like/unlike storm", async () => {
    const post = await createPost(app, alice, "storm");
    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        i % 2
          ? request(app).post(`/api/posts/${post.id}/like`).set(bob.auth)
          : request(app).delete(`/api/posts/${post.id}/like`).set(bob.auth)
      )
    );
    const doc = await PostModel.findById(post.id).lean();
    expect(doc?.likesCount).toBe(await LikeModel.countDocuments({ post: post.id }));
  });

  it("unlike without a like is a no-op", async () => {
    const post = await createPost(app, alice, "never liked");
    const res = await request(app).delete(`/api/posts/${post.id}/like`).set(bob.auth).expect(200);
    expect(res.body.data.likesCount).toBe(0);
  });
});

describe("ownership", () => {
  it("only the author can delete a post", async () => {
    const post = await createPost(app, alice, "mine");
    await request(app).delete(`/api/posts/${post.id}`).set(bob.auth).expect(403);
    await request(app).delete(`/api/posts/${post.id}`).set(alice.auth).expect(200);
    expect(await PostModel.exists({ _id: post.id })).toBeNull();
  });

  it("only the author can retry analysis, and only when it failed", async () => {
    const post = await createPost(app, alice, "retry me");
    await request(app).post(`/api/posts/${post.id}/reprocess`).set(alice.auth).expect(409);

    await PostModel.updateOne({ _id: post.id }, { processingStatus: "failed", processingError: "boom" });
    await request(app).post(`/api/posts/${post.id}/reprocess`).set(bob.auth).expect(403);
    const res = await request(app).post(`/api/posts/${post.id}/reprocess`).set(alice.auth).expect(202);
    expect(res.body.data.processingStatus).toBe("pending");
    const doc = await PostModel.findById(post.id).lean();
    expect(doc?.processingError).toBeUndefined();
  });
});

describe("hybrid search", () => {
  it("ranks semantic hits first, appends keyword matches, and drops hidden or deleted posts", async () => {
    const erin = await registerUser(app, "erin");
    const semanticHit = await createPost(app, erin, "golden hour by the sea");
    const keywordHit = await createPost(app, erin, "sunset over parking lot");
    const hidden = await createPost(app, erin, "sunset flagged");
    await PostModel.updateOne({ _id: hidden.id }, { moderationStatus: "flagged" });
    const deletedId = "65f0000000000000000000ff";

    // Stand-in for the AI service: returns ids in ranked order, including stale ones
    const stub = http.createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          results: [
            { postId: semanticHit.id, score: 0.81 },
            { postId: hidden.id, score: 0.7 },
            { postId: deletedId, score: 0.65 },
          ],
          total: 3,
          query: "sunset",
          minScore: 0.62,
          latencyMs: 3,
        })
      );
    });
    await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
    const original = env.AI_SERVICE_URL;
    env.AI_SERVICE_URL = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
    try {
      const res = await request(app).get("/api/search?q=sunset").set(bob.auth).expect(200);
      const ids = res.body.data.results.map((p: { id: string }) => p.id);
      expect(res.body.data.mode).toBe("hybrid");
      expect(ids[0]).toBe(semanticHit.id);
      expect(res.body.data.results[0].score).toBe(0.81);
      expect(ids).toContain(keywordHit.id);
      expect(ids).not.toContain(hidden.id);
      expect(ids).not.toContain(deletedId);
      expect(new Set(ids).size).toBe(ids.length);

      // Keyword half broken (e.g. text index missing): semantic results still come back
      await PostModel.collection.dropIndex("caption_text_tags_text_aiTags_text");
      const semanticOnly = await request(app).get("/api/search?q=sunset").set(bob.auth).expect(200);
      expect(semanticOnly.body.data.mode).toBe("semantic");
      expect(semanticOnly.body.data.results[0].id).toBe(semanticHit.id);
    } finally {
      env.AI_SERVICE_URL = original;
      stub.close();
    }

    // Both halves down: a clear 503, not a 500
    const down = await request(app).get("/api/search?q=sunset").expect(503);
    expect(down.body.error.code).toBe("SEARCH_UNAVAILABLE");
    await PostModel.syncIndexes();
  });
});
