import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeHeifAuxiliaryDepthPlane, findHeifAuxiliaryDepthItemId } from "./heifDepthDecoder";

const fixturePath = resolve(process.cwd(), "test/tap-depth-photo.HEIC");
const fixtureIt = existsSync(fixturePath) ? it : it.skip;

describe("findHeifAuxiliaryDepthItemId", () => {
  fixtureIt("finds the current fixture's hidden auxiliary depth item", () => {
    const bytes = new Uint8Array(readFileSync(fixturePath));

    expect(findHeifAuxiliaryDepthItemId(bytes)).toBe(64);
  });

  fixtureIt("decodes the current fixture's auxiliary luma plane", async () => {
    const bytes = new Uint8Array(readFileSync(fixturePath));
    const plane = await decodeHeifAuxiliaryDepthPlane(bytes);

    expect(plane?.itemId).toBe(64);
    expect(plane?.width).toBe(576);
    expect(plane?.height).toBe(768);
    expect(plane?.luma.length).toBe(576 * 768);
    expect(new Set(plane?.luma.subarray(0, 4096)).size).toBeGreaterThan(1);
  });

  it("returns null for non-HEIF bytes", () => {
    expect(findHeifAuxiliaryDepthItemId(new TextEncoder().encode("not a heif file"))).toBeNull();
  });
});
