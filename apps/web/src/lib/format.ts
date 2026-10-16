const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(n);
}

/** Splits free text into valid post tags: lowercase, [a-z0-9_-], max 40 chars, max 20 tags. */
export function parseTags(input: string): string[] {
  const tags = input
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 20);
}
