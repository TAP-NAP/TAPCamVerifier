import { describe, expect, it } from "vitest";
import { decodeBase64Uint16, decodePixelProjectionReport } from "./tapcamVerifier";

describe("decodeBase64Uint16", () => {
  it("decodes little-endian risk flags", () => {
    const bytes = new Uint8Array([1, 0, 16, 0, 64, 0]);
    const value = btoa(String.fromCharCode(...bytes));

    expect(Array.from(decodeBase64Uint16(value))).toEqual([1, 16, 64]);
  });
});

describe("decodePixelProjectionReport", () => {
  it("decodes point-cloud risks and mesh indices", () => {
    const positions = new Float32Array([1, 2, -1]);
    const colors = new Uint8Array([10, 20, 30]);
    const riskFlags = new Uint16Array([1]);
    const indices = new Uint32Array([0, 1, 2]);
    const stretchedIndices = new Uint32Array([2, 1, 3]);

    const report = decodePixelProjectionReport({
      status: "available",
      geometryKind: "signed-depth-pixel-point-cloud",
      viewMode: "capture-camera",
      cameraModel: "metadata-pinhole",
      imageWidth: 1,
      imageHeight: 1,
      fx: 1,
      fy: 1,
      cx: 0,
      cy: 0,
      sourceKind: "disparity",
      valueUnit: "disparity",
      relativeGeometry: true,
      pointCount: 1,
      sampleStep: 1,
      width: 1,
      height: 1,
      inputDepthWidth: 1,
      inputDepthHeight: 1,
      rgbWidth: 1,
      rgbHeight: 1,
      orientation: "appleAuxiliaryDepthNative",
      photoOrientation: "cgImagePropertyOrientation:1",
      rotation: "none",
      depthRange: {
        min: 1,
        max: 2,
        kind: "apdi-float-range",
        rawMin: 0,
        rawMax: 255
      },
      quality: {
        globalRisk: "notice",
        metrics: {
          clippedLowRatio: 0,
          clippedHighRatio: 0,
          robustRange: 1,
          discontinuityRatio: 0,
          outlierRatio: 0,
          alignmentRisk: "ok"
        },
        warnings: []
      },
      positions: new Float32Array(),
      colors: new Uint8Array(),
      riskFlags: new Uint16Array(),
      outlierScores: new Uint8Array(),
      discontinuityScores: new Uint8Array(),
      positionsBase64: toBase64(new Uint8Array(positions.buffer)),
      colorsBase64: toBase64(colors),
      riskFlagsBase64: toBase64(new Uint8Array(riskFlags.buffer)),
      outlierScoresBase64: toBase64(new Uint8Array([0])),
      discontinuityScoresBase64: toBase64(new Uint8Array([0])),
      mesh: {
        gridWidth: 2,
        gridHeight: 2,
        triangleCount: 1,
        skippedTriangleCount: 1,
        stretchedTriangleCount: 1,
        discontinuityThreshold: 0.35,
        colorMode: "vertex-rgb",
        indices: new Uint32Array(),
        stretchedIndices: new Uint32Array(),
        indicesBase64: toBase64(new Uint8Array(indices.buffer)),
        stretchedIndicesBase64: toBase64(new Uint8Array(stretchedIndices.buffer))
      },
      warnings: []
    });

    expect(report.status).toBe("available");
    if (report.status !== "available") {
      return;
    }
    expect([...report.positions]).toEqual([1, 2, -1]);
    expect([...report.colors]).toEqual([10, 20, 30]);
    expect([...report.riskFlags]).toEqual([1]);
    expect([...(report.mesh?.indices ?? [])]).toEqual([0, 1, 2]);
    expect([...(report.mesh?.stretchedIndices ?? [])]).toEqual([2, 1, 3]);
  });
});

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
