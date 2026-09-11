import { t } from "../i18n/i18n";
import type { DepthPanelState, DepthVisualizationAvailable } from "../depth/types";
import { defaultFilterOptions, filterProjectedPixelCloud, formatSensitivity } from "../geometry/filtering";
import type { PixelProjectionState, ProjectedPixelCloud } from "../geometry/types";
import type { OriginalPreviewAvailable, OriginalPreviewResult } from "../original/types";
import type { CombinedVerificationResult } from "../verifier/types";

export function renderVerificationBusy(fileName: string, fileSize: number): string {
  return `
    <div class="status-line">
      <span class="status-pill status-pill--busy">${t("status.verifying")}</span>
      <span>${escapeHtml(fileName)} · ${formatBytes(fileSize)}</span>
    </div>
  `;
}

export function renderVerificationError(): string {
  return `
    <div class="status-line">
      <span class="status-pill status-pill--invalid">${t("status.invalid")}</span>
      <span>${t("modal.parseErrorDesc")}</span>
    </div>
  `;
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

export function verificationResultPhase(result: CombinedVerificationResult): number {
  if (result.finalStatus === "valid") return 4;
  if (result.local.status !== "valid" || result.local.checks.some((check) => check.status === "fail")) return 1;
  return result.local.serverRequest ? 3 : 2;
}

export function classifyResult(result: CombinedVerificationResult): ResultModalType {
  if (result.finalStatus === "valid") {
    return "success";
  }
  if (result.serverError && result.local.status === "valid") {
    return "networkError";
  }
  if (result.local.checks.some((check) => check.status === "fail" &&
      ["signature-missing", "video-signature-missing"].includes(check.id))) return "noSignature";
  if (result.local.checks.some((check) => check.status === "fail" &&
      ["parse", "video-container", "video-manifest", "video-proof"].includes(check.id))) return "parseError";
  return "invalid";
}

export function logVerificationDiagnostics(result: CombinedVerificationResult): void {
  // Deliberately omit proof bodies, keys, media bytes, and free-form error text.
  console.info("TAP verification checks", {
    result: result.finalStatus,
    local: result.local.status,
    checks: result.local.checks.map(({ id, status }) => ({ id, status })),
    server: result.server?.status === "valid" ? "valid" : result.server ? "invalid" : "not-run",
    serverBoundary: result.serverBoundary.status
  });
}

export function renderVerificationResult(result: CombinedVerificationResult): string {
  return `
    <div class="status-line">
      <span class="status-pill status-pill--${result.finalStatus}">${t(`status.${result.finalStatus}`)}</span>
      <span>${escapeHtml(result.fileName)} · ${formatBytes(result.fileSize)}</span>
    </div>
    <p class="summary">${t(`result.summary.${classifyResult(result)}`)}</p>
    <dl class="summary-grid">
      <div>
        <dt>${t("result.capturedAt")}</dt>
        <dd>${escapeHtml(result.local.capturedAt ?? t("result.missing"))}</dd>
      </div>
      <div>
        <dt>${t("result.format")}</dt>
        <dd>${escapeHtml(formatContainer(result.local.manifest?.containerFormat))}</dd>
      </div>
      <div>
        <dt>${t("result.media")}</dt>
        <dd>${escapeHtml(formatMediaKind(result.local.mediaKind))}</dd>
      </div>
      <div>
        <dt>${t("result.scope")}</dt>
        <dd>${escapeHtml(formatVerificationScope(result.local.verificationScope))}</dd>
      </div>
      ${result.local.mediaKind === "livePhoto" ? `
      <div>
        <dt>${t("result.livePhotoVideo")}</dt>
        <dd>${escapeHtml(formatLivePhotoVideoStatus(result.local))}</dd>
      </div>` : ""}
    </dl>
  `;
}

function formatContainer(format: string | undefined): string {
  if (format === "heif" || format === "heic") return "HEIC";
  if (format === "jpeg") return "JPEG";
  if (format === "mp4") return "MP4";
  return t("result.missing");
}

function formatMediaKind(mediaKind: string | undefined): string {
  if (mediaKind === "livePhoto") {
    return t("media.livePhoto");
  }
  if (mediaKind === "stillPhoto") {
    return t("media.stillPhoto");
  }
  if (mediaKind === "video") {
    return t("media.video");
  }
  return t("result.missing");
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
  if (scope === "fullVideo") {
    return t("scope.fullVideo");
  }
  return t("result.missing");
}

function formatLivePhotoVideoStatus(local: CombinedVerificationResult["local"]): string {
  switch (local.livePhoto?.pairedVideo?.status) {
    case "matched": return t("video.included");
    case "missing": return t("video.notSupplied");
    case "mismatch": return t("video.mismatch");
    default: return t("video.unchecked");
  }
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

export function renderDepthPanel(state: DepthPanelState): string {
  if (state.status === "idle") {
    return renderDepthMessage(t("depth.noData"));
  }
  if (state.status === "loading") {
    return renderDepthMessage(t("depth.loading"));
  }
  if (state.status === "unavailable") {
    return renderDepthMessage(t("depth.unavailable"));
  }
  if (state.status === "error") {
    return renderDepthMessage(t("depth.unavailable"));
  }

  return `
    <div class="depth-canvas-frame">
      <canvas id="depthCanvas" width="${state.width}" height="${state.height}" aria-label="${t("depth.ariaLabel")}"></canvas>
    </div>
    <div class="depth-legend" aria-label="${t("depth.legendAria")}">
      <div class="depth-legend__scale">
        <span>${t("depth.near")}</span>
        <i aria-hidden="true"></i>
        <span>${t("depth.far")}</span>
      </div>
      <div class="depth-legend__values">
        <span>${formatNumber(state.minValue)} ${escapeHtml(state.valueUnit)}</span>
        <span>${formatNumber(state.maxValue)} ${escapeHtml(state.valueUnit)}</span>
      </div>
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
    return renderProjectionMessage(t("geom.unavailable"));
  }
  if (state.status === "error") {
    return renderProjectionMessage(t("geom.unavailable"));
  }

  const defaultFilter = defaultFilterOptions();
  const defaultFiltered = filterProjectedPixelCloud(state, defaultFilter);
  const initialFilterText = `${t("filter.raw")} · ${formatSensitivity(defaultFilter.sensitivity)}`;
  return `
    <div class="geometry-viewer-shell">
      <div id="geometryViewer" class="geometry-viewer" aria-label="${t("geom.ariaLabel")}"></div>
      ${renderGeometryFilterControls()}
      <button class="geometry-reset" type="button" data-geometry-reset data-geometry-copy="geom.resetView">${t("geom.resetView")}</button>
    </div>
    <dl class="depth-meta geometry-meta">
      <div>
        <dt data-geometry-copy="geom.geometry">${t("geom.geometry")}</dt>
        <dd>${escapeHtml(state.geometryKind)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.view">${t("geom.view")}</dt>
        <dd data-geometry-view-mode="${escapeHtml(state.viewMode)}">${escapeHtml(formatProjectionViewMode(state.viewMode))}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.cameraModel">${t("geom.cameraModel")}</dt>
        <dd>${escapeHtml(state.cameraModel)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.points">${t("geom.points")}</dt>
        <dd>${state.pointCount}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.visiblePoints">${t("geom.visiblePoints")}</dt>
        <dd><span data-geometry-visible-points>${defaultFiltered.visiblePointCount}</span> / ${defaultFiltered.totalPointCount}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.filter">${t("geom.filter")}</dt>
        <dd data-geometry-active-filter>${initialFilterText}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.globalRisk">${t("geom.globalRisk")}</dt>
        <dd>${escapeHtml(state.quality.globalRisk)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.sample">${t("geom.sample")}</dt>
        <dd data-geometry-sample="${state.sampleStep}">${formatSampleStep(state.sampleStep)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.projectedDepth">${t("geom.projectedDepth")}</dt>
        <dd>${state.width} × ${state.height}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.sourceDepth">${t("geom.sourceDepth")}</dt>
        <dd>${state.inputDepthWidth} × ${state.inputDepthHeight}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.rgb">${t("geom.rgb")}</dt>
        <dd>${state.rgbWidth} × ${state.rgbHeight}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.focal">${t("geom.focal")}</dt>
        <dd>${formatNumber(state.fx)} × ${formatNumber(state.fy)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.principal">${t("geom.principal")}</dt>
        <dd>${formatNumber(state.cx)} × ${formatNumber(state.cy)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="depth.range">${t("depth.range")}</dt>
        <dd>${formatNumber(state.depthRange.min)} – ${formatNumber(state.depthRange.max)} ${escapeHtml(state.valueUnit)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="depth.rotation">${t("depth.rotation")}</dt>
        <dd>${escapeHtml(state.rotation)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.depthOrient">${t("geom.depthOrient")}</dt>
        <dd>${escapeHtml(state.orientation)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.photoOrient">${t("geom.photoOrient")}</dt>
        <dd>${escapeHtml(state.photoOrientation)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.scale">${t("geom.scale")}</dt>
        <dd data-geometry-copy="${state.relativeGeometry ? "geom.relative" : "geom.metric"}">${state.relativeGeometry ? t("geom.relative") : t("geom.metric")}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.clipped">${t("geom.clipped")}</dt>
        <dd>${formatRatio(state.quality.metrics.clippedLowRatio + state.quality.metrics.clippedHighRatio)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.outliers">${t("geom.outliers")}</dt>
        <dd>${formatRatio(state.quality.metrics.outlierRatio)}</dd>
      </div>
      <div>
        <dt data-geometry-copy="geom.discontinuities">${t("geom.discontinuities")}</dt>
        <dd>${formatRatio(state.quality.metrics.discontinuityRatio)}</dd>
      </div>
    </dl>
    ${renderProjectionWarnings(state)}
  `;
}

/** Refresh text without replacing the viewer, filter controls, or live counters. */
export function refreshPixelProjectionLabels(root: HTMLElement): void {
  root.querySelector<HTMLElement>("#geometryViewer")?.setAttribute("aria-label", t("geom.ariaLabel"));
  for (const element of root.querySelectorAll<HTMLElement>("[data-geometry-copy]")) {
    element.textContent = t(element.dataset.geometryCopy!);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-geometry-description]")) {
    const description = t(element.dataset.geometryDescription!);
    element.setAttribute("aria-label", description);
    element.dataset.tooltip = description;
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-geometry-view-mode]")) {
    element.textContent = formatProjectionViewMode(element.dataset.geometryViewMode!);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-geometry-sample]")) {
    element.textContent = formatSampleStep(Number(element.dataset.geometrySample));
  }
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
        <span>${escapeHtml(t("orig.unavailable", { fileName }))}</span>
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
      <button class="geometry-filter-collapse" data-geometry-filter-toggle type="button" aria-expanded="true" aria-label="${t("filter.collapse")}">${t("filter.title")}</button>
      <div class="geometry-filter-body" data-geometry-filter-body>
        <label class="geometry-sensitivity-control">
          <span data-geometry-copy="filter.sensitivity">${t("filter.sensitivity")}</span>
          <input data-geometry-filter-sensitivity type="range" min="0" max="2" step="1" value="1" />
          <b data-geometry-filter-sensitivity-label>${t("filter.medium")}</b>
        </label>
        <div class="geometry-filter-group geometry-risk-types">
          <div class="geometry-risk-title" data-geometry-copy="filter.riskMarkers">${t("filter.riskMarkers")}</div>
          ${renderRiskTypeControl(
            "clipped",
            "filter.clippedDepth",
            "filter.clippedDesc",
            true,
            false
          )}
          ${renderRiskTypeControl(
            "outliers",
            "filter.isolatedOutliers",
            "filter.outliersDesc",
            true,
            false
          )}
          ${renderRiskTypeControl(
            "edges",
            "filter.depthEdges",
            "filter.edgesDesc",
            true,
            false
          )}
          ${renderRiskTypeControl(
            "color",
            "filter.colorRisk",
            "filter.colorDesc",
            true,
            false,
            "filter.unstable"
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
        <span data-geometry-copy="${label}">${escapeHtml(t(label))}</span>
        ${badge ? `<span class="geometry-risk-badge" data-geometry-copy="${badge}">${escapeHtml(t(badge))}</span>` : ""}
        <span class="geometry-risk-swatch geometry-risk-swatch--${id}" aria-hidden="true"></span>
      </span>
      <button class="geometry-risk-toggle geometry-risk-toggle--show" data-geometry-risk-show="${id}" type="button" aria-pressed="${showChecked ? "true" : "false"}">
        ${showChecked ? t("filter.show") : t("filter.hide")}
      </button>
      <button class="geometry-risk-toggle geometry-risk-toggle--highlight" data-geometry-risk-highlight="${id}" type="button" aria-pressed="${highlightChecked ? "true" : "false"}"${highlightDisabled ? " disabled" : ""}>
        ${highlightChecked ? t("filter.highlight") : t("filter.unhighlight")}
      </button>
      <span class="geometry-info" tabindex="0" data-geometry-description="${description}" aria-label="${escapeHtml(t(description))}" data-tooltip="${escapeHtml(t(description))}">i</span>
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

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
}
