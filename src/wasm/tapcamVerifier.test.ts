import { describe, expect, it } from "vitest";
import { decodePixelProjectionReport } from "./tapcamVerifier";

describe("decodePixelProjectionReport", () => {
  it("decodes mesh indices without changing the default point-cloud payload", () => {
    const positions = new Float32Array([1, 2, -1]);
    const colors = new Uint8Array([10, 20, 30]);
    const indices = new Uint32Array([0, 1, 2]);

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
      positions: new Float32Array(),
      colors: new Uint8Array(),
      positionsBase64: toBase64(new Uint8Array(positions.buffer)),
      colorsBase64: toBase64(colors),
      mesh: {
        gridWidth: 3,
        gridHeight: 2,
        triangleCount: 1,
        skippedTriangleCount: 0,
        discontinuityThreshold: 0.35,
        colorMode: "vertex-rgb",
        indices: new Uint32Array(),
        indicesBase64: toBase64(new Uint8Array(indices.buffer))
      },
      warnings: []
    });

    expect(report.status).toBe("available");
    if (report.status !== "available") {
      return;
    }
    expect([...report.positions]).toEqual([1, 2, -1]);
    expect([...report.colors]).toEqual([10, 20, 30]);
    expect([...(report.mesh?.indices ?? [])]).toEqual([0, 1, 2]);
  });
});

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
