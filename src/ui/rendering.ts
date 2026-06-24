import type { DepthPanelState, DepthVisualizationAvailable } from "../depth/types";
import type { PixelProjectionState, ProjectedPixelCloud } from "../geometry/types";
import type { OriginalPreviewAvailable, OriginalPreviewResult } from "../original/types";
import type { CombinedVerificationResult, VerificationCheck } from "../verifier/types";

export function renderVerificationBusy(fileName: string, fileSize: number): string {
  return `
    <div class="status-line">
      <span class="status-pill status-pill--busy">verifying</span>
      <span>${escapeHtml(fileName)} · ${formatBytes(fileSize)}</span>
    </div>
  `;
}

export function renderVerificationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `
    <div class="status-line">
      <span class="status-pill status-pill--invalid">invalid</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

export function renderVerificationResult(result: CombinedVerificationResult): string {
  const serverStatus = result.server
    ? `${result.server.status}${result.server.reason ? ` · ${result.server.reason}` : ""}`
    : result.serverError ?? "not run";

  return `
    <div class="status-line">
      <span class="status-pill status-pill--${result.finalStatus}">${result.finalStatus}</span>
      <span>${escapeHtml(result.fileName)} · ${formatBytes(result.fileSize)}</span>
    </div>
    <dl class="summary-grid">
      <div>
        <dt>Capture ID</dt>
        <dd>${escapeHtml(result.local.captureId ?? "missing")}</dd>
      </div>
      <div>
        <dt>Captured At</dt>
        <dd>${escapeHtml(result.local.capturedAt ?? "missing")}</dd>
      </div>
      <div>
        <dt>Format</dt>
        <dd>${escapeHtml(result.local.manifest?.containerFormat ?? "unknown")}</dd>
      </div>
      <div>
        <dt>Server</dt>
        <dd>${escapeHtml(serverStatus)}</dd>
      </div>
      <div>
        <dt>Asset SHA-256</dt>
        <dd>${escapeHtml(result.local.recomputed?.assetSHA256 ?? "missing")}</dd>
      </div>
      <div>
        <dt>Signing Binding SHA-256</dt>
        <dd>${escapeHtml(result.local.recomputed?.signingBindingSHA256 ?? "missing")}</dd>
      </div>
    </dl>
    <p class="summary">${escapeHtml(result.local.summary)}</p>
    <details class="checks-disclosure">
      <summary>Local content binding checks</summary>
      <div class="checks">
        ${result.local.checks.map(renderCheck).join("")}
      </div>
    </details>
  `;
}

export function renderDepthPanel(state: DepthPanelState): string {
  if (state.status === "idle") {
    return renderDepthMessage("No depth data selected.");
  }
  if (state.status === "loading") {
    return renderDepthMessage("Reading embedded depth data.");
  }
  if (state.status === "unavailable") {
    return renderDepthMessage(state.message);
  }
  if (state.status === "error") {
    return renderDepthMessage(state.message);
  }

  return `
    <div class="depth-canvas-frame">
      <canvas id="depthCanvas" width="${state.width}" height="${state.height}" aria-label="Embedded depth visualization"></canvas>
    </div>
    <dl class="depth-meta">
      <div>
        <dt>Source</dt>
        <dd>${escapeHtml(state.sourceKind)}</dd>
      </div>
      <div>
        <dt>Size</dt>
        <dd>${state.width} × ${state.height}</dd>
      </div>
      <div>
        <dt>Range</dt>
        <dd>${formatNumber(state.minValue)} – ${formatNumber(state.maxValue)} ${escapeHtml(state.valueUnit)}</dd>
      </div>
      <div>
        <dt>Rotation</dt>
        <dd>${escapeHtml(state.rotation)}</dd>
      </div>
    </dl>
    ${renderDepthWarnings(state)}
  `;
}

export function renderPixelProjectionPanel(state: PixelProjectionState): string {
  if (state.status === "idle") {
    return renderProjectionMessage("No projection data selected.");
  }
  if (state.status === "loading") {
    return renderProjectionMessage("Building point cloud.");
  }
  if (state.status === "unavailable") {
    return renderProjectionMessage(state.message);
  }
  if (state.status === "error") {
    return renderProjectionMessage(state.message);
  }

  return `
    <div class="geometry-viewer-shell">
      <div id="geometryViewer" class="geometry-viewer" aria-label="Relative 3D pixel projection"></div>
      <button class="geometry-reset" type="button" data-geometry-reset>Reset view</button>
    </div>
    <dl class="depth-meta geometry-meta">
      <div>
        <dt>Geometry</dt>
        <dd>${escapeHtml(state.geometryKind)}</dd>
      </div>
      <div>
        <dt>Points</dt>
        <dd>${state.pointCount}</dd>
      </div>
      <div>
        <dt>Sample</dt>
        <dd>${formatSampleStep(state.sampleStep)}</dd>
      </div>
      <div>
        <dt>Projected Depth</dt>
        <dd>${state.width} × ${state.height}</dd>
      </div>
      <div>
        <dt>Source Depth</dt>
        <dd>${state.inputDepthWidth} × ${state.inputDepthHeight}</dd>
      </div>
      <div>
        <dt>RGB</dt>
        <dd>${state.rgbWidth} × ${state.rgbHeight}</dd>
      </div>
      <div>
        <dt>Range</dt>
        <dd>${formatNumber(state.depthRange.min)} – ${formatNumber(state.depthRange.max)} ${escapeHtml(state.valueUnit)}</dd>
      </div>
      <div>
        <dt>Rotation</dt>
        <dd>${escapeHtml(state.rotation)}</dd>
      </div>
      <div>
        <dt>Depth Orientation</dt>
        <dd>${escapeHtml(state.orientation)}</dd>
      </div>
      <div>
        <dt>Photo Orientation</dt>
        <dd>${escapeHtml(state.photoOrientation)}</dd>
      </div>
      <div>
        <dt>Scale</dt>
        <dd>${state.relativeGeometry ? "relative" : "metric"}</dd>
      </div>
    </dl>
    ${renderProjectionWarnings(state)}
  `;
}

export function renderOriginalPreviewLoading(fileName: string): string {
  return `
    <div class="preview-message">
      <span>Browser preview is unavailable for ${escapeHtml(fileName)}. Decoding original image with WASM.</span>
    </div>
  `;
}

export function renderOriginalPreviewResult(state: OriginalPreviewResult, fileName: string): string {
  if (state.status === "unavailable" || state.status === "error") {
    return `
      <div class="preview-message">
        <span>Original preview is not available for ${escapeHtml(fileName)}. ${escapeHtml(state.message)}</span>
      </div>
    `;
  }

  return `
    <canvas
      id="originalFallbackCanvas"
      width="${state.width}"
      height="${state.height}"
      aria-label="Original image preview decoded from HEIC"
    ></canvas>
    ${renderOriginalWarnings(state)}
  `;
}

export function drawDepthCanvas(result: DepthVisualizationAvailable, canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Depth canvas 2D context is unavailable.");
  }

  canvas.width = result.width;
  canvas.height = result.height;
  context.putImageData(new ImageData(result.previewRgba as ImageDataArray, result.width, result.height), 0, 0);
}

export function drawOriginalCanvas(result: OriginalPreviewAvailable, canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Original preview canvas 2D context is unavailable.");
  }

  canvas.width = result.width;
  canvas.height = result.height;
  context.putImageData(new ImageData(result.previewRgba as ImageDataArray, result.width, result.height), 0, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return character;
    }
  });
}

function renderDepthMessage(message: string): string {
  return `
    <div class="depth-message">
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderProjectionMessage(message: string): string {
  return `
    <div class="geometry-message">
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function formatSampleStep(sampleStep: number): string {
  return sampleStep <= 1 ? "every pixel" : `every ${sampleStep} px`;
}

function renderDepthWarnings(state: DepthVisualizationAvailable): string {
  if (state.warnings.length === 0) {
    return "";
  }

  return `
    <ul class="depth-warnings">
      ${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
    </ul>
  `;
}

function renderOriginalWarnings(state: OriginalPreviewAvailable): string {
  if (state.warnings.length === 0) {
    return "";
  }

  return `
    <ul class="depth-warnings">
      ${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
    </ul>
  `;
}

function renderProjectionWarnings(state: ProjectedPixelCloud): string {
  if (state.warnings.length === 0) {
    return "";
  }

  return `
    <ul class="depth-warnings">
      ${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
    </ul>
  `;
}

function renderCheck(check: VerificationCheck): string {
  return `
    <article class="check check--${check.status}">
      <div>
        <strong>${escapeHtml(check.label)}</strong>
        <p>${escapeHtml(check.detail)}</p>
      </div>
      <span>${check.status}</span>
    </article>
  `;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
}
