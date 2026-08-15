import { describe, expect, it } from "vitest";
import {
  interactionRadiusForCloud,
  makePointCloudMaterial,
  representativeDepthForCloud,
  splatWorldSizeForCloud
} from "./pointCloudMaterial";
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

  it("sizes round splats from the camera footprint and sampling interval", () => {
    const dense = fixtureCloud({ sampleStep: 1, fx: 500, fy: 500 });
    const sampled = fixtureCloud({ sampleStep: 4, fx: 500, fy: 500 });

    expect(splatWorldSizeForCloud(sampled, 2)).toBeCloseTo(
      splatWorldSizeForCloud(dense, 2) * 4
    );
  });

  it("keeps the interaction field larger than an individual splat", () => {
    const cloud = fixtureCloud({ sampleStep: 3, fx: 700, fy: 700 });
    const targetDepth = 1.5;

    expect(interactionRadiusForCloud(cloud, targetDepth)).toBeGreaterThan(
      splatWorldSizeForCloud(cloud, targetDepth) * 2
    );
  });

  it("keeps every rendered point at one screen-space size and preserves source color", () => {
    const { material, uniforms } = makePointCloudMaterial(fixtureCloud(), 1.5, 64);

    expect(uniforms.uRollDirection.value.toArray()).toEqual([0, 0]);
    expect(material.vertexShader).toContain("modelViewMatrix * vec4(position, 1.0)");
    expect(material.vertexShader).toContain("gl_PointSize = uPointSize");
    expect(material.vertexShader).not.toContain("projectedDiameter");
    expect(material.fragmentShader).toContain("vec4(vPointColor, softCoverage)");
    expect(material.fragmentShader).not.toContain("selfLitColor");
    material.dispose();
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
