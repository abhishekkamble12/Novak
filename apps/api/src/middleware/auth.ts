import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../utils/errors.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";

export interface AuthenticatedUser {
  userId: string;
  username: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (!token) {
    return next(new UnauthorizedError("Missing or invalid authorization token"));
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.sub, username: payload.username };
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError("Access token has expired", { reason: "TOKEN_EXPIRED" }));
    }
    return next(new UnauthorizedError("Invalid access token"));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { userId: payload.sub, username: payload.username };
    } catch {
      // Continue anonymously; an expired token on a public route is not an error
    }
  }
  return next();
}

/** Narrow req.user after requireAuth has run. */
export function currentUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
