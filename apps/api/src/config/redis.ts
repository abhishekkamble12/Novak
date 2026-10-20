import { Redis, RedisOptions } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

const sharedRedisOptions: RedisOptions = {
  // Commands fail after 2 reconnect attempts instead of hanging forever.
  // Keep the offline queue enabled: rate-limit-redis issues SCRIPT LOAD at import
  // time, before the connection is ready, and would crash the process otherwise.
  maxRetriesPerRequest: 2,
  // Upper bound per command so a Redis outage costs ~1s per request, not a reconnect cycle
  commandTimeout: 1000,
  enableReadyCheck: true,
  // Railway's private network is IPv6-only; family 0 resolves both IPv4 and IPv6
  family: 0,
  retryStrategy(times) {
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

/**
 * Connections for BullMQ. Workers need maxRetriesPerRequest: null (blocking commands wait
 * out reconnects). Producers pass failFast: commands are rejected immediately while Redis
 * is disconnected instead of queueing, so a request that enqueues can't hang on an outage.
 */
export function createBullConnection({ failFast = false }: { failFast?: boolean } = {}): Redis {
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: failFast ? 1 : null,
    enableOfflineQueue: !failFast,
    enableReadyCheck: true,
    family: 0,
  });
  connection.on("error", (err) => logger.warn({ err }, "BullMQ Redis connection error"));
  return connection;
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info("Redis disconnected gracefully");
  } catch (err) {
    logger.warn({ err }, "Forced Redis disconnect");
  }
}
