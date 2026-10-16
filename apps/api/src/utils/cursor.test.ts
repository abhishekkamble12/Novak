import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor.js";

describe("cursor", () => {
  it("round-trips", () => {
    const payload = { id: "65f000000000000000000001", timestamp: 1700000000000 };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("rejects malformed input", () => {
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ id: 1 })).toString("base64url"))).toBeNull();
  });
});
