import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";
import type { UserSummary } from "@novak/contracts";

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    bio: { type: String },
    postsCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model("User", userSchema);

export function toUserSummary(user: UserDocument): UserSummary {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatarUrl: user.avatarUrl || undefined,
    bio: user.bio || undefined,
    postsCount: user.postsCount ?? 0,
    createdAt: user.createdAt.toISOString(),
  };
}
