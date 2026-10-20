// Point the app at a Redis that isn't there. Set before the dynamic imports below so
// src/config/env.ts reads it (each test file gets a fresh module registry).
process.env.REDIS_URL = "redis://127.0.0.1:1";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { setupDb, teardown, registerUser } = await import("./helpers.js");
const { PostModel } = await import("../../src/modules/posts/post.model.js");

let app: Awaited<ReturnType<typeof setupDb>>;

beforeAll(async () => {
  app = await setupDb();
});
afterAll(teardown);

describe("with Redis unavailable", () => {
  it("still publishes posts quickly; the post waits for the reconciler", async () => {
    const user = await registerUser(app, "nored");
    const started = Date.now();
    const res = await request(app)
      .post("/api/posts")
      .set(user.auth)
      .send({ caption: "posted during a Redis outage", mediaUrl: "https://example.com/a.jpg" })
      .expect(201);
    // Enqueue fails fast instead of waiting for Redis to come back
    expect(Date.now() - started).toBeLessThan(3000);
    expect(res.body.data.processingStatus).toBe("pending");
    expect(await PostModel.exists({ _id: res.body.data.id })).toBeTruthy();
  });

  it("reports degraded health with a 503", async () => {
    const res = await request(app).get("/api/health").expect(503);
    expect(res.body.data.services.cache).not.toBe("healthy");
  });
});
