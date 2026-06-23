import "./styles.css";
import { decodeHeifAuxiliaryDepthPlane } from "./depth/heifDepthDecoder";
import type { DecodedDepthPlane, DepthPanelState, DisplayOrientationReference } from "./depth/types";
import { mountGeometryViewer, type GeometryViewerCleanup } from "./geometry/geometryViewer";
import { decodeRgbForPixelProjection, projectSignedDepthPixels } from "./geometry/pixelProjection";
import type { DecodedRgbImage, PixelProjectionState } from "./geometry/types";
import { visualizeOriginalHeicFallback } from "./original/originalVisualization";
import type { OriginalPreviewResult } from "./original/types";
import {
  drawDepthCanvas,
  drawOriginalCanvas,
  escapeHtml,
  formatBytes,
  renderDepthPanel,
  renderOriginalPreviewLoading,
  renderOriginalPreviewResult,
  renderPixelProjectionPanel,
  renderVerificationBusy,
  renderVerificationError,
  renderVerificationResult
} from "./ui/rendering";
import { verifyCaptureLocally, visualizeDepthPlane } from "./wasm/tapcamVerifier";
import { verifyCaptureSignature } from "./verifier/serverVerify";
import type {
  CaptureSignatureVerifyResponse,
  CombinedVerificationResult,
  LocalVerificationReport
} from "./verifier/types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root.");
}

app.innerHTML = `
  <section class="workspace">
    <div class="dropzone" id="dropzone">
      <input id="fileInput" class="file-input" type="file" accept=".heic,.heif,.jpg,.jpeg,image/heic,image/heif,image/jpeg" />
      <div class="dropzone-copy">
        <h1>TAPCam Verifier</h1>
        <p>Drop a signed HEIC or JPG here.</p>
      </div>
    </div>
    <section class="visualization" id="visualization" hidden></section>
    <section class="result" id="result" aria-live="polite"></section>
  </section>
`;

const dropzone = document.querySelector<HTMLDivElement>("#dropzone");
const fileInput = document.querySelector<HTMLInputElement>("#fileInput");
const visualizationPanel = document.querySelector<HTMLElement>("#visualization");
const resultPanel = document.querySelector<HTMLElement>("#result");

if (!dropzone || !fileInput || !visualizationPanel || !resultPanel) {
  throw new Error("Verifier UI did not mount.");
}

const resultEl = resultPanel;
const visualizationEl = visualizationPanel;
let activeRunId = 0;
let activeObjectUrl: string | null = null;
let activeFileBytes: Uint8Array | null = null;
let activeDepthPlane: DecodedDepthPlane | null = null;
let activeRgbImage: DecodedRgbImage | null = null;
let activeOriginalDisplayReference: DisplayOrientationReference | null = null;
let activeGeometryViewerCleanup: GeometryViewerCleanup | null = null;
let originalDisplayResolvedRunId = 0;
let originalFallbackNeededRunId = 0;
let originalFallbackStartedRunId = 0;
let depthStartedRunId = 0;
let depthResolvedRunId = 0;
let rgbStartedRunId = 0;
let rgbResolvedRunId = 0;
let pixelProjectionStartedRunId = 0;

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
});
dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragging");
});
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
  const file = event.dataTransfer?.files.item(0);
  if (file) {
    void verifyFile(file);
  }
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.item(0);
  if (file) {
    void verifyFile(file);
  }
});

async function verifyFile(file: File): Promise<void> {
  const runId = beginSelectedFile(file);

  try {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    if (runId === activeRunId) {
      activeFileBytes = fileBytes;
      requestOriginalFallback(runId, file.name);
      requestDepthVisualization(runId);
      requestRgbAnalysis(runId, file);
    }
    const result = await verifyFileBytes(file, fileBytes);
    if (runId === activeRunId) {
      resultEl.innerHTML = renderVerificationResult(result);
    }
  } catch (error) {
    if (runId === activeRunId) {
      resultEl.innerHTML = renderVerificationError(error);
      updateDepthPanel({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        warnings: [error instanceof Error ? error.message : String(error)]
      });
      updateGeometryPanel({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        warnings: [error instanceof Error ? error.message : String(error)]
      });
    }
  }
}

function beginSelectedFile(file: File): number {
  activeRunId += 1;
  activeFileBytes = null;
  activeDepthPlane = null;
  activeRgbImage = null;
  activeOriginalDisplayReference = null;
  originalDisplayResolvedRunId = 0;
  originalFallbackNeededRunId = 0;
  originalFallbackStartedRunId = 0;
  depthStartedRunId = 0;
  depthResolvedRunId = 0;
  rgbStartedRunId = 0;
  rgbResolvedRunId = 0;
  pixelProjectionStartedRunId = 0;
  cleanupGeometryViewer();
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
  }
  activeObjectUrl = URL.createObjectURL(file);

  renderVisualizationScaffold(file, activeObjectUrl);
  updateDepthPanel({ status: "loading" });
  updateGeometryPanel({ status: "loading" });
  resultEl.innerHTML = renderVerificationBusy(file.name, file.size);
  return activeRunId;
}

function resolveOriginalDisplay(runId: number, reference: DisplayOrientationReference | null): void {
  if (runId !== activeRunId) {
    return;
  }

  activeOriginalDisplayReference = reference;
  originalDisplayResolvedRunId = runId;
  requestDepthVisualization(runId);
}

function requestDepthVisualization(runId: number): void {
  if (
    runId !== activeRunId ||
    depthStartedRunId === runId ||
    !activeFileBytes ||
    originalDisplayResolvedRunId !== runId
  ) {
    return;
  }

  depthStartedRunId = runId;
  void visualizeSelectedDepth(runId, activeFileBytes, activeOriginalDisplayReference ?? undefined);
}

function requestRgbAnalysis(runId: number, file: File): void {
  if (
    runId !== activeRunId ||
    rgbStartedRunId === runId ||
    !activeFileBytes
  ) {
    return;
  }

  rgbStartedRunId = runId;
  void decodeSelectedRgb(runId, file, activeFileBytes);
}

function requestPixelProjection(runId: number): void {
  if (
    runId !== activeRunId ||
    pixelProjectionStartedRunId === runId ||
    depthResolvedRunId !== runId ||
    rgbResolvedRunId !== runId ||
    !activeFileBytes ||
    !activeDepthPlane ||
    !activeRgbImage
  ) {
    return;
  }

  pixelProjectionStartedRunId = runId;
  void projectSelectedPixels(
    runId,
    activeFileBytes,
    activeRgbImage,
    activeDepthPlane,
    activeOriginalDisplayReference ?? undefined
  );
}

async function decodeSelectedRgb(runId: number, file: File, fileBytes: Uint8Array): Promise<void> {
  try {
    const rgbImage = await decodeRgbForPixelProjection(file, fileBytes);
    if (runId !== activeRunId) {
      return;
    }
    if (!rgbImage) {
      updateGeometryPanel({
        status: "unavailable",
        message: "Decoded RGB pixels are not available for 3D projection.",
        warnings: ["Decoded RGB pixels are not available for 3D projection."]
      });
      return;
    }

    activeRgbImage = rgbImage;
    rgbResolvedRunId = runId;
    requestPixelProjection(runId);
  } catch (error) {
    if (runId === activeRunId) {
      const message = error instanceof Error ? error.message : String(error);
      updateGeometryPanel({
        status: "error",
        message,
        warnings: [message]
      });
    }
  }
}

async function visualizeSelectedOriginalFallback(
  runId: number,
  fileName: string,
  fileBytes: Uint8Array
): Promise<void> {
  const previewState = await visualizeOriginalHeicFallback(fileBytes);
  if (runId === activeRunId) {
    updateOriginalPreview(previewState, fileName);
  }
}

async function visualizeSelectedDepth(
  runId: number,
  fileBytes: Uint8Array,
  displayReference?: DisplayOrientationReference
): Promise<void> {
  try {
    const depthPlane = await decodeHeifAuxiliaryDepthPlane(fileBytes);
    if (runId !== activeRunId) {
      return;
    }
    if (!depthPlane) {
      const state: DepthPanelState = {
        status: "unavailable",
        message: "No embedded HEIF auxiliary depth or disparity plane was found.",
        warnings: ["No embedded HEIF auxiliary depth or disparity plane was found."]
      };
      updateDepthPanel(state);
      updateGeometryPanel({
        status: "unavailable",
        message: "No embedded depth or disparity pixels are available for 3D projection.",
        warnings: ["No embedded depth or disparity pixels are available for 3D projection."]
      });
      return;
    }

    activeDepthPlane = depthPlane;
    depthResolvedRunId = runId;
    const depthState = await visualizeDepthPlane(fileBytes, depthPlane, displayReference);
    if (runId === activeRunId) {
      updateDepthPanel(depthState);
      requestPixelProjection(runId);
    }
  } catch (error) {
    if (runId === activeRunId) {
      const message = error instanceof Error ? error.message : String(error);
      updateDepthPanel({
        status: "error",
        message,
        warnings: [message]
      });
      updateGeometryPanel({
        status: "error",
        message,
        warnings: [message]
      });
    }
  }
}

async function projectSelectedPixels(
  runId: number,
  fileBytes: Uint8Array,
  rgbImage: DecodedRgbImage,
  depthPlane: DecodedDepthPlane,
  displayReference?: DisplayOrientationReference
): Promise<void> {
  const projectionState = await projectSignedDepthPixels(fileBytes, rgbImage, depthPlane, displayReference);
  if (runId === activeRunId) {
    updateGeometryPanel(projectionState);
  }
}

function renderVisualizationScaffold(file: File, objectUrl: string): void {
  visualizationEl.hidden = false;
  visualizationEl.innerHTML = `
    <div class="visual-grid">
      <article class="visual-pane">
        <header>
          <h2>Original</h2>
          <span>${escapeHtml(file.name)} · ${formatBytes(file.size)}</span>
        </header>
        <div class="media-frame" id="originalFrame">
          <img id="originalPreview" src="${objectUrl}" alt="${escapeHtml(file.name)}" />
        </div>
      </article>
      <article class="visual-pane">
        <header>
          <h2>Depth</h2>
          <span>Embedded depth/disparity</span>
        </header>
        <div class="depth-panel" id="depthPanel"></div>
      </article>
      <article class="visual-pane visual-pane--geometry">
        <header>
          <h2>3D Pixel Projection</h2>
          <span>Relative geometry</span>
        </header>
        <div class="geometry-panel" id="geometryPanel"></div>
      </article>
    </div>
  `;
  attachOriginalPreviewFallback(file, activeRunId);
}

function attachOriginalPreviewFallback(file: File, runId: number): void {
  const image = document.querySelector<HTMLImageElement>("#originalPreview");
  const frame = document.querySelector<HTMLElement>("#originalFrame");
  if (!image || !frame) {
    return;
  }

  image.addEventListener("error", () => {
    if (runId !== activeRunId) {
      return;
    }

    originalFallbackNeededRunId = runId;
    frame.innerHTML = renderOriginalPreviewLoading(file.name);
    requestOriginalFallback(runId, file.name);
  });

  image.addEventListener("load", () => {
    if (runId !== activeRunId) {
      return;
    }

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    resolveOriginalDisplay(runId, width > 0 && height > 0 ? { width, height } : null);
  });

  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    resolveOriginalDisplay(runId, {
      width: image.naturalWidth,
      height: image.naturalHeight
    });
  }
}

function requestOriginalFallback(runId: number, fileName: string): void {
  if (
    runId !== activeRunId ||
    originalFallbackNeededRunId !== runId ||
    originalFallbackStartedRunId === runId ||
    !activeFileBytes
  ) {
    return;
  }

  originalFallbackStartedRunId = runId;
  void visualizeSelectedOriginalFallback(runId, fileName, activeFileBytes);
}

function updateOriginalPreview(state: OriginalPreviewResult, fileName: string): void {
  const frame = document.querySelector<HTMLElement>("#originalFrame");
  if (!frame) {
    return;
  }

  frame.innerHTML = renderOriginalPreviewResult(state, fileName);
  if (state.status === "available") {
    const canvas = document.querySelector<HTMLCanvasElement>("#originalFallbackCanvas");
    if (canvas) {
      drawOriginalCanvas(state, canvas);
    }
    resolveOriginalDisplay(activeRunId, {
      width: state.orientedWidth,
      height: state.orientedHeight
    });
  } else {
    resolveOriginalDisplay(activeRunId, null);
  }
}

function updateDepthPanel(state: DepthPanelState): void {
  const depthPanel = document.querySelector<HTMLElement>("#depthPanel");
  if (!depthPanel) {
    return;
  }

  depthPanel.innerHTML = renderDepthPanel(state);
  if (state.status === "available") {
    const canvas = document.querySelector<HTMLCanvasElement>("#depthCanvas");
    if (canvas) {
      drawDepthCanvas(state, canvas);
    }
  }
}

function updateGeometryPanel(state: PixelProjectionState): void {
  const geometryPanel = document.querySelector<HTMLElement>("#geometryPanel");
  if (!geometryPanel) {
    return;
  }

  cleanupGeometryViewer();
  geometryPanel.innerHTML = renderPixelProjectionPanel(state);
  if (state.status === "available") {
    const host = document.querySelector<HTMLElement>("#geometryViewer");
    if (host) {
      activeGeometryViewerCleanup = mountGeometryViewer(host, state);
    }
  }
}

function cleanupGeometryViewer(): void {
  activeGeometryViewerCleanup?.();
  activeGeometryViewerCleanup = null;
}

async function verifyFileBytes(file: File, fileBytes: Uint8Array): Promise<CombinedVerificationResult> {
  const local = await verifyCaptureLocally(fileBytes);
  const localFailure = hasLocalFailure(local);

  if (localFailure || !local.serverRequest) {
    return {
      fileName: file.name,
      fileSize: file.size,
      local,
      server: null,
      serverError: localFailure ? "not run: local verification failed" : "not run: missing server request",
      finalStatus: "invalid"
    };
  }

  let server: CaptureSignatureVerifyResponse | null = null;
  let serverError: string | null = null;

  try {
    server = await verifyCaptureSignature(local.serverRequest);
  } catch (error) {
    serverError = formatServerVerifyError(error);
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    local,
    server,
    serverError,
    finalStatus: finalStatus(local, server)
  };
}

function finalStatus(
  local: LocalVerificationReport,
  server: CaptureSignatureVerifyResponse | null
): CombinedVerificationResult["finalStatus"] {
  if (hasLocalFailure(local)) {
    return "invalid";
  }

  return server?.status === "valid" ? "valid" : "invalid";
}

function hasLocalFailure(local: LocalVerificationReport): boolean {
  return local.status !== "valid" || local.checks.some((check) => check.status === "fail");
}

function formatServerVerifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof TypeError && message === "Failed to fetch") {
    return "Failed to fetch. Browser blocked the server verify request; check HTTPS, CORS preflight, and network reachability.";
  }

  return message;
}
