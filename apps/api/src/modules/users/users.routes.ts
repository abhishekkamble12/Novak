import { Router } from "express";
import { z } from "zod";
import { CursorPaginationQuerySchema, UpdateProfileInputSchema } from "@novak/contracts";
import { currentUser, optionalAuth, requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { NotFoundError } from "../../utils/errors.js";
import { sendSuccess } from "../../utils/responseEnvelope.js";
import { getUserPosts } from "../posts/posts.service.js";
import { UserModel, toUserSummary } from "./user.model.js";

const UsernameParams = z.object({ username: z.string().trim().toLowerCase().min(1).max(30) });

const router = Router();

router.get(
  "/suggestions",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const exclude = req.user ? { _id: { $ne: req.user.userId } } : {};
    const users = await UserModel.find({ ...exclude, postsCount: { $gt: 0 } })
      .sort({ postsCount: -1, createdAt: -1 })
      .limit(5);
    sendSuccess(res, users.map(toUserSummary));
  })
);

router.patch(
  "/me",
  requireAuth,
  validate({ body: UpdateProfileInputSchema }),
  asyncHandler(async (req, res) => {
    const { avatarUrl, ...rest } = req.body as z.infer<typeof UpdateProfileInputSchema>;
    const update =
      avatarUrl === ""
        ? { $set: rest, $unset: { avatarUrl: 1 } }
        : { $set: { ...rest, ...(avatarUrl ? { avatarUrl } : {}) } };
    const user = await UserModel.findByIdAndUpdate(currentUser(req).userId, update, { new: true });
    if (!user) throw new NotFoundError("User not found");
    sendSuccess(res, toUserSummary(user));
  })
);

router.get(
  "/:username",
  validate({ params: UsernameParams }),
  asyncHandler(async (req, res) => {
    const user = await UserModel.findOne({ username: req.params.username });
    if (!user) throw new NotFoundError("User not found");
    sendSuccess(res, toUserSummary(user));
  })
);

router.get(
  "/:username/posts",
  optionalAuth,
  validate({ params: UsernameParams, query: CursorPaginationQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query as unknown as z.infer<typeof CursorPaginationQuerySchema>;
    const page = await getUserPosts(req.params.username, limit, cursor, req.user?.userId);
    sendSuccess(res, page.items, 200, { cursor: page.nextCursor ?? undefined, hasMore: !!page.nextCursor });
  })
);

export const userRoutes = router;
