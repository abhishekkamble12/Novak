import { Router } from "express";
import { z } from "zod";
import { CreatePostInputSchema, CursorPaginationQuerySchema } from "@novak/contracts";
import { logger } from "../../config/logger.js";
import { currentUser, optionalAuth, requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/responseEnvelope.js";
import { deletePostVector } from "../ai/aiClient.js";
import { analyzeJobFor, enqueuePostAnalysis } from "../ai/postAnalysis.queue.js";
import * as posts from "./posts.service.js";

const PostIdParams = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid post id") });

const router = Router();

router.get(
  "/feed",
  optionalAuth,
  validate({ query: CursorPaginationQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query as unknown as z.infer<typeof CursorPaginationQuerySchema>;
    const page = await posts.getFeed(limit, cursor, req.user?.userId);
    sendSuccess(res, page.items, 200, { cursor: page.nextCursor ?? undefined, hasMore: !!page.nextCursor });
  })
);

router.get(
  "/trending-tags",
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await posts.getTrendingTags());
  })
);

router.post(
  "/",
  requireAuth,
  validate({ body: CreatePostInputSchema }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const post = await posts.createPost(user.userId, req.body);

    // The post is durable in Mongo before this runs. If Redis is down the enqueue fails
    // fast, the post stays "pending", and the reconciler enqueues it once Redis is back.
    await enqueuePostAnalysis(analyzeJobFor(post, { id: user.userId, username: user.username })).catch(
      (err) =>
        logger.warn({ err: (err as Error).message, postId: post.id }, "Enqueue failed; reconciler will retry")
    );

    sendSuccess(res, await posts.getPost(post.id, user.userId), 201);
  })
);

router.get(
  "/:id",
  optionalAuth,
  validate({ params: PostIdParams }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await posts.getPost(req.params.id, req.user?.userId));
  })
);

router.delete(
  "/:id",
  requireAuth,
  validate({ params: PostIdParams }),
  asyncHandler(async (req, res) => {
    await posts.deletePost(req.params.id, currentUser(req).userId);
    deletePostVector(req.params.id).catch((err) =>
      logger.warn({ err, postId: req.params.id }, "Failed to delete post vector")
    );
    sendSuccess(res, { deleted: true });
  })
);

router.post(
  "/:id/reprocess",
  requireAuth,
  validate({ params: PostIdParams }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const post = await posts.resetFailedProcessing(req.params.id, user.userId);
    await enqueuePostAnalysis(analyzeJobFor(post, { id: user.userId, username: user.username }), {
      replace: true,
    }).catch((err) =>
      logger.warn(
        { err: (err as Error).message, postId: req.params.id },
        "Enqueue failed; reconciler will retry"
      )
    );
    sendSuccess(res, await posts.getPost(req.params.id, user.userId), 202);
  })
);

router.post(
  "/:id/like",
  requireAuth,
  validate({ params: PostIdParams }),
  asyncHandler(async (req, res) => {
    const likesCount = await posts.likePost(req.params.id, currentUser(req).userId);
    sendSuccess(res, { liked: true, likesCount });
  })
);

router.delete(
  "/:id/like",
  requireAuth,
  validate({ params: PostIdParams }),
  asyncHandler(async (req, res) => {
    const likesCount = await posts.unlikePost(req.params.id, currentUser(req).userId);
    sendSuccess(res, { liked: false, likesCount });
  })
);

export const postRoutes = router;
