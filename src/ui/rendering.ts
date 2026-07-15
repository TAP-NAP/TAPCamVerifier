import { t } from "../i18n/i18n";
import type { DepthPanelState, DepthVisualizationAvailable } from "../depth/types";
import { defaultFilterOptions, filterProjectedPixelCloud, formatSensitivity } from "../geometry/filtering";
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
      <span class="status-pill status-pill--busy">${t("status.verifying")}</span>
      <span>${escapeHtml(fileName)} · ${formatBytes(fileSize)}</span>
    </div>
  `;
}

export function renderVerificationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `
    <div class="status-line">
      <span class="status-pill status-pill--invalid">${t("status.invalid")}</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

export function renderVerificationSuccessGate(result: CombinedVerificationResult): string {
  return renderResultModal("success", {
    title: t("modal.validTitle"),
    desc: t("modal.validDesc"),
    detail: t("modal.validNote", { fileName: result.fileName, fileSize: formatBytes(result.fileSize) }),
    buttonText: t("modal.viewDetails")
  });
}

export type ResultModalType = "success" | "invalid" | "noSignature" | "networkError" | "parseError";

export interface ResultModalConfig {
  title: string;
  desc: string;
  detail?: string;
  buttonText: string;
}

export function renderResultModal(type: ResultModalType, config: ResultModalConfig): string {
  const iconSvg = getModalIcon(type);
  return `
    <div class="result-modal-backdrop" data-result-modal role="dialog" aria-modal="true" aria-labelledby="result-modal-title">
      <div class="result-modal result-modal--${type}">
        <div class="result-modal-icon">${iconSvg}</div>
        <h3 id="result-modal-title" class="result-modal-title">${escapeHtml(config.title)}</h3>
        <p class="result-modal-desc">${escapeHtml(config.desc)}</p>
        ${config.detail ? `<p class="result-modal-detail">${escapeHtml(config.detail)}</p>` : ""}
        <button class="result-modal-btn" type="button" data-result-modal-close>${escapeHtml(config.buttonText)}</button>
      </div>
    </div>
  `;
}

function getModalIcon(type: ResultModalType): string {
  switch (type) {
    case "success":
      return '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    case "invalid":
      return '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    case "noSignature":
      return '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    case "networkError":
      return '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>';
    case "parseError":
      return '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  }
}

export function classifyResult(result: CombinedVerificationResult): ResultModalType {
  if (result.finalStatus === "valid") {
    return "success";
  }
  if (result.serverError && result.local.status === "valid") {
    return "networkError";
  }
  const parseCheck = result.local.checks.find((c) => c.id === "parse");
  if (parseCheck && parseCheck.status === "fail") {
    return "noSignature";
  }
  return "invalid";
}

export function renderVerificationResult(result: CombinedVerificationResult): string {
  const serverStatus = result.server
    ? `${result.server.status}${result.server.reason ? ` · ${result.server.reason}` : ""}`
    : result.serverError ?? t("result.notRun");

  const statusText = result.finalStatus === "valid" ? t("status.valid") : t("status.invalid");

  return `
    <div class="status-line">
      <span class="status-pill status-pill--${result.finalStatus}">${statusText}</span>
      <span>${escapeHtml(result.fileName)} · ${formatBytes(result.fileSize)}</span>
    </div>
    <dl class="summary-grid">
      <div>
        <dt>${t("result.captureId")}</dt>
        <dd>${escapeHtml(result.local.captureId ?? t("result.missing"))}</dd>
      </div>
      <div>
        <dt>${t("result.capturedAt")}</dt>
        <dd>${escapeHtml(result.local.capturedAt ?? t("result.missing"))}</dd>
      </div>
      <div>
        <dt>${t("result.format")}</dt>
        <dd>${escapeHtml(result.local.manifest?.containerFormat ?? "unknown")}</dd>
      </div>
      <div>
        <dt>${t("result.media")}</dt>
        <dd>${escapeHtml(formatMediaKind(result.local.mediaKind))}</dd>
      </div>
      <div>
        <dt>${t("result.scope")}</dt>
        <dd>${escapeHtml(formatVerificationScope(result.local.verificationScope))}</dd>
      </div>
      <div>
        <dt>${t("result.livePhotoVideo")}</dt>
        <dd>${escapeHtml(formatLivePhotoVideoStatus(result.local))}</dd>
      </div>
      <div>
        <dt>${t("result.server")}</dt>
        <dd>${escapeHtml(serverStatus)}</dd>
      </div>
      <div>
        <dt>${t("result.assetSha")}</dt>
        <dd>${escapeHtml(result.local.recomputed?.assetSHA256 ?? t("result.missing"))}</dd>
      </div>
      <div>
        <dt>${t("result.signingSha")}</dt>
        <dd>${escapeHtml(result.local.recomputed?.signingBindingSHA256 ?? t("result.missing"))}</dd>
      </div>
      <div>
        <dt>${t("result.serverEchoSha")}</dt>
        <dd>${escapeHtml(formatServerEcho(result.serverBoundary))}</dd>
      </div>
      <div>
        <dt>${t("result.serverBoundary")}</dt>
        <dd>${escapeHtml(formatServerBoundaryStatus(result.serverBoundary))}</dd>
      </div>
    </dl>
    <p class="summary">${escapeHtml(result.local.summary)}</p>
    ${renderVerificationWarnings(result.local)}
    ${renderServerBoundaryDiagnostic(result.serverBoundary)}
    <details class="checks-disclosure">
      <summary>${t("checks.title")}</summary>
      <div class="checks">
        ${result.local.checks.map(renderCheck).join("")}
      </div>
    </details>
  `;
}

function formatMediaKind(mediaKind: string | undefined): string {
  if (mediaKind === "livePhoto") {
    return t("media.livePhoto");
  }
  if (mediaKind === "stillPhoto") {
    return t("media.stillPhoto");
  }
  return mediaKind ?? "unknown";
}

function formatVerificationScope(scope: string | undefined): string {
  if (scope === "fullLivePhoto") {
    return t("scope.fullLivePhoto");
  }
  if (scope === "primaryPhotoFromLivePhoto") {
    return t("scope.primaryPhoto");
  }
  if (scope === "stillPhoto") {
    return t("scope.stillPhoto");
  }
  return scope ?? "unknown";
}

function formatLivePhotoVideoStatus(local: CombinedVerificationResult["local"]): string {
  if (local.mediaKind !== "livePhoto") {
    return t("video.notRequired");
  }

  const pairedVideo = local.livePhoto?.pairedVideo;
  const status = pairedVideo?.status ?? "unknown";
  const filename = local.livePhoto?.pairedVideoFilename ?? "paired-video.mov";
  if (status === "matched") {
    return t("video.verified", { filename });
  }
  if (status === "missing") {
    return t("video.notSupplied", { filename });
  }
  if (status === "mismatch") {
    return t("video.mismatch", { filename });
  }
  return `${filename} ${status}`;
}

function formatWarningSeverity(severity: string | undefined): string {
  switch (severity) {
    case "high":
      return t("warning.high");
    case "warning":
      return t("warning.warning");
    case "notice":
      return t("warning.notice");
    case "info":
      return t("warning.info");
    default:
      return t("warning.warning");
  }
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
            <strong>${escapeHtml(formatWarningSeverity(warning.severity))}</strong>
            ${escapeHtml(warning.message ?? "Verification scope warning.")}
          </li>
        `)
        .join("")}
    </ul>
  `;
}

function formatServerBoundaryStatus(diagnostic: ServerBoundaryDiagnostic): string {
  if (diagnostic.status === "matched") {
    return t("server.matched");
  }
  if (diagnostic.status === "mismatch") {
    return t("server.drift");
  }
  if (diagnostic.status === "not-echoed") {
    return t("result.notEchoed");
  }
  return t("result.notRun");
}

function formatServerEcho(diagnostic: ServerBoundaryDiagnostic): string {
  if (diagnostic.serverSigningBindingSHA256) {
    return diagnostic.serverSigningBindingSHA256;
  }
  return diagnostic.status === "not-run" ? t("result.notRun") : t("result.notEchoed");
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
    return renderDepthMessage(t("depth.noData"));
  }
  if (state.status === "loading") {
    return renderDepthMessage(t("depth.loading"));
  }
  if (state.status === "unavailable") {
    return renderDepthMessage(state.message);
  }
  if (state.status === "error") {
    return renderDepthMessage(state.message);
  }

  return `
    <div class="depth-canvas-frame">
      <canvas id="depthCanvas" width="${state.width}" height="${state.height}" aria-label="${t("depth.ariaLabel")}"></canvas>
    </div>
    <dl class="depth-meta">
      <div>
        <dt>${t("depth.source")}</dt>
        <dd>${escapeHtml(state.sourceKind)}</dd>
      </div>
      <div>
        <dt>${t("depth.size")}</dt>
        <dd>${state.width} × ${state.height}</dd>
      </div>
      <div>
        <dt>${t("depth.range")}</dt>
        <dd>${formatNumber(state.minValue)} – ${formatNumber(state.maxValue)} ${escapeHtml(state.valueUnit)}</dd>
      </div>
      <div>
        <dt>${t("depth.rotation")}</dt>
        <dd>${escapeHtml(state.rotation)}</dd>
      </div>
    </dl>
    ${renderDepthWarnings(state)}
  `;
}

export function renderPixelProjectionPanel(state: PixelProjectionState): string {
  if (state.status === "idle") {
    return renderProjectionMessage(t("geom.noData"));
  }
  if (state.status === "loading") {
    return renderProjectionMessage(t("geom.loading"));
  }
  if (state.status === "unavailable") {
    return renderProjectionMessage(state.message);
  }
  if (state.status === "error") {
    return renderProjectionMessage(state.message);
  }

  const defaultFilter = defaultFilterOptions();
  const defaultFiltered = filterProjectedPixelCloud(state, defaultFilter);
  const initialFilterText = `${t("filter.raw")} · ${formatSensitivity(defaultFilter.sensitivity)}`;
  return `
    <div class="geometry-viewer-shell">
      <div id="geometryViewer" class="geometry-viewer" aria-label="${t("geom.ariaLabel")}"></div>
      ${renderGeometryFilterControls()}
      <button class="geometry-reset" type="button" data-geometry-reset>${t("geom.resetView")}</button>
    </div>
    <dl class="depth-meta geometry-meta">
      <div>
        <dt>${t("geom.geometry")}</dt>
        <dd>${escapeHtml(state.geometryKind)}</dd>
      </div>
      <div>
        <dt>${t("geom.view")}</dt>
        <dd>${escapeHtml(formatProjectionViewMode(state.viewMode))}</dd>
      </div>
      <div>
        <dt>${t("geom.cameraModel")}</dt>
        <dd>${escapeHtml(state.cameraModel)}</dd>
      </div>
      <div>
        <dt>${t("geom.points")}</dt>
        <dd>${state.pointCount}</dd>
      </div>
      <div>
        <dt>${t("geom.visiblePoints")}</dt>
        <dd><span data-geometry-visible-points>${defaultFiltered.visiblePointCount}</span> / ${defaultFiltered.totalPointCount}</dd>
      </div>
      <div>
        <dt>${t("geom.filter")}</dt>
        <dd data-geometry-active-filter>${initialFilterText}</dd>
      </div>
      <div>
        <dt>${t("geom.globalRisk")}</dt>
        <dd>${escapeHtml(state.quality.globalRisk)}</dd>
      </div>
      <div>
        <dt>${t("geom.sample")}</dt>
        <dd>${formatSampleStep(state.sampleStep)}</dd>
      </div>
      <div>
        <dt>${t("geom.projectedDepth")}</dt>
        <dd>${state.width} × ${state.height}</dd>
      </div>
      <div>
        <dt>${t("geom.sourceDepth")}</dt>
        <dd>${state.inputDepthWidth} × ${state.inputDepthHeight}</dd>
      </div>
      <div>
        <dt>${t("geom.rgb")}</dt>
        <dd>${state.rgbWidth} × ${state.rgbHeight}</dd>
      </div>
      <div>
        <dt>${t("geom.focal")}</dt>
        <dd>${formatNumber(state.fx)} × ${formatNumber(state.fy)}</dd>
      </div>
      <div>
        <dt>${t("geom.principal")}</dt>
        <dd>${formatNumber(state.cx)} × ${formatNumber(state.cy)}</dd>
      </div>
      <div>
        <dt>${t("depth.range")}</dt>
        <dd>${formatNumber(state.depthRange.min)} – ${formatNumber(state.depthRange.max)} ${escapeHtml(state.valueUnit)}</dd>
      </div>
      <div>
        <dt>${t("depth.rotation")}</dt>
        <dd>${escapeHtml(state.rotation)}</dd>
      </div>
      <div>
        <dt>${t("geom.depthOrient")}</dt>
        <dd>${escapeHtml(state.orientation)}</dd>
      </div>
      <div>
        <dt>${t("geom.photoOrient")}</dt>
        <dd>${escapeHtml(state.photoOrientation)}</dd>
      </div>
      <div>
        <dt>${t("geom.scale")}</dt>
        <dd>${state.relativeGeometry ? t("geom.relative") : t("geom.metric")}</dd>
      </div>
      <div>
        <dt>${t("geom.clipped")}</dt>
        <dd>${formatRatio(state.quality.metrics.clippedLowRatio + state.quality.metrics.clippedHighRatio)}</dd>
      </div>
      <div>
        <dt>${t("geom.outliers")}</dt>
        <dd>${formatRatio(state.quality.metrics.outlierRatio)}</dd>
      </div>
      <div>
        <dt>${t("geom.discontinuities")}</dt>
        <dd>${formatRatio(state.quality.metrics.discontinuityRatio)}</dd>
      </div>
    </dl>
    ${renderProjectionWarnings(state)}
  `;
}

export function renderOriginalPreviewLoading(fileName: string): string {
  return `
    <div class="preview-message">
      <span>${t("orig.browserUnavailable", { fileName })}</span>
    </div>
  `;
}

export function renderOriginalPreviewResult(state: OriginalPreviewResult, fileName: string): string {
  if (state.status === "unavailable" || state.status === "error") {
    return `
      <div class="preview-message">
        <span>${t("orig.unavailable", { fileName, message: state.message })}</span>
      </div>
    `;
  }

  return `
    <canvas
      id="originalFallbackCanvas"
      width="${state.width}"
      height="${state.height}"
      aria-label="${t("orig.ariaLabel")}"
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
  return sampleStep <= 1 ? t("geom.everyPixel") : t("geom.everyNPx", { n: sampleStep });
}

function formatRatio(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatProjectionViewMode(viewMode: string): string {
  return viewMode === "capture-camera" ? t("geom.captureCamera") : viewMode;
}

function renderGeometryFilterControls(): string {
  return `
      <div class="geometry-filter-panel" data-geometry-filter-panel>
      <button class="geometry-filter-collapse" data-geometry-filter-toggle type="button" aria-expanded="true" aria-label="${t("filter.collapse")}"></button>
      <div class="geometry-filter-body" data-geometry-filter-body>
        <label class="geometry-sensitivity-control">
          <span>${t("filter.sensitivity")}</span>
          <input data-geometry-filter-sensitivity type="range" min="0" max="2" step="1" value="1" />
          <b data-geometry-filter-sensitivity-label>${t("filter.medium")}</b>
        </label>
        <div class="geometry-filter-group geometry-risk-types">
          <div class="geometry-risk-title">${t("filter.riskMarkers")}</div>
          ${renderRiskTypeControl(
            "clipped",
            t("filter.clippedDepth"),
            t("filter.clippedDesc"),
            true,
            false
          )}
          ${renderRiskTypeControl(
            "outliers",
            t("filter.isolatedOutliers"),
            t("filter.outliersDesc"),
            true,
            false
          )}
          ${renderRiskTypeControl(
            "edges",
            t("filter.depthEdges"),
            t("filter.edgesDesc"),
            true,
            false
          )}
          ${renderRiskTypeControl(
            "color",
            t("filter.colorRisk"),
            t("filter.colorDesc"),
            true,
            false,
            t("filter.unstable")
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
        ${showChecked ? t("filter.show") : t("filter.hide")}
      </button>
      <button class="geometry-risk-toggle geometry-risk-toggle--highlight" data-geometry-risk-highlight="${id}" type="button" aria-pressed="${highlightChecked ? "true" : "false"}"${highlightDisabled ? " disabled" : ""}>
        ${highlightChecked ? t("filter.highlight") : t("filter.unhighlight")}
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
            <strong>${escapeHtml(formatWarningSeverity(warning.severity))}</strong>
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
