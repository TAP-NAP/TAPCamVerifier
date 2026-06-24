import { describe, expect, it } from "vitest";
import { decodeBase64Uint16 } from "./tapcamVerifier";

describe("decodeBase64Uint16", () => {
  it("decodes little-endian risk flags", () => {
    const bytes = new Uint8Array([1, 0, 16, 0, 64, 0]);
    const value = btoa(String.fromCharCode(...bytes));

    expect(Array.from(decodeBase64Uint16(value))).toEqual([1, 16, 64]);
  });
});
