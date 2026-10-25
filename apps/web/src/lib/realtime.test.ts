import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { PostDto } from "@novak/contracts";
import { applyProcessedEvent, hasPendingOwnPost } from "./realtime";
import { postKeys } from "./postCache";
import { makePost } from "../test/utils";

describe("realtime cache sync", () => {
  it("applies a processed event to every cached copy of the post", () => {
    const qc = new QueryClient();
    const pending = makePost({ processingStatus: "pending", searchIndexed: false });
    qc.setQueryData(postKeys.feed, {
      pages: [{ items: [pending], nextCursor: null }],
      pageParams: [undefined],
    });
    qc.setQueryData(postKeys.detail("p1"), pending);

    applyProcessedEvent(qc, {
      postId: "p1",
      moderationStatus: "approved",
      processingStatus: "completed",
      searchIndexed: true,
      aiTags: ["beach"],
    });

    const feed = qc.getQueryData<{ pages: { items: PostDto[] }[] }>(postKeys.feed);
    expect(feed?.pages[0].items[0]).toMatchObject({ processingStatus: "completed", aiTags: ["beach"] });
    expect(qc.getQueryData(postKeys.detail("p1"))).toMatchObject({ searchIndexed: true });
  });

  it("only polls for the signed-in user's own pending posts", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      postKeys.detail("p1"),
      makePost({ authorId: "someone-else", processingStatus: "pending" })
    );
    expect(hasPendingOwnPost(qc, "u1")).toBe(false);
    qc.setQueryData(postKeys.search("x"), {
      results: [makePost({ processingStatus: "pending" })],
      mode: "hybrid",
      latencyMs: 1,
    });
    expect(hasPendingOwnPost(qc, "u1")).toBe(true);
  });
});
