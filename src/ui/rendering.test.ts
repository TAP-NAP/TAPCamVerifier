import { describe, expect, it } from "vitest";
import type { DepthVisualizationAvailable } from "../depth/types";
import type { ProjectedPixelCloud } from "../geometry/types";
import type { OriginalPreviewAvailable } from "../original/types";
import type { CombinedVerificationResult } from "../verifier/types";
import {
  renderDepthPanel,
  renderOriginalPreviewLoading,
  renderOriginalPreviewResult,
  renderPixelProjectionPanel,
  renderVerificationResult
} from "./rendering";

const result: CombinedVerificationResult = {
  fileName: "capture.HEIC",
  fileSize: 2048,
  finalStatus: "valid",
  server: {
    status: "valid",
    signingBindingSHA256: "server-binding"
  },
  serverError: null,
  local: {
    status: "valid",
    summary: "All local content binding checks passed.",
    captureId: "capture-id",
    capturedAt: "2026-06-23T00:00:00.000Z",
    manifest: {
      containerFormat: "heif"
    },
    recomputed: {
      assetSHA256: "asset",
      signingBindingSHA256: "binding"
    },
    serverRequest: null,
    checks: [
      {
        id: "asset-hash",
        label: "Recompute asset hash excluding proof slot",
        detail: "Values match.",
        status: "pass"
      }
    ]
  }
};

describe("renderVerificationResult", () => {
  it("keeps the local summary visible and collapses detailed checks", () => {
    const html = renderVerificationResult(result);

    expect(html).toContain("All local content binding checks passed.");
    expect(html).toContain('<details class="checks-disclosure">');
    expect(html).not.toContain('<details class="checks-disclosure" open>');
    expect(html).toContain("Local content binding checks");
    expect(html).toContain("Recompute asset hash excluding proof slot");
  });
});

describe("renderDepthPanel", () => {
  it("renders unavailable depth without a canvas", () => {
    const html = renderDepthPanel({
      status: "unavailable",
      message: "No embedded depth plane.",
      warnings: ["No embedded depth plane."]
    });

    expect(html).toContain("No embedded depth plane.");
    expect(html).not.toContain("<canvas");
  });

  it("renders available depth metadata and canvas target", () => {
    const state: DepthVisualizationAvailable = {
      status: "available",
      sourceKind: "disparity",
      width: 768,
      height: 576,
      inputWidth: 576,
      inputHeight: 768,
      minValue: 3.917969,
      maxValue: 12.304688,
      valueRangeKind: "apdi-float-range",
      valueUnit: "disparity",
      rawMin: 0,
      rawMax: 255,
      orientation: "appleAuxiliaryDepthNative",
      photoOrientation: "cgImagePropertyOrientation:6",
      rotation: "clockwise90",
      previewRgba: new Uint8ClampedArray(768 * 576 * 4),
      warnings: []
    };

    const html = renderDepthPanel(state);

    expect(html).toContain('id="depthCanvas"');
    expect(html).toContain("768 × 576");
    expect(html).toContain("3.9180 – 12.3047 disparity");
    expect(html).toContain("clockwise90");
  });
});

describe("renderOriginalPreviewResult", () => {
  it("renders fallback loading copy", () => {
    const html = renderOriginalPreviewLoading("capture.HEIC");

    expect(html).toContain("Decoding original image with WASM.");
    expect(html).toContain("capture.HEIC");
  });

  it("renders unavailable original preview without a canvas", () => {
    const html = renderOriginalPreviewResult(
      {
        status: "unavailable",
        message: "No HEIF primary image was found.",
        warnings: ["No HEIF primary image was found."]
      },
      "capture.HEIC"
    );

    expect(html).toContain("No HEIF primary image was found.");
    expect(html).not.toContain("<canvas");
  });

  it("renders available original preview canvas", () => {
    const state: OriginalPreviewAvailable = {
      status: "available",
      sourceKind: "heif-primary-image",
      width: 1200,
      height: 900,
      inputWidth: 3024,
      inputHeight: 4032,
      orientedWidth: 4032,
      orientedHeight: 3024,
      photoOrientation: "cgImagePropertyOrientation:6",
      rotation: "clockwise90",
      scale: 0.2976,
      previewRgba: new Uint8ClampedArray(1200 * 900 * 4),
      warnings: []
    };

    const html = renderOriginalPreviewResult(state, "capture.HEIC");

    expect(html).toContain('id="originalFallbackCanvas"');
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="900"');
  });
});

describe("renderPixelProjectionPanel", () => {
  it("renders unavailable projection without a viewer target", () => {
    const html = renderPixelProjectionPanel({
      status: "unavailable",
      message: "No embedded depth pixels.",
      warnings: ["No embedded depth pixels."]
    });

    expect(html).toContain("No embedded depth pixels.");
    expect(html).not.toContain("geometryViewer");
  });

  it("renders available relative point cloud metadata and viewer target", () => {
    const state: ProjectedPixelCloud = {
      status: "available",
      geometryKind: "signed-depth-pixel-point-cloud",
      viewMode: "capture-camera",
      cameraModel: "metadata-pinhole",
      imageWidth: 576,
      imageHeight: 768,
      fx: 721.25,
      fy: 719.5,
      cx: 288,
      cy: 384,
      sourceKind: "disparity",
      valueUnit: "disparity",
      relativeGeometry: true,
      pointCount: 8192,
      sampleStep: 3,
      width: 576,
      height: 768,
      inputDepthWidth: 576,
      inputDepthHeight: 768,
      rgbWidth: 3024,
      rgbHeight: 4032,
      orientation: "appleAuxiliaryDepthNative",
      photoOrientation: "cgImagePropertyOrientation:6",
      rotation: "none",
      depthRange: {
        min: 3.917969,
        max: 12.304688,
        kind: "apdi-float-range",
        rawMin: 0,
        rawMax: 255
      },
      positions: new Float32Array(8192 * 3),
      colors: new Uint8Array(8192 * 3),
      mesh: {
        gridWidth: 192,
        gridHeight: 256,
        triangleCount: 88420,
        skippedTriangleCount: 120,
        discontinuityThreshold: 0.35,
        colorMode: "vertex-rgb",
        indices: new Uint32Array(88420 * 3)
      },
      warnings: ["relative geometry"]
    };

    const html = renderPixelProjectionPanel(state);

    expect(html).toContain('id="geometryViewer"');
    expect(html).toContain('data-geometry-mode="point-cloud" aria-pressed="true"');
    expect(html).toContain('data-geometry-mode="mesh-rgb" aria-pressed="false"');
    expect(html).toContain("Point Cloud");
    expect(html).toContain("Mesh RGB");
    expect(html).toContain("signed-depth-pixel-point-cloud");
    expect(html).toContain("capture camera");
    expect(html).toContain("metadata-pinhole");
    expect(html).toContain("8192");
    expect(html).toContain("every 3 px");
    expect(html).toContain("576 × 768");
    expect(html).toContain("3024 × 4032");
    expect(html).toContain("721.2500 × 719.5000");
    expect(html).toContain("288 × 384");
    expect(html).toContain("appleAuxiliaryDepthNative");
    expect(html).toContain("cgImagePropertyOrientation:6");
    expect(html).toContain("relative");
    expect(html).toContain("3.9180 – 12.3047 disparity");
    expect(html).toContain("192 × 256");
    expect(html).toContain("88420");
    expect(html).toContain("120");
    expect(html).toContain("vertex RGB");
    expect(html).toContain("0.3500");
  });
});
