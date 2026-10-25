import { Response } from "express";

export interface SuccessMeta {
  requestId?: string;
  timestamp?: string;
  cursor?: string;
  hasMore?: boolean;
  total?: number;
}

export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200, meta?: SuccessMeta) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
}
