import { afterEach, describe, expect, it } from "vitest";
import type { AxiosAdapter } from "axios";
import { api, errorMessage, NOT_API_MESSAGE, postsApi } from "./api";

const original = api.defaults.adapter;
afterEach(() => {
  api.defaults.adapter = original;
});

const respond =
  (data: unknown, status = 200): AxiosAdapter =>
  async (config) => ({ data, status, statusText: "OK", headers: {}, config });

describe("api client", () => {
  it("turns a misrouted /api (static host answering index.html) into a clear error", async () => {
    api.defaults.adapter = respond("<!doctype html><div id=\"root\"></div>");
    const err = await postsApi.feed().catch((e) => e);
    expect(errorMessage(err)).toBe(NOT_API_MESSAGE);
  });

  it("passes through a normal envelope", async () => {
    api.defaults.adapter = respond({ success: true, data: [], meta: { hasMore: false } });
    await expect(postsApi.feed()).resolves.toEqual({ items: [], nextCursor: null });
  });
});
