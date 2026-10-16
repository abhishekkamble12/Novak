import { Schema, Types, model, InferSchemaType, HydratedDocument } from "mongoose";

const postSchema = new Schema(
  {
    author: { type: Types.ObjectId, ref: "User", required: true },
    caption: { type: String, default: "" },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ["image"], default: "image" },
    aspectRatio: { type: Number, default: 1 },
    tags: { type: [String], default: [] },
    aiTags: { type: [String], default: [] },
    likesCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "flagged", "rejected"],
      default: "pending",
    },
    moderationReason: { type: String },
    analyzedAt: { type: Date },
  },
  { timestamps: true }
);

// Feed: newest first, with _id as the tie-breaker for stable cursors
postSchema.index({ moderationStatus: 1, createdAt: -1, _id: -1 });
postSchema.index({ author: 1, createdAt: -1, _id: -1 });
postSchema.index({ aiTags: 1, createdAt: -1 });
// Keyword fallback when the AI service is unavailable
postSchema.index({ caption: "text", tags: "text", aiTags: "text" });

export type Post = InferSchemaType<typeof postSchema>;
export type PostDocument = HydratedDocument<Post>;

export const PostModel = model("Post", postSchema);

const likeSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true },
    post: { type: Types.ObjectId, ref: "Post", required: true },
  },
  { timestamps: true }
);
likeSchema.index({ user: 1, post: 1 }, { unique: true });
likeSchema.index({ post: 1 });

export const LikeModel = model("Like", likeSchema);
