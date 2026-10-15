import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis.js";
import { RateLimitError } from "../utils/errors.js";

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error RedisStore type compatibility with ioredis
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: "rl:global:",
  }),
  handler: (_req, _res, next) => {
    next(new RateLimitError("Too many requests from this IP. Please try again after 15 minutes."));
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit auth attempts (login/signup)
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error RedisStore type compatibility with ioredis
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: "rl:auth:",
  }),
  handler: (_req, _res, next) => {
    next(new RateLimitError("Too many login/register attempts. Please wait 15 minutes before retrying."));
  },
});
