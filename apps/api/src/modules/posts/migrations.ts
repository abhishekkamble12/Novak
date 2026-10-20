import { logger } from "../../config/logger.js";
import { PostModel } from "./post.model.js";

/**
 * Posts created before processingStatus existed have no record of whether their vector was
 * stored. Mark them pending so the reconciler re-analyses them; analysis is idempotent, so
 * re-indexing an already indexed post is harmless. Safe to run on every boot.
 */
export async function backfillProcessingStatus(): Promise<void> {
  const { modifiedCount } = await PostModel.updateMany(
    { processingStatus: { $exists: false } },
    { $set: { processingStatus: "pending", processingAttempts: 0, searchIndexed: false } }
  );
  if (modifiedCount > 0) logger.info({ modifiedCount }, "Backfilled processingStatus on legacy posts");
}
