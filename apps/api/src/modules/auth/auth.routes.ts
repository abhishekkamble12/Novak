import { CookieOptions, Request, Response, Router } from "express";
import { LoginInputSchema, RegisterInputSchema } from "@novak/contracts";
import { env } from "../../config/env.js";
import { requireAuth, currentUser } from "../../middleware/auth.js";
import { authRateLimiter } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { NotFoundError } from "../../utils/errors.js";
import { sendSuccess } from "../../utils/responseEnvelope.js";
import { UserModel, toUserSummary } from "../users/user.model.js";
import * as authService from "./auth.service.js";

export const REFRESH_COOKIE = "novak_rt";

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  // Only sent to the auth endpoints that need it
  path: "/api/auth",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
});

function sendTokens(res: Response, issued: authService.IssuedTokens, status = 200) {
  res.cookie(REFRESH_COOKIE, issued.refreshToken, cookieOptions());
  return sendSuccess(res, issued.result, status);
}

const readRefreshCookie = (req: Request): string | undefined => req.cookies?.[REFRESH_COOKIE];

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  validate({ body: RegisterInputSchema }),
  asyncHandler(async (req, res) => {
    sendTokens(res, await authService.register(req.body, req.get("user-agent")), 201);
  })
);

router.post(
  "/login",
  authRateLimiter,
  validate({ body: LoginInputSchema }),
  asyncHandler(async (req, res) => {
    sendTokens(res, await authService.login(req.body, req.get("user-agent")));
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    try {
      sendTokens(res, await authService.refresh(readRefreshCookie(req)));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
      throw err;
    }
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await authService.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    sendSuccess(res, { loggedOut: true });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await UserModel.findById(currentUser(req).userId);
    if (!user) throw new NotFoundError("User not found");
    sendSuccess(res, toUserSummary(user));
  })
);

export const authRoutes = router;
