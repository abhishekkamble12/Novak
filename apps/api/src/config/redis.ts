import { Redis, RedisOptions } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

const sharedRedisOptions: RedisOptions = {
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  enableReadyCheck: true,
  retryStrategy(times) {
    if (times > 5) {
      logger.error("Redis retry limit reached. Failing fast.");
      return null;
    }
    const delay = Math.min(times * 200, 2000);
    logger.warn(`Redis reconnecting, attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
};

// Fail-fast client for app caching, rate limiting, and health checks
export const redis = new Redis(env.REDIS_URL, sharedRedisOptions);

redis.on("connect", () => {
  logger.info("Connected to Redis instance");
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis client encountered an error");
});

// Dedicated factory for BullMQ which requires maxRetriesPerRequest: null
export function createBullConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info("Redis disconnected gracefully");
  } catch (err) {
    logger.warn({ err }, "Forced Redis disconnect");
  }
}
