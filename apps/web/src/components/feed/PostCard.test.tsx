import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { StatusBadge } from "./PostCard";
import { postsApi } from "../../lib/api";
import { makePost, renderWithProviders } from "../../test/utils";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StatusBadge", () => {
  it("shows nothing to other viewers, whatever the state", () => {
    renderWithProviders(<StatusBadge post={makePost({ processingStatus: "pending" })} isOwner={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows processing to the author while analysis is pending", () => {
    renderWithProviders(<StatusBadge post={makePost({ processingStatus: "pending" })} isOwner />);
    expect(screen.getByRole("status").textContent).toContain("Processing");
  });

  it("offers a retry when analysis failed", async () => {
    const reprocess = vi
      .spyOn(postsApi, "reprocess")
      .mockResolvedValue(makePost({ processingStatus: "pending", searchIndexed: false }));
    renderWithProviders(
      <StatusBadge post={makePost({ processingStatus: "failed", searchIndexed: false })} isOwner />
    );
    expect(screen.getByRole("status").textContent).toContain("Not searchable yet");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(reprocess).toHaveBeenCalledWith("p1"));
  });

  it("tells the author a flagged post is hidden from others", () => {
    renderWithProviders(
      <StatusBadge post={makePost({ moderationStatus: "flagged", moderationReason: "spam" })} isOwner />
    );
    expect(screen.getByText(/Held for review/)).toBeTruthy();
  });

  it("marks completed, indexed posts as searchable", () => {
    renderWithProviders(<StatusBadge post={makePost()} isOwner />);
    expect(screen.getByLabelText("Indexed for search")).toBeTruthy();
  });
});
