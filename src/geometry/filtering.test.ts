import { describe, expect, it } from "vitest";
import type { ProjectedPixelCloud } from "./types";
import {
  RISK_ALIGNMENT_EDGE_RISK,
  RISK_CLIPPED_LOW,
  RISK_DISCONTINUITY_EDGE,
  RISK_ISOLATED_OUTLIER,
  defaultFilterOptions,
  filterProjectedPixelCloud,
  remapFilteredTriangleIndices
} from "./filtering";

describe("filterProjectedPixelCloud", () => {
  it("shows all signed points by default without highlight", () => {
    const cloud = fixtureCloud();

    const filtered = filterProjectedPixelCloud(cloud, defaultFilterOptions());

    expect(filtered.visiblePointCount).toBe(5);
    expect(filtered.positions).toBe(cloud.positions);
    expect(filtered.colors).toBe(cloud.colors);
    expect(filtered.sourceIndices).toBeNull();
  });

  it("shows selected risk point types in addition to clean points", () => {
    const cloud = fixtureCloud();

    const filtered = filterProjectedPixelCloud(cloud, {
      ...defaultFilterOptions(),
      showClippedDepth: true,
      showIsolatedOutliers: true,
      showDepthEdges: false,
      showColorMappingRisk: false,
      highlightClippedDepth: true,
      highlightIsolatedOutliers: true
    });

    expect(filtered.visiblePointCount).toBe(3);
    expect(Array.from(filtered.positions)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 4]);
    expect(Array.from(filtered.sourceIndices ?? [])).toEqual([0, 1, 4]);
    expect(Array.from(filtered.colors.slice(0, 3))).toEqual([224, 55, 48]);
  });

  it("shows enabled depth edge and color mapping risks", () => {
    const cloud = fixtureCloud();

    const filtered = filterProjectedPixelCloud(cloud, {
      ...defaultFilterOptions(),
      showClippedDepth: false,
      showIsolatedOutliers: false,
      showDepthEdges: true,
      showColorMappingRisk: true
    });

    expect(filtered.visiblePointCount).toBe(3);
    expect(Array.from(filtered.positions)).toEqual([0, 0, 2, 0, 0, 3, 0, 0, 4]);
  });

  it("shown risk without highlight keeps original colors", () => {
    const cloud = fixtureCloud();

    const filtered = filterProjectedPixelCloud(cloud, {
      ...defaultFilterOptions(),
      showClippedDepth: true,
      showIsolatedOutliers: true,
      showDepthEdges: false,
      showColorMappingRisk: false,
      highlightClippedDepth: false,
      highlightIsolatedOutliers: false
    });

    expect(filtered.visiblePointCount).toBe(3);
    expect(Array.from(filtered.positions)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 4]);
    expect(Array.from(filtered.colors)).toEqual([10, 20, 30, 40, 50, 60, 130, 140, 150]);
  });

  it("clean plus all risk types with no highlight is raw", () => {
    const cloud = fixtureCloud();

    const filtered = filterProjectedPixelCloud(cloud, {
      ...defaultFilterOptions(),
      showClippedDepth: true,
      showIsolatedOutliers: true,
      showDepthEdges: true,
      showColorMappingRisk: true,
      highlightClippedDepth: false,
      highlightIsolatedOutliers: false,
      highlightDepthEdges: false,
      highlightColorMappingRisk: false
    });

    expect(filtered.visiblePointCount).toBe(5);
    expect(filtered.positions).toBe(cloud.positions);
    expect(filtered.colors).toBe(cloud.colors);
  });

  it("uses a different highlight color for each shown risk type", () => {
    const cloud = fixtureCloud();

    const filtered = filterProjectedPixelCloud(cloud, {
      ...defaultFilterOptions(),
      showClippedDepth: true,
      showIsolatedOutliers: true,
      showDepthEdges: true,
      showColorMappingRisk: true,
      highlightClippedDepth: true,
      highlightIsolatedOutliers: true,
      highlightDepthEdges: true,
      highlightColorMappingRisk: true
    });

    expect(filtered.visiblePointCount).toBe(5);
    expect(Array.from(filtered.colors.slice(0, 3))).toEqual([224, 55, 48]);
    expect(Array.from(filtered.colors.slice(3, 6))).toEqual([168, 85, 247]);
    expect(Array.from(filtered.colors.slice(6, 9))).toEqual([245, 158, 11]);
    expect(Array.from(filtered.colors.slice(9, 12))).toEqual([34, 211, 238]);
  });

  it("remaps mesh triangles to filtered point indexes", () => {
    const cloud = fixtureCloud();
    const filtered = filterProjectedPixelCloud(cloud, {
      ...defaultFilterOptions(),
      showClippedDepth: true,
      showIsolatedOutliers: true,
      showDepthEdges: false,
      showColorMappingRisk: false
    });

    const remapped = remapFilteredTriangleIndices(new Uint32Array([0, 1, 4, 1, 2, 4]), filtered);

    expect(Array.from(filtered.sourceIndices ?? [])).toEqual([0, 1, 4]);
    expect(Array.from(remapped)).toEqual([0, 1, 2]);
  });
});

function fixtureCloud(): ProjectedPixelCloud {
  return {
    status: "available",
    geometryKind: "signed-depth-pixel-point-cloud",
    viewMode: "capture-camera",
    cameraModel: "metadata-pinhole",
    imageWidth: 5,
    imageHeight: 1,
    fx: 10,
    fy: 10,
    cx: 2,
    cy: 0,
    sourceKind: "disparity",
    valueUnit: "disparity",
    relativeGeometry: true,
    pointCount: 5,
    sampleStep: 1,
    width: 5,
    height: 1,
    inputDepthWidth: 5,
    inputDepthHeight: 1,
    rgbWidth: 5,
    rgbHeight: 1,
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
      globalRisk: "warning",
      metrics: {
        clippedLowRatio: 0.2,
        clippedHighRatio: 0,
        robustRange: 255,
        discontinuityRatio: 0.2,
        outlierRatio: 0.2,
        alignmentRisk: "warning"
      },
      warnings: []
    },
    positions: new Float32Array([
      0, 0, 0,
      0, 0, 1,
      0, 0, 2,
      0, 0, 3,
      0, 0, 4
    ]),
    colors: new Uint8Array([
      10, 20, 30,
      40, 50, 60,
      70, 80, 90,
      100, 110, 120,
      130, 140, 150
    ]),
    riskFlags: new Uint16Array([
      RISK_CLIPPED_LOW,
      RISK_ISOLATED_OUTLIER,
      RISK_DISCONTINUITY_EDGE,
      RISK_ALIGNMENT_EDGE_RISK,
      0
    ]),
    outlierScores: new Uint8Array([0, 100, 0, 0, 0]),
    discontinuityScores: new Uint8Array([0, 0, 100, 0, 0]),
    warnings: []
  };
}
