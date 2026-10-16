import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { globalRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { NotFoundError, ForbiddenError } from "./utils/errors.js";
import { createOriginMatcher } from "./utils/origins.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { postRoutes } from "./modules/posts/posts.routes.js";
import { userRoutes } from "./modules/users/users.routes.js";
import { searchRoutes } from "./modules/search/search.routes.js";

export const isAllowedOrigin = createOriginMatcher(env.CORS_ORIGIN);

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");

  // Security headers. This is a JSON API, so the strict default CSP is fine everywhere.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new ForbiddenError("CORS policy violation: origin not permitted"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      maxAge: 600,
    })
  );

  // Request ID & structured HTTP logging
  app.use((req, res, next) => {
    const reqId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    req.headers["x-request-id"] = reqId;
    res.setHeader("X-Request-Id", reqId);
    next();
  });

  if (env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.headers["x-request-id"] as string,
        autoLogging: { ignore: (req) => req.url?.startsWith("/api/health") ?? false },
      })
    );
  }

  app.use(globalRateLimiter);

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use("/api", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/search", searchRoutes);

  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  app.use(errorHandler);

  return app;
}
