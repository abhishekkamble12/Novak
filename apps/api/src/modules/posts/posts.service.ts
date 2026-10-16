import { FilterQuery, Types } from "mongoose";
import type { CreatePostInput, ModerationStatus, PostDto, TrendingTag } from "@novak/contracts";
import { decodeCursor, encodeCursor } from "../../utils/cursor.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { UserModel } from "../users/user.model.js";
import { LikeModel, Post, PostModel } from "./post.model.js";

/** Statuses everyone may see. Authors also see their own pending/flagged posts. */
const PUBLIC_STATUSES: ModerationStatus[] = ["approved", "pending"];

interface AuthorFields {
  _id: Types.ObjectId;
  username: string;
  name: string;
  avatarUrl?: string | null;
}

type PostWithAuthor = Omit<Post, "author"> & {
  _id: Types.ObjectId;
  author: AuthorFields | null;
};

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

const AUTHOR_FIELDS = "username name avatarUrl";

export function visibilityFilter(viewerId?: string): FilterQuery<Post> {
  if (!viewerId) return { moderationStatus: { $in: PUBLIC_STATUSES } };
  return {
    $or: [
      { moderationStatus: { $in: PUBLIC_STATUSES } },
      { author: new Types.ObjectId(viewerId), moderationStatus: { $ne: "rejected" } },
    ],
  };
}

export async function toPostDtos(posts: PostWithAuthor[], viewerId?: string): Promise<PostDto[]> {
  const likedIds = new Set<string>();
  if (viewerId && posts.length > 0) {
    const likes = await LikeModel.find({
      user: viewerId,
      post: { $in: posts.map((p) => p._id) },
    })
      .select("post")
      .lean();
    likes.forEach((l) => likedIds.add(l.post.toString()));
  }

  return posts
    .filter((p): p is PostWithAuthor & { author: AuthorFields } => p.author !== null)
    .map((p) => ({
      id: p._id.toString(),
      authorId: p.author._id.toString(),
      authorUsername: p.author.username,
      authorName: p.author.name,
      authorAvatarUrl: p.author.avatarUrl || undefined,
      caption: p.caption ?? "",
      mediaUrl: p.mediaUrl,
      mediaType: "image" as const,
      aspectRatio: p.aspectRatio ?? 1,
      tags: p.tags ?? [],
      likesCount: p.likesCount ?? 0,
      commentsCount: p.commentsCount ?? 0,
      hasLiked: likedIds.has(p._id.toString()),
      moderationStatus: p.moderationStatus as ModerationStatus,
      moderationReason: p.moderationReason || undefined,
      aiTags: p.aiTags ?? [],
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
}

async function paginate(
  filter: FilterQuery<Post>,
  limit: number,
  cursor: string | undefined,
  viewerId?: string
): Promise<Page<PostDto>> {
  const query: FilterQuery<Post> = { ...filter };
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded || !Types.ObjectId.isValid(decoded.id)) {
      throw new BadRequestError("Invalid pagination cursor");
    }
    const at = new Date(decoded.timestamp);
    query.$and = [
      ...(query.$and ?? []),
      {
        $or: [
          { createdAt: { $lt: at } },
          { createdAt: at, _id: { $lt: new Types.ObjectId(decoded.id) } },
        ],
      },
    ];
  }

  const docs = await PostModel.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate<{ author: AuthorFields | null }>("author", AUTHOR_FIELDS)
    .lean<PostWithAuthor[]>();

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const last = page[page.length - 1];

  return {
    items: await toPostDtos(page, viewerId),
    nextCursor:
      hasMore && last
        ? encodeCursor({ id: last._id.toString(), timestamp: last.createdAt.getTime() })
        : null,
  };
}

export function getFeed(limit: number, cursor?: string, viewerId?: string) {
  return paginate(visibilityFilter(viewerId), limit, cursor, viewerId);
}

export async function getUserPosts(
  username: string,
  limit: number,
  cursor?: string,
  viewerId?: string
) {
  const author = await UserModel.findOne({ username: username.toLowerCase() }).select("_id").lean();
  if (!author) throw new NotFoundError("User not found");
  return paginate(
    { $and: [{ author: author._id }, visibilityFilter(viewerId)] },
    limit,
    cursor,
    viewerId
  );
}

export async function getPostsByIds(ids: string[], viewerId?: string): Promise<PostDto[]> {
  const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
  if (validIds.length === 0) return [];
  const docs = await PostModel.find({
    $and: [{ _id: { $in: validIds } }, visibilityFilter(viewerId)],
  })
    .populate<{ author: AuthorFields | null }>("author", AUTHOR_FIELDS)
    .lean<PostWithAuthor[]>();
  const dtos = await toPostDtos(docs, viewerId);
  // Preserve the caller's ranking order
  const byId = new Map(dtos.map((d) => [d.id, d]));
  return validIds.map((id) => byId.get(id)).filter((d): d is PostDto => Boolean(d));
}

export async function getPost(id: string, viewerId?: string): Promise<PostDto> {
  const [post] = await getPostsByIds([id], viewerId);
  if (!post) throw new NotFoundError("Post not found");
  return post;
}

export async function createPost(authorId: string, input: CreatePostInput) {
  const post = await PostModel.create({ ...input, author: authorId, moderationStatus: "pending" });
  await UserModel.updateOne({ _id: authorId }, { $inc: { postsCount: 1 } });
  return post;
}

export async function deletePost(postId: string, userId: string): Promise<void> {
  if (!Types.ObjectId.isValid(postId)) throw new NotFoundError("Post not found");
  const post = await PostModel.findById(postId);
  if (!post) throw new NotFoundError("Post not found");
  if (post.author.toString() !== userId) throw new ForbiddenError("You can only delete your own posts");

  await post.deleteOne();
  await Promise.all([
    LikeModel.deleteMany({ post: post._id }),
    UserModel.updateOne({ _id: userId, postsCount: { $gt: 0 } }, { $inc: { postsCount: -1 } }),
  ]);
}

async function findVisiblePost(postId: string, userId: string) {
  if (!Types.ObjectId.isValid(postId)) throw new NotFoundError("Post not found");
  const exists = await PostModel.exists({ $and: [{ _id: postId }, visibilityFilter(userId)] });
  if (!exists) throw new NotFoundError("Post not found");
}

export async function likePost(postId: string, userId: string): Promise<number> {
  await findVisiblePost(postId, userId);
  const result = await LikeModel.updateOne(
    { user: userId, post: postId },
    { $setOnInsert: { user: userId, post: postId } },
    { upsert: true }
  );
  // Only count a like the first time (the endpoint is idempotent)
  const inc = result.upsertedCount > 0 ? 1 : 0;
  const post = await PostModel.findByIdAndUpdate(postId, { $inc: { likesCount: inc } }, { new: true })
    .select("likesCount")
    .lean();
  return post?.likesCount ?? 0;
}

export async function unlikePost(postId: string, userId: string): Promise<number> {
  await findVisiblePost(postId, userId);
  const result = await LikeModel.deleteOne({ user: userId, post: postId });
  const filter = result.deletedCount > 0 ? { _id: postId, likesCount: { $gt: 0 } } : { _id: postId };
  const inc = result.deletedCount > 0 ? -1 : 0;
  await PostModel.updateOne(filter, { $inc: { likesCount: inc } });
  const post = await PostModel.findById(postId).select("likesCount").lean();
  return post?.likesCount ?? 0;
}

export async function getTrendingTags(limit = 10): Promise<TrendingTag[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await PostModel.aggregate<{ _id: string; count: number }>([
    { $match: { moderationStatus: "approved", createdAt: { $gte: since } } },
    { $project: { all: { $setUnion: ["$tags", "$aiTags"] } } },
    { $unwind: "$all" },
    { $group: { _id: "$all", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ tag: r._id, count: r.count }));
}

/** Keyword search used when the AI service is unavailable. */
export async function keywordSearch(
  q: string,
  limit: number,
  tag: string | undefined,
  viewerId?: string
): Promise<PostDto[]> {
  const conditions: FilterQuery<Post>[] = [{ $text: { $search: q } }, visibilityFilter(viewerId)];
  if (tag) conditions.push({ $or: [{ tags: tag }, { aiTags: tag }] });
  const docs = await PostModel.find({ $and: conditions }, { score: { $meta: "textScore" } })
    .sort({ score: { $meta: "textScore" } })
    .limit(limit)
    .populate<{ author: AuthorFields | null }>("author", AUTHOR_FIELDS)
    .lean<PostWithAuthor[]>();
  return toPostDtos(docs, viewerId);
}
