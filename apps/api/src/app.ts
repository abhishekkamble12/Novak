import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "node:crypto";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { globalRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { NotFoundError, ForbiddenError } from "./utils/errors.js";
import { healthRoutes } from "./modules/health/health.routes.js";

export function createApp(): Express {
  const app = express();

  // Trust proxy for reverse proxy setups (Nginx, ALB)
  app.set("trust proxy", 1);

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // CORS Configuration
  const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
          callback(null, true);
        } else {
          callback(new ForbiddenError("CORS policy violation: origin not permitted"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-Internal-Secret"],
    })
  );

  // Request ID & Structured HTTP Logging
  app.use((req, res, next) => {
    const reqId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    res.setHeader("X-Request-Id", reqId);
    next();
  });

  if (env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req.headers["x-request-id"] as string) || crypto.randomUUID(),
        autoLogging: {
          ignore: (req) => req.url === "/api/health",
        },
      })
    );
  }

  // Rate Limiter
  app.use(globalRateLimiter);

  // Body Parsers
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Routes
  app.use("/api", healthRoutes);

  // 404 Handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
