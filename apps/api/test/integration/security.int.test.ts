import zlib from "node:zlib";
import request from "supertest";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupDb, teardown } from "./helpers.js";

let app: Express;

beforeAll(async () => {
  app = await setupDb();
});

afterAll(teardown);

describe("request parsing", () => {
  it("refuses compressed request bodies instead of decompressing them", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "gzip")
      .send(zlib.gzipSync(JSON.stringify({ emailOrUsername: "x", password: "y" })))
      .expect(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  // The body limit is what bounds how much work one request can make Zod do
  // (GHSA-mrhx-c7xc-m3w5: issues accumulate per invalid array element).
  it("rejects bodies over the 100 kB limit with 413", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ emailOrUsername: "x".repeat(110_000), password: "y" })
      .expect(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
