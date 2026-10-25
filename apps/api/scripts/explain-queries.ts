/**
 * Prints MongoDB query plans for the hot read paths, using the exact filters the API builds.
 *   cd apps/api && npx tsx scripts/explain-queries.ts      (uses MONGO_URI / MONGO_DB_NAME)
 */
import mongoose, { Types } from "mongoose";
import { env } from "../src/config/env.js";
import { PostModel } from "../src/modules/posts/post.model.js";
import { visibilityFilter } from "../src/modules/posts/posts.service.js";

type Stage = { stage: string; indexName?: string; inputStage?: Stage; inputStages?: Stage[] };

function describe(stage: Stage): string {
  const children = [stage.inputStage, ...(stage.inputStages ?? [])].filter(Boolean) as Stage[];
  const self = stage.indexName ? `${stage.stage}(${stage.indexName})` : stage.stage;
  return children.length ? `${self} <- ${children.map(describe).join(" + ")}` : self;
}

async function explain(name: string, query: mongoose.Query<unknown, unknown>) {
  const plan = (await query.explain("executionStats")) as unknown as {
    queryPlanner: { winningPlan: Stage & { queryPlan?: Stage } };
    executionStats: {
      nReturned: number;
      totalKeysExamined: number;
      totalDocsExamined: number;
      executionTimeMillis: number;
    };
  };
  const winning = plan.queryPlanner.winningPlan.queryPlan ?? plan.queryPlanner.winningPlan;
  const s = plan.executionStats;
  console.log(`\n${name}\n  plan: ${describe(winning)}`);
  console.log(
    `  returned ${s.nReturned}, keys examined ${s.totalKeysExamined}, docs examined ${s.totalDocsExamined}, ${s.executionTimeMillis}ms`
  );
}

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  await PostModel.init();
  const total = await PostModel.estimatedDocumentCount();
  const someAuthor = (await PostModel.findOne().select("author").lean())?.author ?? new Types.ObjectId();
  console.log(`${env.MONGO_DB_NAME}: ${total} posts`);

  const page = (filter: object) => PostModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(21);

  await explain("feed, anonymous", page(visibilityFilter()));
  await explain("feed, signed in (own hidden posts included)", page(visibilityFilter(someAuthor.toString())));
  await explain("profile grid", page({ $and: [{ author: someAuthor }, visibilityFilter()] }));
  await explain(
    "reconciler scan",
    PostModel.find({ processingStatus: "pending", createdAt: { $lt: new Date() } })
      .sort({ createdAt: 1 })
      .limit(100)
  );
  await explain(
    "keyword search",
    PostModel.find(
      { $and: [{ $text: { $search: "coffee" } }, visibilityFilter()] },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(24)
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
