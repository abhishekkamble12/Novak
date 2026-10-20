import request from "supertest";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerUser, setupDb, teardown } from "./helpers.js";

let app: Express;

beforeAll(async () => {
  app = await setupDb();
});
afterAll(teardown);

describe("auth", () => {
  it("registers, rejects duplicates, and logs in by username or email", async () => {
    const user = await registerUser(app, "ada");
    const dup = await request(app)
      .post("/api/auth/register")
      .send({ username: user.username, email: "other@test.dev", password: "Passw0rd!", name: "x" });
    expect(dup.status).toBe(409);

    await request(app).post("/api/auth/login").send({ emailOrUsername: user.username, password: "Passw0rd!" }).expect(200);
    await request(app)
      .post("/api/auth/login")
      .send({ emailOrUsername: `${user.username}@test.dev`, password: "Passw0rd!" })
      .expect(200);
    const bad = await request(app).post("/api/auth/login").send({ emailOrUsername: user.username, password: "nope" });
    expect(bad.status).toBe(401);
    // Same message for unknown users: no account enumeration
    const unknown = await request(app).post("/api/auth/login").send({ emailOrUsername: "ghost_user", password: "nope" });
    expect(unknown.body.error.message).toBe(bad.body.error.message);
  });

  it("requires a valid bearer token on protected routes", async () => {
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/auth/me").set("Authorization", "Bearer garbage").expect(401);
    const user = await registerUser(app, "tok");
    const me = await request(app).get("/api/auth/me").set(user.auth).expect(200);
    expect(me.body.data.username).toBe(user.username);
  });

  it("rotates refresh tokens and revokes the session when an old one is replayed", async () => {
    const user = await registerUser(app, "rot");
    const first = await request(app).post("/api/auth/refresh").set("Cookie", user.cookie).expect(200);
    const rotated = (first.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("novak_rt="))!
      .split(";")[0];
    expect(rotated).not.toBe(user.cookie);

    // Replaying the original token is treated as theft...
    const replay = await request(app).post("/api/auth/refresh").set("Cookie", user.cookie).expect(401);
    expect(replay.body.error.details.reason).toBe("REFRESH_TOKEN_REUSE");
    // ...and kills the whole session, including the newest token
    await request(app).post("/api/auth/refresh").set("Cookie", rotated).expect(401);
  });

  it("logout revokes the refresh token", async () => {
    const user = await registerUser(app, "out");
    await request(app).post("/api/auth/logout").set("Cookie", user.cookie).expect(200);
    await request(app).post("/api/auth/refresh").set("Cookie", user.cookie).expect(401);
  });
});
