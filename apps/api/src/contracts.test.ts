import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CreatePostInputSchema,
  PostAnalyzeJobSchema,
  PostAnalyzedResultSchema,
  RegisterInputSchema,
  SemanticSearchResponseSchema,
} from "@novak/contracts";

// Fixtures are generated from the real FastAPI responses by
// apps/ai-service/tests/test_contract_fixtures.py, so both sides are checked against one file.
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/contracts/fixtures/${name}`, import.meta.url), "utf-8"));

describe("AI service contract", () => {
  it("parses the analyze-post response", () => {
    const parsed = PostAnalyzedResultSchema.parse(fixture("analyze-post.response.json"));
    expect(parsed.moderation.status).toBe("flagged");
    expect(parsed.indexed).toBe(true);
  });

  it("sends an analyze-post request the service accepts", () => {
    // The fixture is the payload the Python tests post; our job schema must produce the same shape
    const job = PostAnalyzeJobSchema.parse(fixture("analyze-post.request.json"));
    expect(Object.keys(job).sort()).toEqual(Object.keys(fixture("analyze-post.request.json")).sort());
  });

  it("parses the search response", () => {
    const parsed = SemanticSearchResponseSchema.parse(fixture("search.response.json"));
    expect(parsed.results[0].postId).toBe("65f000000000000000000001");
    expect(parsed.minScore).toBe(0.62);
  });
});

describe("input schemas", () => {
  it("normalizes registration input", () => {
    const parsed = RegisterInputSchema.parse({
      username: " Ada_L ",
      email: "ADA@Example.com",
      password: "Password1",
      name: "Ada",
    });
    expect(parsed.username).toBe("ada_l");
    expect(parsed.email).toBe("ada@example.com");
  });

  it("requires https media", () => {
    expect(CreatePostInputSchema.safeParse({ mediaUrl: "http://x.com/a.jpg" }).success).toBe(false);
    expect(CreatePostInputSchema.safeParse({ mediaUrl: "https://x.com/a.jpg" }).success).toBe(true);
  });
});
