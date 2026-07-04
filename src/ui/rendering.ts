import type { DepthPanelState, DepthVisualizationAvailable } from "../depth/types";
import { defaultFilterOptions, filterProjectedPixelCloud } from "../geometry/filtering";
import type { PixelProjectionState, ProjectedPixelCloud } from "../geometry/types";
import type { OriginalPreviewAvailable, OriginalPreviewResult } from "../original/types";
import type {
  CombinedVerificationResult,
  ServerBoundaryDiagnostic,
  VerificationCheck
} from "../verifier/types";

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

export function renderVerificationSuccessGate(result: CombinedVerificationResult): string {
  return `
    <div class="verification-modal" role="status" aria-live="polite">
      <div class="verification-modal-panel">
        <div class="verification-banner verification-banner--valid">
          <span class="status-pill status-pill--valid">valid</span>
          <div>
            <strong>照片验签通过</strong>
            <span>该照片由 TAPCam 拍摄</span>
          </div>
        </div>
        <p class="summary verification-gate-note">${escapeHtml(result.fileName)} · ${formatBytes(result.fileSize)} · 分析过程已在后台继续运行。点击页面任意位置可立即查看验签细节。</p>
      </div>
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
        <dt>Media</dt>
        <dd>${escapeHtml(formatMediaKind(result.local.mediaKind))}</dd>
      </div>
      <div>
        <dt>Verified Scope</dt>
        <dd>${escapeHtml(formatVerificationScope(result.local.verificationScope))}</dd>
      </div>
      <div>
        <dt>Live Photo Video</dt>
        <dd>${escapeHtml(formatLivePhotoVideoStatus(result.local))}</dd>
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
      <div>
        <dt>Server Echo SHA-256</dt>
        <dd>${escapeHtml(formatServerEcho(result.serverBoundary))}</dd>
      </div>
      <div>
        <dt>Server Boundary</dt>
        <dd>${escapeHtml(formatServerBoundaryStatus(result.serverBoundary))}</dd>
      </div>
    </dl>
    <p class="summary">${escapeHtml(result.local.summary)}</p>
    ${renderVerificationWarnings(result.local)}
    ${renderServerBoundaryDiagnostic(result.serverBoundary)}
    <details class="checks-disclosure">
      <summary>Local content binding checks</summary>
      <div class="checks">
        ${result.local.checks.map(renderCheck).join("")}
      </div>
    </details>
  `;
}

function formatMediaKind(mediaKind: string | undefined): string {
  if (mediaKind === "livePhoto") {
    return "Live Photo";
  }
  if (mediaKind === "stillPhoto") {
    return "Still photo";
  }
  return mediaKind ?? "unknown";
}

function formatVerificationScope(scope: string | undefined): string {
  if (scope === "fullLivePhoto") {
    return "Full Live Photo";
  }
  if (scope === "primaryPhotoFromLivePhoto") {
    return "Live Photo primary photo";
  }
  if (scope === "stillPhoto") {
    return "Still photo";
  }
  return scope ?? "unknown";
}

function formatLivePhotoVideoStatus(local: CombinedVerificationResult["local"]): string {
  if (local.mediaKind !== "livePhoto") {
    return "not required";
  }

  const pairedVideo = local.livePhoto?.pairedVideo;
  const status = pairedVideo?.status ?? "unknown";
  const filename = local.livePhoto?.pairedVideoFilename ?? "paired-video.mov";
  if (status === "matched") {
    return `${filename} verified`;
  }
  if (status === "missing") {
    return `${filename} not supplied`;
  }
  if (status === "mismatch") {
    return `${filename} mismatch`;
  }
  return `${filename} ${status}`;
}

function renderVerificationWarnings(local: CombinedVerificationResult["local"]): string {
  const warnings = local.warnings ?? [];
  if (warnings.length === 0) {
    return "";
  }

  return `
    <ul class="verification-warnings">
      ${warnings
        .map((warning) => `
          <li>
            <strong>${escapeHtml(warning.severity ?? "warning")}</strong>
            ${escapeHtml(warning.message ?? "Verification scope warning.")}
          </li>
        `)
        .join("")}
    </ul>
  `;
}

function formatServerBoundaryStatus(diagnostic: ServerBoundaryDiagnostic): string {
  if (diagnostic.status === "matched") {
    return "matched";
  }
  if (diagnostic.status === "mismatch") {
    return "integration drift";
  }
  if (diagnostic.status === "not-echoed") {
    return "not echoed";
  }
  return "not run";
}

function formatServerEcho(diagnostic: ServerBoundaryDiagnostic): string {
  if (diagnostic.serverSigningBindingSHA256) {
    return diagnostic.serverSigningBindingSHA256;
  }
  return diagnostic.status === "not-run" ? "not run" : "not echoed";
}

function renderServerBoundaryDiagnostic(diagnostic: ServerBoundaryDiagnostic): string {
  return `
    <p class="summary server-boundary server-boundary--${diagnostic.status}">
      ${escapeHtml(diagnostic.summary)}
    </p>
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

  const defaultFilter = defaultFilterOptions();
  const defaultFiltered = filterProjectedPixelCloud(state, defaultFilter);
  return `
    <div class="geometry-viewer-shell">
      <div id="geometryViewer" class="geometry-viewer" aria-label="Relative 3D pixel projection"></div>
      ${renderGeometryFilterControls()}
      <button class="geometry-reset" type="button" data-geometry-reset>Reset view</button>
    </div>
    <dl class="depth-meta geometry-meta">
      <div>
        <dt>Geometry</dt>
        <dd>${escapeHtml(state.geometryKind)}</dd>
      </div>
      <div>
        <dt>View</dt>
        <dd>${escapeHtml(formatProjectionViewMode(state.viewMode))}</dd>
      </div>
      <div>
        <dt>Camera Model</dt>
        <dd>${escapeHtml(state.cameraModel)}</dd>
      </div>
      <div>
        <dt>Points</dt>
        <dd>${state.pointCount}</dd>
      </div>
      <div>
        <dt>Visible Points</dt>
        <dd><span data-geometry-visible-points>${defaultFiltered.visiblePointCount}</span> / ${defaultFiltered.totalPointCount}</dd>
      </div>
      <div>
        <dt>Filter</dt>
        <dd data-geometry-active-filter>Raw · Medium</dd>
      </div>
      <div>
        <dt>Global Risk</dt>
        <dd>${escapeHtml(state.quality.globalRisk)}</dd>
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
        <dt>Focal</dt>
        <dd>${formatNumber(state.fx)} × ${formatNumber(state.fy)}</dd>
      </div>
      <div>
        <dt>Principal Point</dt>
        <dd>${formatNumber(state.cx)} × ${formatNumber(state.cy)}</dd>
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
      <div>
        <dt>Clipped</dt>
        <dd>${formatRatio(state.quality.metrics.clippedLowRatio + state.quality.metrics.clippedHighRatio)}</dd>
      </div>
      <div>
        <dt>Outliers</dt>
        <dd>${formatRatio(state.quality.metrics.outlierRatio)}</dd>
      </div>
      <div>
        <dt>Discontinuities</dt>
        <dd>${formatRatio(state.quality.metrics.discontinuityRatio)}</dd>
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

function formatRatio(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatProjectionViewMode(viewMode: string): string {
  return viewMode === "capture-camera" ? "capture camera" : viewMode;
}

function renderGeometryFilterControls(): string {
  return `
      <div class="geometry-filter-panel" data-geometry-filter-panel>
      <button class="geometry-filter-collapse" data-geometry-filter-toggle type="button" aria-expanded="true" aria-label="Collapse point filters"></button>
      <div class="geometry-filter-body" data-geometry-filter-body>
        <label class="geometry-sensitivity-control">
          <span>Sensitivity</span>
          <input data-geometry-filter-sensitivity type="range" min="0" max="2" step="1" value="1" />
          <b data-geometry-filter-sensitivity-label>Medium</b>
        </label>
        <div class="geometry-filter-group geometry-risk-types">
          <div class="geometry-risk-title">Risk markers</div>
          ${renderRiskTypeControl(
            "clipped",
            "Clipped depth",
            "The decoded depth value is near the low or high limit. These samples can flatten surfaces or exaggerate relative spacing, so they are marked for inspection rather than treated as a verification failure.",
            true,
            false
          )}
          ${renderRiskTypeControl(
            "outliers",
            "Isolated outliers",
            "This depth sample differs from a mostly consistent local neighborhood. It is a local noise candidate, not proof that the capture is invalid.",
            true,
            false
          )}
          ${renderRiskTypeControl(
            "edges",
            "Depth edges",
            "Neighboring depth samples change sharply at this point. This often marks a real object boundary, but it can also reveal a depth discontinuity or mapping artifact.",
            true,
            false
          )}
          ${renderRiskTypeControl(
            "color",
            "Color mapping risk",
            "The depth point is still shown, but the RGB color attached to it may be less reliable near aspect-ratio, alignment, or uncorrected-distortion edges.",
            true,
            false,
            "unstable"
          )}
        </div>
      </div>
    </div>
  `;
}

function renderRiskTypeControl(
  id: string,
  label: string,
  description: string,
  showChecked: boolean,
  highlightChecked: boolean,
  badge?: string
): string {
  const highlightDisabled = !showChecked;
  return `
    <div class="geometry-risk-row geometry-risk-row--${id}">
      <span class="geometry-risk-name">
        <span>${escapeHtml(label)}</span>
        ${badge ? `<span class="geometry-risk-badge">${escapeHtml(badge)}</span>` : ""}
        <span class="geometry-risk-swatch geometry-risk-swatch--${id}" aria-hidden="true"></span>
      </span>
      <button class="geometry-risk-toggle geometry-risk-toggle--show" data-geometry-risk-show="${id}" type="button" aria-pressed="${showChecked ? "true" : "false"}">
        ${showChecked ? "Show" : "Hide"}
      </button>
      <button class="geometry-risk-toggle geometry-risk-toggle--highlight" data-geometry-risk-highlight="${id}" type="button" aria-pressed="${highlightChecked ? "true" : "false"}"${highlightDisabled ? " disabled" : ""}>
        ${highlightChecked ? "Highlight" : "Unhighlight"}
      </button>
      <span class="geometry-info" tabindex="0" aria-label="${escapeHtml(description)}" data-tooltip="${escapeHtml(description)}">i</span>
    </div>
  `;
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
  const qualityWarnings = state.quality.warnings;
  if (state.warnings.length === 0 && qualityWarnings.length === 0) {
    return "";
  }

  return `
    <ul class="depth-warnings projection-warnings">
      ${state.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
      ${qualityWarnings
        .map((warning) => `
          <li class="projection-warning projection-warning--${escapeHtml(warning.severity)}">
            <strong>${escapeHtml(warning.severity)}</strong>
            ${escapeHtml(warning.message)}
            ${typeof warning.affectedPointCount === "number" ? `<span>${warning.affectedPointCount} pts</span>` : ""}
          </li>
        `)
        .join("")}
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
