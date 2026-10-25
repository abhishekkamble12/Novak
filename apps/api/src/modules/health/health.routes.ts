import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { redis } from "../../config/redis.js";
import { getQueueCounts } from "../ai/postAnalysis.queue.js";
import { PostModel } from "../posts/post.model.js";
import { sendSuccess } from "../../utils/responseEnvelope.js";

const router = Router();

// Liveness: the process is up. Readiness (/health) also checks Mongo and Redis.
router.get("/health/live", (_req: Request, res: Response) => {
  // rss and cpu let scripts/bench.mjs report resource use under load
  const cpu = process.cpuUsage();
  sendSuccess(res, {
    status: "alive",
    uptime: process.uptime(),
    rssBytes: process.memoryUsage().rss,
    cpuMicros: cpu.user + cpu.system,
  });
});

router.get("/health", async (_req: Request, res: Response) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? "healthy" : "unhealthy";
  let redisStatus = "unhealthy";

  try {
    const pong = await redis.ping();
    if (pong === "PONG") {
      redisStatus = "healthy";
    }
  } catch {
    redisStatus = "unreachable";
  }

  const isHealthy = mongoStatus === "healthy" && redisStatus === "healthy";

  // Informational: a growing backlog means the AI service is down or too slow. It doesn't
  // change the status code, since posting and keyword search still work.
  const [queue, pendingPosts] = await Promise.all([
    redisStatus === "healthy" ? getQueueCounts().catch(() => null) : null,
    // The createdAt range lets the planner use the small partial "pending_processing" index
    mongoStatus === "healthy"
      ? PostModel.countDocuments({ processingStatus: "pending", createdAt: { $gte: new Date(0) } }).catch(
          () => null
        )
      : null,
  ]);

  return sendSuccess(
    res,
    {
      status: isHealthy ? "healthy" : "degraded",
      services: {
        database: mongoStatus,
        cache: redisStatus,
      },
      pipeline: { queue, pendingPosts },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    isHealthy ? 200 : 503
  );
});

export const healthRoutes = router;
