import "./styles.css";
import { t, onLangChange, toggleLang, getLang } from "./i18n/i18n";
import { decodeEmbeddedDepthPlane } from "./depth/heifDepthDecoder";
import type { DecodedDepthPlane, DepthPanelState, DisplayOrientationReference } from "./depth/types";
import { mountGeometryViewer, type GeometryViewerCleanup } from "./geometry/geometryViewer";
import { decodeRgbForPixelProjection, projectSignedDepthPixels } from "./geometry/pixelProjection";
import type { DecodedRgbImage, PixelProjectionState } from "./geometry/types";
import { resolveCaptureInput, type CaptureInput } from "./input/captureInput";
import { visualizeOriginalHeicFallback } from "./original/originalVisualization";
import type { OriginalPreviewResult } from "./original/types";
import {
  classifyResult,
  drawDepthCanvas,
  drawOriginalCanvas,
  escapeHtml,
  formatBytes,
  renderDepthPanel,
  renderOriginalPreviewLoading,
  renderOriginalPreviewResult,
  renderPixelProjectionPanel,
  renderResultModal,
  renderVerificationBusy,
  renderVerificationError,
  renderVerificationResult,
  type ResultModalType
} from "./ui/rendering";
import { verifyCapturePackageLocally, visualizeDepthPlane } from "./wasm/tapcamVerifier";
import { verifyCaptureSignature } from "./verifier/serverVerify";
import { buildServerBoundaryDiagnostic } from "./verifier/serverBoundaryDiagnostic";
import type {
  CaptureSignatureVerifyResponse,
  CombinedVerificationResult,
  LocalVerificationReport
} from "./verifier/types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root.");
}

document.documentElement.lang = getLang();

app.innerHTML = `
  <nav class="navbar" role="navigation" aria-label="Main navigation">
    <div class="navbar-inner">
      <a class="navbar-brand" href="/" data-nav-brand>
        <img src="./launch_logo.png" alt="" width="28" height="28" />
        <span class="navbar-brand-text" data-nav-brand-text>${t("nav.brand")}</span>
      </a>
      <div class="navbar-links">
        <button class="navbar-link" type="button" data-nav-doc>${t("nav.doc")}</button>
        <button class="navbar-link" type="button" data-nav-blog>${t("nav.blog")}</button>
        <a class="navbar-link navbar-link--active" href="/" data-nav-tool>${t("nav.tool")}</a>
        <a class="navbar-link navbar-link--download" href="https://testflight.apple.com/join/bwcgjzNd" target="_blank" rel="noopener noreferrer" data-nav-download aria-label="${t("nav.downloadAria")}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span data-nav-download-text>${t("nav.download")}</span>
        </a>
        <a class="navbar-link navbar-link--github" href="https://github.com/TAP-NAP" target="_blank" rel="noopener noreferrer" data-nav-github aria-label="${t("nav.github")}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
        </a>
        <button class="navbar-link navbar-lang" type="button" data-nav-lang aria-label="Switch language">${t("nav.langSwitchToEn")}</button>
      </div>
    </div>
  </nav>
  <section class="workspace">
    <section class="onboarding" data-onboarding>
      <h2 class="onboarding-title" data-onboarding-title>${t("onboarding.title")}</h2>
      <p class="onboarding-desc" data-onboarding-desc>${t("onboarding.description")}</p>
      <div class="onboarding-grid">
        <div class="onboarding-card">
          <div class="onboarding-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h3 data-onboarding-signature-title>${t("onboarding.signatureTitle")}</h3>
          <p data-onboarding-signature>${t("onboarding.signature")}</p>
        </div>
        <div class="onboarding-card">
          <div class="onboarding-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          </div>
          <h3 data-onboarding-depth-title>${t("onboarding.depthTitle")}</h3>
          <p data-onboarding-depth>${t("onboarding.depth")}</p>
        </div>
        <div class="onboarding-card">
          <div class="onboarding-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h3 data-onboarding-privacy-title>${t("onboarding.privacyTitle")}</h3>
          <p data-onboarding-privacy>${t("onboarding.privacy")}</p>
        </div>
      </div>
    </section>
    <div class="dropzone" id="dropzone">
      <input id="fileInput" class="file-input" type="file" accept=".heic,.heif,.jpg,.jpeg,.zip,image/heic,image/heif,image/jpeg,application/zip" />
      <div class="dropzone-copy">
        <p>${t("dropzone.subtitle")}</p>
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
const navDocBtn = document.querySelector<HTMLButtonElement>("[data-nav-doc]");
const navBlogBtn = document.querySelector<HTMLButtonElement>("[data-nav-blog]");
const navToolLink = document.querySelector<HTMLAnchorElement>("[data-nav-tool]");
const navLangBtn = document.querySelector<HTMLButtonElement>("[data-nav-lang]");
const navBrandText = document.querySelector<HTMLSpanElement>("[data-nav-brand-text]");
const navGithubLink = document.querySelector<HTMLAnchorElement>("[data-nav-github]");
const navDownloadLink = document.querySelector<HTMLAnchorElement>("[data-nav-download]");
const navDownloadText = document.querySelector<HTMLSpanElement>("[data-nav-download-text]");
const onboardingEl = document.querySelector<HTMLElement>("[data-onboarding]");

if (!dropzone || !fileInput || !visualizationPanel || !resultPanel || !navDocBtn || !navBlogBtn || !navToolLink || !navLangBtn || !navBrandText || !navGithubLink || !navDownloadLink || !navDownloadText || !onboardingEl) {
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

let currentFile: File | null = null;
let currentResult: CombinedVerificationResult | null = null;
let isVerifying = false;
let verifyingFileName = "";
let verifyingFileSize = 0;
let currentDepthState: DepthPanelState | null = null;
let currentGeometryState: PixelProjectionState | null = null;

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) {
    return;
  }
  event.preventDefault();
  setDropEffect(event);
  dropzone.classList.add("is-dragging");
});
dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragging");
});
dropzone.addEventListener("drop", (event) => {
  event.stopPropagation();
  dropzone.classList.remove("is-dragging");
  handleDroppedFile(event);
});
document.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  setDropEffect(event);
});
document.addEventListener("drop", (event) => {
  if (!isFileDrag(event)) {
    return;
  }

  dropzone.classList.remove("is-dragging");
  handleDroppedFile(event);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.item(0);
  if (file) {
    void verifyFile(file);
  }
});

function showToast(message: string): void {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button class="toast-close" type="button" aria-label="${t('toast.close')}">×</button>
  `;
  document.body.appendChild(toast);

  let timerId: number;
  const close = () => {
    toast.remove();
    window.clearTimeout(timerId);
  };
  toast.querySelector('.toast-close')?.addEventListener('click', close);
  timerId = window.setTimeout(close, 3000);
}

navDocBtn!.addEventListener("click", () => {
  showToast(t("toast.comingSoon"));
});

navBlogBtn!.addEventListener("click", () => {
  showToast(t("toast.comingSoon"));
});

function resetToHome(event?: Event): void {
  event?.preventDefault();
  cleanupGeometryViewer();
  document.querySelector("[data-result-modal]")?.remove();
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
  }
  activeObjectUrl = null;
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
  currentFile = null;
  currentResult = null;
  isVerifying = false;
  verifyingFileName = "";
  verifyingFileSize = 0;
  currentDepthState = null;
  currentGeometryState = null;
  visualizationEl.hidden = true;
  visualizationEl.innerHTML = "";
  resultEl.innerHTML = "";
  onboardingEl!.hidden = false;
}

navToolLink!.addEventListener("click", resetToHome);
document.querySelector<HTMLAnchorElement>("[data-nav-brand]")!.addEventListener("click", resetToHome);

navLangBtn!.addEventListener("click", () => {
  toggleLang();
});

function isFileDrag(event: DragEvent): boolean {
  const dataTransfer = event.dataTransfer;
  return Boolean(
    dataTransfer &&
      (Array.from(dataTransfer.types).includes("Files") || dataTransfer.files.length > 0)
  );
}

function setDropEffect(event: DragEvent): void {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

function handleDroppedFile(event: DragEvent): void {
  event.preventDefault();
  setDropEffect(event);
  const file = event.dataTransfer?.files.item(0);
  if (file) {
    void verifyFile(file);
  }
}

async function verifyFile(file: File): Promise<void> {
  const runId = beginSelectedFile(file);
  let captureInput: CaptureInput;

  try {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    captureInput = resolveCaptureInput(file, fileBytes);
  } catch (error) {
    if (runId === activeRunId) {
      isVerifying = false;
      const message = error instanceof Error ? error.message : String(error);
      await showResultModal("parseError", {
        title: t("modal.parseErrorTitle"),
        desc: t("modal.parseErrorDesc"),
        detail: message,
        buttonText: t("modal.retry")
      });
      if (runId !== activeRunId) {
        return;
      }
      resultEl.innerHTML = renderVerificationError(error);
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
    return;
  }

  startAnalysis(runId, captureInput);

  try {
    const result = await verifyFileBytes(captureInput);
    if (runId !== activeRunId) {
      return;
    }

    currentResult = result;
    isVerifying = false;

    const modalType = classifyResult(result);
    const modalConfig = buildModalConfig(modalType, result);
    await showResultModal(modalType, modalConfig);
    if (runId !== activeRunId) {
      return;
    }

    resultEl.innerHTML = renderVerificationResult(result);
    revealVisualization(runId);
  } catch (error) {
    if (runId === activeRunId) {
      isVerifying = false;
      const message = error instanceof Error ? error.message : String(error);
      await showResultModal("parseError", {
        title: t("modal.parseErrorTitle"),
        desc: t("modal.parseErrorDesc"),
        detail: message,
        buttonText: t("modal.retry")
      });
      if (runId !== activeRunId) {
        return;
      }
      resultEl.innerHTML = renderVerificationError(error);
      revealVisualization(runId);
    }
  }
}

function buildModalConfig(type: ResultModalType, result: CombinedVerificationResult): { title: string; desc: string; detail?: string; buttonText: string } {
  switch (type) {
    case "success":
      return {
        title: t("modal.validTitle"),
        desc: t("modal.validDesc"),
        detail: t("modal.validNote", { fileName: result.fileName, fileSize: formatBytes(result.fileSize) }),
        buttonText: t("modal.viewDetails")
      };
    case "invalid": {
      const failCheck = result.local.checks.find((c) => c.status === "fail");
      const reason = result.server?.status === "invalid" && result.server.reason
        ? result.server.reason
        : failCheck?.detail ?? result.local.summary;
      return {
        title: t("modal.invalidTitle"),
        desc: t("modal.invalidDesc"),
        detail: reason,
        buttonText: t("modal.retry")
      };
    }
    case "noSignature":
      return {
        title: t("modal.noSignatureTitle"),
        desc: t("modal.noSignatureDesc"),
        detail: t("modal.noSignatureHint"),
        buttonText: t("modal.retry")
      };
    case "networkError":
      return {
        title: t("modal.networkErrorTitle"),
        desc: t("modal.networkErrorDesc"),
        detail: result.serverError ?? t("modal.networkErrorHint"),
        buttonText: t("modal.retry")
      };
    case "parseError":
      return {
        title: t("modal.parseErrorTitle"),
        desc: t("modal.parseErrorDesc"),
        buttonText: t("modal.retry")
      };
  }
}

function showResultModal(type: ResultModalType, config: { title: string; desc: string; detail?: string; buttonText: string }): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.querySelector("[data-result-modal]");
    if (existing) existing.remove();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderResultModal(type, config);
    const modalEl = wrapper.firstElementChild as HTMLElement;
    document.body.appendChild(modalEl);

    const closeBtn = modalEl.querySelector<HTMLButtonElement>("[data-result-modal-close]");

    function dismiss(): void {
      modalEl.remove();
      document.removeEventListener("keydown", handleKey);
      resolve();
    }

    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        dismiss();
      }
    }

    closeBtn?.addEventListener("click", dismiss);
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) dismiss();
    });
    document.addEventListener("keydown", handleKey);

    closeBtn?.focus();
  });
}

function beginSelectedFile(file: File): number {
  activeRunId += 1;
  document.querySelector("[data-result-modal]")?.remove();
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
  activeObjectUrl = null;

  currentFile = file;
  currentResult = null;
  isVerifying = true;
  verifyingFileName = file.name;
  verifyingFileSize = file.size;
  currentDepthState = null;
  currentGeometryState = null;

  visualizationEl.hidden = true;
  visualizationEl.innerHTML = "";
  onboardingEl!.hidden = true;
  updateDepthPanel({ status: "loading" });
  updateGeometryPanel({ status: "loading" });
  resultEl.innerHTML = renderVerificationBusy(file.name, file.size);
  return activeRunId;
}

function startAnalysis(runId: number, captureInput: CaptureInput): void {
  if (runId !== activeRunId) {
    return;
  }

  activeFileBytes = captureInput.photoBytes;
  activeObjectUrl = URL.createObjectURL(captureInput.photoFile);
  renderVisualizationScaffold(captureInput.photoFile, activeObjectUrl);
  requestOriginalFallback(runId, captureInput.photoFile.name);
  requestDepthVisualization(runId);
  requestRgbAnalysis(runId, captureInput.photoFile);
}

function revealVisualization(runId: number): void {
  if (runId === activeRunId && visualizationEl.innerHTML !== "") {
    visualizationEl.hidden = false;
  }
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
    const depthPlane = await decodeEmbeddedDepthPlane(fileBytes);
    if (runId !== activeRunId) {
      return;
    }
    if (!depthPlane) {
      const state: DepthPanelState = {
        status: "unavailable",
        message: "No embedded auxiliary depth or disparity plane was found.",
        warnings: ["No embedded auxiliary depth or disparity plane was found."]
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
  visualizationEl.hidden = true;
  visualizationEl.innerHTML = `
    <div class="visual-grid">
      <article class="visual-pane" data-pane-original>
        <header>
          <h2>${t("panel.original")}</h2>
          <span>${escapeHtml(file.name)} · ${formatBytes(file.size)}</span>
        </header>
        <div class="media-frame" id="originalFrame">
          <img id="originalPreview" src="${objectUrl}" alt="${escapeHtml(file.name)}" />
        </div>
      </article>
      <article class="visual-pane" data-pane-depth>
        <header>
          <h2>${t("panel.depth")}</h2>
          <span>${t("panel.depthSubtitle")}</span>
        </header>
        <div class="depth-panel" id="depthPanel"></div>
      </article>
      <article class="visual-pane visual-pane--geometry" data-pane-geometry>
        <header>
          <h2>${t("panel.geometry")}</h2>
          <span>${t("panel.geometrySubtitle")}</span>
        </header>
        <div class="geometry-panel" id="geometryPanel"></div>
      </article>
    </div>
  `;
  attachOriginalPreviewFallback(file, activeRunId);
}

function updatePaneHeaders(): void {
  const originalPane = visualizationEl.querySelector<HTMLElement>("[data-pane-original] h2");
  const depthPane = visualizationEl.querySelector<HTMLElement>("[data-pane-depth] h2");
  const depthPaneSubtitle = visualizationEl.querySelector<HTMLElement>("[data-pane-depth] header span");
  const geometryPane = visualizationEl.querySelector<HTMLElement>("[data-pane-geometry] h2");
  const geometryPaneSubtitle = visualizationEl.querySelector<HTMLElement>("[data-pane-geometry] header span");

  if (originalPane) originalPane.textContent = t("panel.original");
  if (depthPane) depthPane.textContent = t("panel.depth");
  if (depthPaneSubtitle) depthPaneSubtitle.textContent = t("panel.depthSubtitle");
  if (geometryPane) geometryPane.textContent = t("panel.geometry");
  if (geometryPaneSubtitle) geometryPaneSubtitle.textContent = t("panel.geometrySubtitle");
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
  currentDepthState = state;
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
  currentGeometryState = state;
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

async function verifyFileBytes(captureInput: CaptureInput): Promise<CombinedVerificationResult> {
  const local = await verifyCapturePackageLocally(
    captureInput.photoBytes,
    captureInput.pairedVideoBytes
  );
  const localFailure = hasLocalFailure(local);

  if (localFailure || !local.serverRequest) {
    const serverErrorMsg = localFailure ? t("error.serverNotRun") : t("error.serverMissingRequest");
    return {
      fileName: captureInput.fileName,
      fileSize: captureInput.fileSize,
      local,
      server: null,
      serverError: serverErrorMsg,
      serverBoundary: buildServerBoundaryDiagnostic(
        local,
        null,
        localFailure ? "local verification failed" : "missing server request"
      ),
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
    fileName: captureInput.fileName,
    fileSize: captureInput.fileSize,
    local,
    server,
    serverError,
    serverBoundary: buildServerBoundaryDiagnostic(local, server, serverError),
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
    return t("error.fetchFailed");
  }

  return message;
}

function refreshUI(): void {
  document.documentElement.lang = getLang();
  navBrandText!.textContent = t("nav.brand");
  navDocBtn!.textContent = t("nav.doc");
  navBlogBtn!.textContent = t("nav.blog");
  navToolLink!.textContent = t("nav.tool");
  navLangBtn!.textContent = t("nav.langSwitchToEn");
  navGithubLink!.setAttribute("aria-label", t("nav.github"));
  navDownloadText!.textContent = t("nav.download");
  navDownloadLink!.setAttribute("aria-label", t("nav.downloadAria"));

  const onboardingTitle = document.querySelector<HTMLElement>("[data-onboarding-title]");
  const onboardingDesc = document.querySelector<HTMLElement>("[data-onboarding-desc]");
  const onboardingSignatureTitle = document.querySelector<HTMLElement>("[data-onboarding-signature-title]");
  const onboardingSignature = document.querySelector<HTMLElement>("[data-onboarding-signature]");
  const onboardingDepthTitle = document.querySelector<HTMLElement>("[data-onboarding-depth-title]");
  const onboardingDepth = document.querySelector<HTMLElement>("[data-onboarding-depth]");
  const onboardingPrivacyTitle = document.querySelector<HTMLElement>("[data-onboarding-privacy-title]");
  const onboardingPrivacy = document.querySelector<HTMLElement>("[data-onboarding-privacy]");

  if (onboardingTitle) onboardingTitle.textContent = t("onboarding.title");
  if (onboardingDesc) onboardingDesc.textContent = t("onboarding.description");
  if (onboardingSignatureTitle) onboardingSignatureTitle.textContent = t("onboarding.signatureTitle");
  if (onboardingSignature) onboardingSignature.textContent = t("onboarding.signature");
  if (onboardingDepthTitle) onboardingDepthTitle.textContent = t("onboarding.depthTitle");
  if (onboardingDepth) onboardingDepth.textContent = t("onboarding.depth");
  if (onboardingPrivacyTitle) onboardingPrivacyTitle.textContent = t("onboarding.privacyTitle");
  if (onboardingPrivacy) onboardingPrivacy.textContent = t("onboarding.privacy");

  const dropzoneP = dropzone!.querySelector<HTMLParagraphElement>("p");
  if (dropzoneP) dropzoneP.textContent = t("dropzone.subtitle");

  if (visualizationEl.innerHTML !== "") {
    updatePaneHeaders();
  }

  if (isVerifying) {
    resultEl.innerHTML = renderVerificationBusy(verifyingFileName, verifyingFileSize);
  } else if (currentResult) {
    resultEl.innerHTML = renderVerificationResult(currentResult);
  }

  if (currentDepthState) {
    updateDepthPanel(currentDepthState);
  }
  if (currentGeometryState) {
    updateGeometryPanel(currentGeometryState);
  }
}

onLangChange(() => {
  refreshUI();
});
