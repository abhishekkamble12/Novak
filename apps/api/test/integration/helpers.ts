import mongoose from "mongoose";
import request from "supertest";
import { Redis } from "ioredis";
import type { Express } from "express";
import { createApp } from "../../src/app.js";
import { connectDB } from "../../src/config/db.js";
import { redis } from "../../src/config/redis.js";
import { closePostAnalysis } from "../../src/modules/ai/postAnalysis.queue.js";
import { LikeModel, PostModel } from "../../src/modules/posts/post.model.js";
import { UserModel } from "../../src/modules/users/user.model.js";

export async function setupDb(): Promise<Express> {
  await connectDB();
  // Build indexes up front: the text index is needed by keyword search
  await Promise.all([PostModel.init(), UserModel.init(), LikeModel.init()]);
  return createApp();
}

export async function teardown() {
  await closePostAnalysis();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await redis.quit().catch(() => undefined);
}

export function bullConnection() {
  return new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
}

let counter = 0;

export interface TestUser {
  id: string;
  username: string;
  token: string;
  auth: { Authorization: string };
  cookie: string;
}

export async function registerUser(app: Express, name = "user"): Promise<TestUser> {
  const username = `${name}_${++counter}_${Date.now() % 100000}`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ username, email: `${username}@test.dev`, password: "Passw0rd!", name })
    .expect(201);
  const token = res.body.data.accessToken as string;
  const setCookie = res.headers["set-cookie"] as unknown as string[];
  return {
    id: res.body.data.user.id,
    username,
    token,
    auth: { Authorization: `Bearer ${token}` },
    cookie: setCookie.find((c) => c.startsWith("novak_rt="))!.split(";")[0],
  };
}

export async function createPost(app: Express, user: TestUser, caption = "hello world", tags: string[] = []) {
  const res = await request(app)
    .post("/api/posts")
    .set(user.auth)
    .send({ caption, mediaUrl: "https://example.com/a.jpg", tags })
    .expect(201);
  return res.body.data as { id: string; processingStatus: string; moderationStatus: string };
}
