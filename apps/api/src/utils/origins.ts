/**
 * Builds an origin matcher from a comma-separated allow-list. Entries are exact origins,
 * "*" (allow all), or contain a single "*" wildcard in the host such as
 * "https://novak-*.vercel.app" for Vercel preview deployments.
 */
export function createOriginMatcher(allowList: string): (origin: string) => boolean {
  const entries = allowList
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  if (entries.includes("*")) return () => true;

  const exact = new Set(entries.filter((e) => !e.includes("*")));
  const patterns = entries
    .filter((e) => e.includes("*"))
    .map((e) => {
      const escaped = e.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace("\\*", "*");
      // The wildcard matches one DNS label fragment, never a "." or "/"
      return new RegExp(`^${escaped.replace("*", "[a-z0-9-]+")}$`, "i");
    });

  return (origin: string) => exact.has(origin) || patterns.some((p) => p.test(origin));
}
