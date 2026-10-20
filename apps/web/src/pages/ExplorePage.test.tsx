import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { ExplorePage } from "./ExplorePage";
import { postsApi, searchApi, usersApi } from "../lib/api";
import { makePost, renderWithProviders } from "../test/utils";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const explore = (q: string) => renderWithProviders(<ExplorePage />, { route: `/explore?q=${q}` });

describe("ExplorePage search states", () => {
  it("shows a spinner while searching", () => {
    vi.spyOn(searchApi, "search").mockReturnValue(new Promise(() => {}));
    explore("dog");
    expect(screen.getByText("Searching…")).toBeTruthy();
  });

  it("shows results with similarity scores in hybrid mode", async () => {
    vi.spyOn(searchApi, "search").mockResolvedValue({
      results: [makePost({ score: 0.81 }), makePost({ id: "p2", caption: "keyword hit" })],
      mode: "hybrid",
      latencyMs: 42,
    });
    explore("sunset");
    expect(await screen.findByText(/2 results for "sunset"/)).toBeTruthy();
    expect(screen.getByText("0.81")).toBeTruthy();
    expect(screen.getByText(/Semantic \+ keyword/)).toBeTruthy();
  });

  it("says plainly when only keyword search is available", async () => {
    vi.spyOn(searchApi, "search").mockResolvedValue({ results: [makePost()], mode: "keyword", latencyMs: 5 });
    explore("beach");
    expect(await screen.findByText(/semantic search is unavailable/)).toBeTruthy();
  });

  it("shows an empty state", async () => {
    vi.spyOn(searchApi, "search").mockResolvedValue({ results: [], mode: "hybrid", latencyMs: 5 });
    explore("tax%20return");
    expect(await screen.findByText("Nothing found")).toBeTruthy();
  });

  it("shows the server's error message with a retry", async () => {
    const response = { status: 500, data: { error: { message: "Search is down" } } } as AxiosResponse;
    vi.spyOn(searchApi, "search").mockRejectedValue(new AxiosError("boom", "500", undefined, undefined, response));
    explore("dog");
    expect(await screen.findByText("Search is down")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows the latest posts when there is no query", async () => {
    vi.spyOn(postsApi, "feed").mockResolvedValue({ items: [makePost({ caption: "latest one" })], nextCursor: null });
    vi.spyOn(postsApi, "trendingTags").mockResolvedValue([]);
    vi.spyOn(usersApi, "suggestions").mockResolvedValue([]);
    renderWithProviders(<ExplorePage />, { route: "/explore" });
    expect(await screen.findByText("Latest posts")).toBeTruthy();
  });
});
