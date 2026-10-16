import { describe, expect, it } from "vitest";
import { createOriginMatcher } from "./origins.js";

describe("createOriginMatcher", () => {
  it("matches exact origins and ignores trailing slashes", () => {
    const allowed = createOriginMatcher("https://novak.app/, http://localhost:5173");
    expect(allowed("https://novak.app")).toBe(true);
    expect(allowed("http://localhost:5173")).toBe(true);
    expect(allowed("https://evil.app")).toBe(false);
  });

  it("matches a single-label wildcard for preview deployments", () => {
    const allowed = createOriginMatcher("https://novak-*.vercel.app");
    expect(allowed("https://novak-git-main-abhishek.vercel.app")).toBe(true);
    expect(allowed("https://novak-.vercel.app")).toBe(false);
    // The wildcard never spans a dot, so attacker-controlled subdomains don't match
    expect(allowed("https://novak-x.evil.com.vercel.app")).toBe(false);
    expect(allowed("https://novak-x.vercel.app.evil.com")).toBe(false);
  });

  it("allows everything with *", () => {
    expect(createOriginMatcher("*")("https://anything.example")).toBe(true);
  });
});
