import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 3000);
    logger.warn(`Redis reconnecting, attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
});

redis.on("connect", () => {
  logger.info("Connected to Redis instance");
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis client encountered an error");
});

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info("Redis disconnected gracefully");
}
