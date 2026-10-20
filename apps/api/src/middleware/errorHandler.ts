import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

function send(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
    meta: {
      requestId: req.headers["x-request-id"] as string | undefined,
      timestamp: new Date().toISOString(),
    },
  });
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  // 1. Handled operational errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path, method: req.method }, err.message);
    }
    return send(req, res, err.statusCode, err.code, err.message, err.details);
  }

  // 2. Validation errors: surface the first message so the UI can show it directly
  // Name check too: @novak/contracts may load a second copy of zod (CJS vs ESM build),
  // whose ZodError fails instanceof against ours
  if (err instanceof ZodError || err.name === "ZodError") {
    const details = (err as ZodError).errors.map((e) => ({ path: e.path.join("."), message: e.message }));
    return send(req, res, 400, "VALIDATION_ERROR", details[0]?.message ?? "Invalid request", details);
  }

  // 3. body-parser errors (malformed JSON, payload too large) carry a 4xx status
  const status = (err as { status?: number }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const code = status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST";
    return send(req, res, status, code, status === 413 ? "Request body too large" : "Malformed request body");
  }

  // 4. Unhandled exceptions
  logger.error({ err, path: req.path, method: req.method }, "Unhandled Internal Server Error");
  return send(
    req,
    res,
    500,
    "INTERNAL_SERVER_ERROR",
    env.NODE_ENV === "production" ? "An unexpected error occurred" : err.message || "Internal server error",
    env.NODE_ENV === "development" ? err.stack : undefined
  );
}
