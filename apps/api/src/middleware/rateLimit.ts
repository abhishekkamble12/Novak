import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis.js";
import { RateLimitError } from "../utils/errors.js";

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true, // Degrade gracefully if Redis is temporarily unreachable
  skip: (req) => req.path === "/api/health",
  store: new RedisStore({
    // @ts-expect-error RedisStore command compatibility with ioredis
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: "rl:global:",
  }),
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
  store: new RedisStore({
    // @ts-expect-error RedisStore command compatibility with ioredis
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: "rl:auth:",
  }),
  handler: (_req, _res, next) => {
    next(new RateLimitError("Too many login/register attempts. Please wait 15 minutes before retrying."));
  },
});
