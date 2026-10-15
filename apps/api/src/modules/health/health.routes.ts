import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { redis } from "../../config/redis.js";
import { sendSuccess } from "../../utils/responseEnvelope.js";

const router = Router();

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

  return sendSuccess(
    res,
    {
      status: isHealthy ? "healthy" : "degraded",
      services: {
        database: mongoStatus,
        cache: redisStatus,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    isHealthy ? 200 : 503
  );
});

export const healthRoutes = router;
