import argon2 from "argon2";
import type { AuthResult, LoginInput, RegisterInput } from "@novak/contracts";
import { env } from "../../config/env.js";
import { ConflictError, UnauthorizedError } from "../../utils/errors.js";
import { UserDocument, UserModel, toUserSummary } from "../users/user.model.js";
import { SessionModel } from "./session.model.js";
import { hashJti, newJti, signAccessToken, signRefreshToken, verifyRefreshToken } from "./tokens.js";

export interface IssuedTokens {
  result: AuthResult;
  refreshToken: string;
}

const refreshTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

// Verified against when a login names an unknown user, so response time doesn't reveal
// whether the account exists.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= argon2.hash("novak-timing-equalizer"));

async function issueTokens(user: UserDocument, userAgent?: string): Promise<IssuedTokens> {
  const jti = newJti();
  const session = await SessionModel.create({
    user: user._id,
    currentJtiHash: hashJti(jti),
    userAgent: userAgent?.slice(0, 256),
    expiresAt: new Date(Date.now() + refreshTtlMs()),
  });

  return {
    result: {
      user: toUserSummary(user),
      accessToken: signAccessToken({ sub: user.id, username: user.username }),
    },
    refreshToken: signRefreshToken({ sub: user.id, sid: session.id, jti }),
  };
}

export async function register(input: RegisterInput, userAgent?: string): Promise<IssuedTokens> {
  const existing = await UserModel.findOne({
    $or: [{ email: input.email }, { username: input.username }],
  }).lean();
  if (existing) {
    const field = existing.email === input.email ? "email" : "username";
    throw new ConflictError(`An account with this ${field} already exists`, { field });
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  try {
    const user = await UserModel.create({
      username: input.username,
      email: input.email,
      name: input.name,
      passwordHash,
    });
    return issueTokens(user, userAgent);
  } catch (err) {
    // Lost a race with a concurrent registration for the same username/email
    if ((err as { code?: number }).code === 11000) {
      throw new ConflictError("An account with this email or username already exists");
    }
    throw err;
  }
}

export async function login(input: LoginInput, userAgent?: string): Promise<IssuedTokens> {
  const user = await UserModel.findOne({
    $or: [{ email: input.emailOrUsername }, { username: input.emailOrUsername }],
  }).select("+passwordHash");

  if (!user) {
    await argon2.verify(await getDummyHash(), input.password).catch(() => false);
    throw new UnauthorizedError("Invalid credentials");
  }

  const valid = await argon2.verify(user.passwordHash, input.password);
  if (!valid) throw new UnauthorizedError("Invalid credentials");

  return issueTokens(user, userAgent);
}

export async function refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
  if (!refreshToken) throw new UnauthorizedError("No active session");

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError("Session expired. Please sign in again.");
  }

  const session = await SessionModel.findById(payload.sid);
  if (!session || session.revokedAt || session.user.toString() !== payload.sub) {
    throw new UnauthorizedError("Session expired. Please sign in again.");
  }

  if (session.currentJtiHash !== hashJti(payload.jti)) {
    // An already-rotated token was replayed: assume it leaked and kill the session
    session.revokedAt = new Date();
    await session.save();
    throw new UnauthorizedError("Session revoked. Please sign in again.", {
      reason: "REFRESH_TOKEN_REUSE",
    });
  }

  const user = await UserModel.findById(payload.sub);
  if (!user) throw new UnauthorizedError("Session expired. Please sign in again.");

  const jti = newJti();
  // Compare-and-swap so two concurrent refreshes can't both succeed with the same token
  const rotated = await SessionModel.findOneAndUpdate(
    { _id: session._id, currentJtiHash: session.currentJtiHash, revokedAt: { $exists: false } },
    { currentJtiHash: hashJti(jti), expiresAt: new Date(Date.now() + refreshTtlMs()) },
    { new: true }
  );
  if (!rotated) throw new UnauthorizedError("Session expired. Please sign in again.");

  return {
    result: {
      user: toUserSummary(user),
      accessToken: signAccessToken({ sub: user.id, username: user.username }),
    },
    refreshToken: signRefreshToken({ sub: user.id, sid: session.id, jti }),
  };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    await SessionModel.updateOne({ _id: payload.sid }, { revokedAt: new Date() });
  } catch {
    // Invalid or expired token: nothing to revoke
  }
}
