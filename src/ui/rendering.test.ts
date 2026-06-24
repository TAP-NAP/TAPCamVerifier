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
    signingBindingSHA256: "binding"
  },
  serverError: null,
  serverBoundary: {
    status: "matched",
    summary: "Server boundary echo matched the browser/WASM hash of the submitted signingBinding.",
    localSigningBindingSHA256: "binding",
    serverSigningBindingSHA256: "binding"
  },
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
    expect(html).toContain("Server boundary echo matched");
    expect(html).toContain("Server Echo SHA-256");
    expect(html).toContain("Server Boundary");
    expect(html).toContain('<details class="checks-disclosure">');
    expect(html).not.toContain('<details class="checks-disclosure" open>');
    expect(html).toContain("Local content binding checks");
    expect(html).toContain("Recompute asset hash excluding proof slot");
  });

  it("renders a mismatch as server integration drift", () => {
    const html = renderVerificationResult({
      ...result,
      server: {
        status: "valid",
        signingBindingSHA256: "server-binding"
      },
      serverBoundary: {
        status: "mismatch",
        summary:
          "Server boundary integration drift: echoed signingBindingSHA256 does not match the browser/WASM hash of the submitted signingBinding.",
        localSigningBindingSHA256: "binding",
        serverSigningBindingSHA256: "server-binding"
      }
    });

    expect(html).toContain("integration drift");
    expect(html).toContain("server-binding");
    expect(html).toContain("submitted signingBinding");
  });

  it("renders a missing server echo without calling it a content failure", () => {
    const html = renderVerificationResult({
      ...result,
      server: {
        status: "valid"
      },
      serverBoundary: {
        status: "not-echoed",
        summary: "Server response did not echo signingBindingSHA256; boundary comparison was skipped.",
        localSigningBindingSHA256: "binding"
      }
    });

    expect(html).toContain("not echoed");
    expect(html).toContain("boundary comparison was skipped");
  });

  it("renders absent server verification as not run", () => {
    const html = renderVerificationResult({
      ...result,
      server: null,
      serverError: "Failed to fetch",
      serverBoundary: {
        status: "not-run",
        summary: "Server boundary comparison did not run: Failed to fetch.",
        localSigningBindingSHA256: "binding"
      },
      finalStatus: "invalid"
    });

    expect(html).toContain("not run");
    expect(html).toContain("Failed to fetch");
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
      quality: {
        globalRisk: "notice",
        metrics: {
          clippedLowRatio: 0.01,
          clippedHighRatio: 0.02,
          robustRange: 180,
          discontinuityRatio: 0.05,
          outlierRatio: 0.01,
          alignmentRisk: "ok"
        },
        warnings: [
          {
            id: "isolated-depth-outliers",
            severity: "notice",
            filterable: true,
            affectedPointCount: 82,
            message: "Isolated depth samples differ sharply from their local neighborhood."
          }
        ]
      },
      positions: new Float32Array(8192 * 3),
      colors: new Uint8Array(8192 * 3),
      riskFlags: new Uint16Array(8192),
      outlierScores: new Uint8Array(8192),
      discontinuityScores: new Uint8Array(8192),
      warnings: ["relative geometry"]
    };

    const html = renderPixelProjectionPanel(state);

    expect(html).toContain('id="geometryViewer"');
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
    expect(html).toContain("Visible Points");
    expect(html).toContain("Raw · Medium");
    expect(html).toContain("Sensitivity");
    expect(html).not.toContain("Strength");
    expect(html).toContain("data-geometry-filter-toggle");
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain("geometry-risk-header");
    expect(html).toContain("Risk types");
    expect(html).toContain("Show");
    expect(html).toContain("Unhighlight");
    expect(html).toContain("Clipped depth");
    expect(html).toContain("Isolated outliers");
    expect(html).toContain("Depth edges");
    expect(html).toContain("Color mapping risk");
    expect(html).toContain("unstable");
    expect(html).toContain('data-geometry-risk-show="clipped" type="button" aria-pressed="true"');
    expect(html).toContain('data-geometry-risk-show="color" type="button" aria-pressed="true"');
    expect(html).toContain('data-geometry-risk-highlight="color" type="button" aria-pressed="false"');
    expect(html).toContain('data-geometry-risk-highlight="clipped" type="button" aria-pressed="false"');
    expect(html).toContain("The signed depth point remains available");
    expect(html).toContain("notice");
    expect(html).toContain("3.0%");
    expect(html).toContain("Isolated depth samples");
    expect(html).toContain("82 pts");
  });
});
