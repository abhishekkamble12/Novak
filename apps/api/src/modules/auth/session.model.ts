import { Schema, Types, model } from "mongoose";

/**
 * One document per login. The refresh token carries the session id and a token id (jti);
 * only the hash of the current jti is stored. Each refresh rotates the jti. Presenting
 * an older jti means the token was stolen and replayed, so the whole session is revoked.
 */
const sessionSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    currentJtiHash: { type: String, required: true },
    userAgent: { type: String },
    revokedAt: { type: Date },
    // TTL index: MongoDB deletes the session once it expires
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const SessionModel = model("Session", sessionSchema);
