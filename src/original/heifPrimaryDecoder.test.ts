import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeHeifPrimaryRgba } from "./heifPrimaryDecoder";

const fixturePath = resolve(process.cwd(), "test/tap-depth-photo.HEIC");
const fixtureIt = existsSync(fixturePath) ? it : it.skip;

describe("decodeHeifPrimaryRgba", () => {
  fixtureIt("decodes the current fixture's primary HEIC image", async () => {
    const bytes = new Uint8Array(readFileSync(fixturePath));
    const image = await decodeHeifPrimaryRgba(bytes);

    expect(image?.width).toBe(3024);
    expect(image?.height).toBe(4032);
    expect(image?.rgba.length).toBe(3024 * 4032 * 4);
    expect(new Set(image?.rgba.subarray(0, 4096)).size).toBeGreaterThan(1);
  });

  it("returns null for non-HEIF bytes", async () => {
    await expect(decodeHeifPrimaryRgba(new TextEncoder().encode("not a heif file"))).resolves.toBeNull();
  });
});
