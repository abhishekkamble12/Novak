import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis.js";
import { RateLimitError } from "../utils/errors.js";

function createRedisStore(prefix: string): RedisStore {
  const store = new RedisStore({
    // @ts-expect-error RedisStore command compatibility with ioredis
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix,
  });
  // RedisStore sends SCRIPT LOAD from its constructor. If Redis isn't ready yet, that
  // promise rejects with no handler and crashes Node. The store reloads the script on
  // first use anyway, so swallowing the startup rejection is safe.
  store.incrementScriptSha.catch(() => undefined);
  store.getScriptSha.catch(() => undefined);
  return store;
}

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true, // Degrade gracefully if Redis is temporarily unreachable
  skip: (req) => req.path === "/api/health",
  store: createRedisStore("rl:global:"),
  handler: (_req, _res, next) => {
    next(new RateLimitError("Too many requests from this IP. Please try again after 15 minutes."));
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: createRedisStore("rl:auth:"),
  handler: (_req, _res, next) => {
    next(new RateLimitError("Too many login/register attempts. Please wait 15 minutes before retrying."));
  },
});
