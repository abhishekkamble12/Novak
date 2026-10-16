import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";

const ISSUER = "novak-api";
const AUDIENCE = "novak-web";

const accessPayloadSchema = z.object({ sub: z.string(), username: z.string() });
const refreshPayloadSchema = z.object({ sub: z.string(), sid: z.string(), jti: z.string() });

export type AccessTokenPayload = z.infer<typeof accessPayloadSchema>;
export type RefreshTokenPayload = z.infer<typeof refreshPayloadSchema>;

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/** Throws jwt.TokenExpiredError / JsonWebTokenError / ZodError on invalid tokens. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return accessPayloadSchema.parse(decoded);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return refreshPayloadSchema.parse(decoded);
}

export function newJti(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashJti(jti: string): string {
  return crypto.createHash("sha256").update(jti).digest("hex");
}
