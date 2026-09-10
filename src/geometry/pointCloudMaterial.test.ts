import { describe, expect, it } from "vitest";
import { representativeDepthForCloud } from "./pointCloudMaterial";
import type { ProjectedPixelCloud } from "./types";

describe("point cloud render policy", () => {
  it("uses the robust median depth instead of an outlier-sensitive bounds center", () => {
    const cloud = fixtureCloud({
      positions: new Float32Array([
        0, 0, -1,
        0, 0, -1.1,
        0, 0, -1.2,
        0, 0, -80
      ]),
      pointCount: 4
    });

    expect(representativeDepthForCloud(cloud)).toBeCloseTo(1.2);
  });


});

function fixtureCloud(overrides: Partial<ProjectedPixelCloud> = {}): ProjectedPixelCloud {
  return {
    status: "available",
    geometryKind: "signed-depth-pixel-point-cloud",
    viewMode: "capture-camera",
    cameraModel: "metadata-pinhole",
    imageWidth: 576,
    imageHeight: 768,
    fx: 700,
    fy: 700,
    cx: 288,
    cy: 384,
    sourceKind: "disparity",
    valueUnit: "disparity",
    relativeGeometry: true,
    pointCount: 3,
    sampleStep: 1,
    width: 576,
    height: 768,
    inputDepthWidth: 576,
    inputDepthHeight: 768,
    rgbWidth: 3024,
    rgbHeight: 4032,
    orientation: "appleAuxiliaryDepthNative",
    photoOrientation: "cgImagePropertyOrientation:1",
    rotation: "none",
    depthRange: {
      min: 0,
      max: 255,
      kind: "decoded-luma-range",
      rawMin: 0,
      rawMax: 255
    },
    quality: {
      globalRisk: "ok",
      metrics: {
        clippedLowRatio: 0,
        clippedHighRatio: 0,
        robustRange: 255,
        discontinuityRatio: 0,
        outlierRatio: 0,
        alignmentRisk: "ok"
      },
      warnings: []
    },
    positions: new Float32Array([
      -0.1, 0, -1,
      0, 0, -1,
      0.1, 0, -1
    ]),
    colors: new Uint8Array([
      20, 30, 40,
      40, 50, 60,
      60, 70, 80
    ]),
    riskFlags: new Uint16Array(3),
    outlierScores: new Uint8Array(3),
    discontinuityScores: new Uint8Array(3),
    warnings: [],
    ...overrides
  };
}
