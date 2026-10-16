import { describe, expect, it } from "vitest";
import {
  CreatePostInputSchema,
  PostAnalyzedResultSchema,
  RegisterInputSchema,
  SemanticSearchResponseSchema,
} from "@novak/contracts";

// Payloads exactly as the FastAPI service serializes them (camelCase aliases)
describe("AI service contract", () => {
  it("accepts the analyze-post response", () => {
    const parsed = PostAnalyzedResultSchema.parse({
      postId: "p1",
      tags: ["beach"],
      indexed: true,
      moderation: {
        isFlagged: false,
        status: "approved",
        confidence: 0.98,
        labels: [],
        scores: { spam: 0.05 },
        reason: null,
      },
    });
    expect(parsed.indexed).toBe(true);
  });

  it("accepts the search response", () => {
    expect(() =>
      SemanticSearchResponseSchema.parse({
        results: [
          { postId: "p1", score: 0.31, caption: "", mediaUrl: "https://x/y.jpg", authorUsername: "a", tags: [] },
        ],
        total: 1,
        query: "dog",
        latencyMs: 12.5,
      })
    ).not.toThrow();
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
