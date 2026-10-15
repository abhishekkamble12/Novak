import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // If headers are already sent, delegate to Express default error handler
  if (res.headersSent) {
    return _next(err);
  }

  // 1. Handled Operational Errors (AppError)
  if (err instanceof AppError) {
    logger.warn(
      {
        code: err.code,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
      },
      err.message
    );

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // 2. Zod Schema Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));

    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload",
        details: formattedErrors,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // 3. Unhandled Server Exceptions (500)
  logger.error(
    {
      err,
      path: req.path,
      method: req.method,
    },
    "Unhandled Internal Server Error"
  );

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err.message || "Internal server error",
      details: env.NODE_ENV === "development" ? err.stack : undefined,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
