import "./styles.css";
import "./topbar.css";
import { t, onLangChange, toggleLang, getLang } from "./i18n/i18n";
import { decodeEmbeddedDepthPlane } from "./depth/heifDepthDecoder";
import type { DecodedDepthPlane, DepthPanelState, DisplayOrientationReference } from "./depth/types";
import { mountEmptyParticleField } from "./emptyParticleField";
import { mountGeometryViewer, type GeometryViewerCleanup } from "./geometry/geometryViewer";
import { decodeRgbForPixelProjection, projectSignedDepthPixels } from "./geometry/pixelProjection";
import type { DecodedRgbImage, PixelProjectionState } from "./geometry/types";
import {
  resolveCaptureInput,
  TAPNAP_CAPTURE_PACKAGE_MIME_TYPE,
  type CaptureInput,
  type PhotoCaptureInput
} from "./input/captureInput";
import { visualizeOriginalHeicFallback } from "./original/originalVisualization";
import type { OriginalPreviewResult } from "./original/types";
import {
  drawDepthCanvas,
  drawOriginalCanvas,
  classifyResult,
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
import { getTapCamTopbarLabels, renderTapCamTopbar } from "./ui/topbar";
import { verifyCapturePackageLocally, visualizeDepthPlane } from "./wasm/tapcamVerifier";
import { verifyCaptureSignature } from "./verifier/serverVerify";
import { buildServerBoundaryDiagnostic } from "./verifier/serverBoundaryDiagnostic";
import { verifyTapVideoLocally } from "./video/tapVideo";
import { mountTapVideoDepthPlayback, type TapVideoPlaybackCleanup } from "./video/videoPlayback";
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
  ${renderTapCamTopbar({
    assetBase: "../",
    homeHref: "../",
    verifyHref: "./",
    locale: getLang(),
    navAriaLabel: getLang() === "zh" ? "TAPCam 主导航" : "TAPCam navigation",
    verifyActive: true
  })}
  <div class="verifier-particles" id="dropzoneParticles" aria-hidden="true"></div>
  <section class="workspace">
    <section class="verification-overview" aria-label="${t("progress.ariaLabel")}">
      <div class="file-summary" data-file-summary hidden>
        <div class="file-summary__identity">
          <div>
            <strong data-file-name></strong>
            <span data-file-meta></span>
          </div>
        </div>
        <button class="file-summary__select" type="button" data-file-select>${t("dropzone.replacePhoto")}</button>
      </div>
      <ol class="verification-progress" data-verification-progress style="--verification-progress-scale: 0">
        <li data-progress-step="0">
          <span class="verification-progress__node" aria-hidden="true"></span>
          <strong>${t("progress.file")}</strong>
          <span data-progress-detail>${t("progress.fileWaiting")}</span>
        </li>
        <li data-progress-step="1">
          <span class="verification-progress__node" aria-hidden="true"></span>
          <strong>${t("progress.local")}</strong>
          <span data-progress-detail>${t("progress.waiting")}</span>
        </li>
        <li data-progress-step="2">
          <span class="verification-progress__node" aria-hidden="true"></span>
          <strong>${t("progress.signature")}</strong>
          <span data-progress-detail>${t("progress.waiting")}</span>
        </li>
        <li data-progress-step="3">
          <span class="verification-progress__node" aria-hidden="true"></span>
          <strong>${t("progress.server")}</strong>
          <span data-progress-detail>${t("progress.waiting")}</span>
        </li>
        <li data-progress-step="4">
          <span class="verification-progress__node" aria-hidden="true"></span>
          <strong>${t("progress.result")}</strong>
          <span data-progress-detail>${t("progress.waiting")}</span>
        </li>
      </ol>
    </section>
    <section class="onboarding" data-onboarding>
      <div class="dropzone" id="dropzone">
        <input id="fileInput" class="file-input" type="file" accept=".heic,.heif,.jpg,.jpeg,.mp4,.tapnap,.zip,image/heic,image/heif,image/jpeg,video/mp4,${TAPNAP_CAPTURE_PACKAGE_MIME_TYPE},application/zip" />
        <div class="dropzone-copy">
          <strong class="dropzone-action" data-dropzone-select>${t("dropzone.select")}</strong>
          <p data-dropzone-instruction>${t("dropzone.instruction")}</p>
          <span class="dropzone-formats" data-dropzone-formats>${t("dropzone.formats")}</span>
          <span class="dropzone-privacy" data-dropzone-privacy>${t("dropzone.privacy")}</span>
        </div>
      </div>
    </section>
    <section class="visualization" id="visualization" hidden></section>
    <section class="result" id="result" aria-live="polite"></section>
  </section>
`;

const dropzone = document.querySelector<HTMLDivElement>("#dropzone");
const fileInput = document.querySelector<HTMLInputElement>("#fileInput");
const visualizationPanel = document.querySelector<HTMLElement>("#visualization");
const resultPanel = document.querySelector<HTMLElement>("#result");
const navDocLink = document.querySelector<HTMLAnchorElement>("[data-nav-doc]");
const navToolLink = document.querySelector<HTMLAnchorElement>("[data-nav-tool]");
const navDownloadLink = document.querySelector<HTMLAnchorElement>("[data-nav-download]");
const navLangBtn = document.querySelector<HTMLButtonElement>("[data-nav-lang]");
const navBrandText = document.querySelector<HTMLSpanElement>("[data-nav-brand-text]");
const navGithubLink = document.querySelector<HTMLAnchorElement>("[data-nav-github]");
const onboardingEl = document.querySelector<HTMLElement>("[data-onboarding]");
const fileSummaryEl = document.querySelector<HTMLElement>("[data-file-summary]");
const fileNameEl = document.querySelector<HTMLElement>("[data-file-name]");
const fileMetaEl = document.querySelector<HTMLElement>("[data-file-meta]");
const fileSelectButton = document.querySelector<HTMLButtonElement>("[data-file-select]");
const progressEl = document.querySelector<HTMLOListElement>("[data-verification-progress]");
const dropzoneParticles = document.querySelector<HTMLElement>("#dropzoneParticles");

if (!dropzone || !fileInput || !visualizationPanel || !resultPanel || !navDocLink || !navToolLink || !navDownloadLink || !navLangBtn || !navBrandText || !navGithubLink || !onboardingEl || !fileSummaryEl || !fileNameEl || !fileMetaEl || !fileSelectButton || !progressEl || !dropzoneParticles) {
  throw new Error("Verifier UI did not mount.");
}

const resultEl = resultPanel;
const visualizationEl = visualizationPanel;
const workspaceEl = app.querySelector<HTMLElement>(".workspace");
let activeRunId = 0;
let activeObjectUrl: string | null = null;
let activeFileBytes: Uint8Array | null = null;
let activeDepthPlane: DecodedDepthPlane | null = null;
let activeRgbImage: DecodedRgbImage | null = null;
let activeOriginalDisplayReference: DisplayOrientationReference | null = null;
let activeGeometryViewerCleanup: GeometryViewerCleanup | null = null;
let activeVideoPlaybackCleanup: TapVideoPlaybackCleanup | null = null;
let activeInputKind: CaptureInput["kind"] | null = null;
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
type VerificationProgressStatus = "idle" | "running" | "valid" | "invalid";
let currentProgressPhase = 0;
let currentProgressStatus: VerificationProgressStatus = "idle";

if (!workspaceEl) {
  throw new Error("Verifier workspace did not mount.");
}

const emptyParticleField = mountEmptyParticleField(dropzoneParticles);

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
fileSelectButton.addEventListener("click", () => fileInput.click());
fileSummaryEl.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  setDropEffect(event);
  fileSummaryEl.classList.add("is-dragging");
});
fileSummaryEl.addEventListener("dragleave", () => fileSummaryEl.classList.remove("is-dragging"));
fileSummaryEl.addEventListener("drop", (event) => {
  event.stopPropagation();
  fileSummaryEl.classList.remove("is-dragging");
  handleDroppedFile(event);
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

function restoreDynamicPanels(): void {
  if (dropzone!.parentElement !== onboardingEl) {
    onboardingEl!.append(dropzone!);
  }
  if (resultEl.parentElement !== workspaceEl) {
    workspaceEl!.append(resultEl);
  }
}

function setVerificationProgress(
  phase: number,
  status: VerificationProgressStatus = "running"
): void {
  currentProgressPhase = Math.max(-1, Math.min(4, phase));
  currentProgressStatus = status;
  syncProgressUI();
}

function syncProgressUI(): void {
  const steps = Array.from(progressEl!.querySelectorAll<HTMLElement>("[data-progress-step]"));
  const progressScale = currentProgressPhase <= 0 ? 0 : currentProgressPhase / 4;
  progressEl!.style.setProperty("--verification-progress-scale", String(progressScale));
  progressEl!.setAttribute("aria-label", t("progress.ariaLabel"));

  const labelKeys = [
    "progress.file",
    "progress.local",
    "progress.signature",
    "progress.server",
    "progress.result"
  ];

  progressEl!.classList.toggle("is-invalid", currentProgressStatus === "invalid");

  steps.forEach((step, index) => {
    const title = step.querySelector<HTMLElement>("strong");
    const detail = step.querySelector<HTMLElement>("[data-progress-detail]");
    const complete = currentProgressPhase > index || (currentProgressPhase === 4 && currentProgressStatus === "valid");
    const active = currentProgressPhase === index;
    step.classList.toggle("is-complete", complete);
    step.classList.toggle("is-active", active);
    step.classList.toggle("is-invalid", active && currentProgressStatus === "invalid");
    if (title) {
      title.textContent = t(labelKeys[index]);
    }
    if (detail) {
      detail.textContent = progressDetailForStep(index);
    }
  });
}

function progressDetailForStep(index: number): string {
  if (currentProgressStatus === "idle" || currentProgressPhase < 0) {
    return t(index === 0 ? "progress.fileWaiting" : "progress.waiting");
  }
  if (currentProgressStatus === "invalid" && index === currentProgressPhase) {
    return t("progress.failed");
  }
  if (index === 0) {
    return t("progress.fileRead");
  }
  if (index === 1) {
    if (currentProgressPhase < 1) return t("progress.waiting");
    return t(currentProgressPhase === 1 ? "progress.checking" : "progress.bindingPassed");
  }
  if (index === 2) {
    if (currentProgressPhase < 2) return t("progress.waiting");
    return t(currentProgressPhase === 2 ? "progress.signatureChecking" : "progress.signatureValid");
  }
  if (index === 3) {
    if (currentProgressPhase < 3) return t("progress.waiting");
    return t(currentProgressPhase === 3 ? "progress.serverChecking" : "progress.issuedByTapCam");
  }
  if (currentProgressPhase < 4) {
    return t("progress.waiting");
  }
  return t(currentProgressStatus === "valid" ? "progress.captureTrusted" : "progress.captureInvalid");
}

function syncFileSummary(): void {
  fileSummaryEl!.hidden = !currentFile;
  fileNameEl!.textContent = currentFile?.name ?? "";
  fileMetaEl!.textContent = currentFile
    ? `${formatBytes(currentFile.size)} · ${t("file.localOnly")}`
    : "";
  fileSelectButton!.textContent = t("dropzone.replacePhoto");
}

function resetToHome(event?: Event): void {
  event?.preventDefault();
  restoreDynamicPanels();
  cleanupGeometryViewer();
  cleanupVideoPlayback();
  document.querySelector("[data-result-modal]")?.remove();
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
  }
  activeObjectUrl = null;
  activeInputKind = null;
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
  currentProgressPhase = 0;
  currentProgressStatus = "idle";
  visualizationEl.hidden = true;
  visualizationEl.innerHTML = "";
  resultEl.innerHTML = "";
  fileSummaryEl!.hidden = true;
  onboardingEl!.hidden = false;
  dropzone!.classList.remove("dropzone--compact");
  dropzoneParticles!.hidden = false;
  emptyParticleField.setActive(true);
  const dropzoneSelect = dropzone!.querySelector<HTMLElement>("[data-dropzone-select]");
  if (dropzoneSelect) dropzoneSelect.textContent = t("dropzone.select");
  syncProgressUI();
}

navToolLink!.addEventListener("click", resetToHome);

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
      setVerificationProgress(0, "invalid");
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
    const result = await verifyFileBytes(runId, captureInput);
    if (runId !== activeRunId) {
      return;
    }

    currentResult = result;
    isVerifying = false;
    setVerificationProgress(4, result.finalStatus === "valid" ? "valid" : "invalid");

    resultEl.innerHTML = renderVerificationResult(result);
    const modal = resultModalFor(result);
    await showResultModal(modal.type, modal.config);
    if (runId !== activeRunId) {
      return;
    }
    revealVisualization(runId);
  } catch (error) {
    if (runId === activeRunId) {
      isVerifying = false;
      setVerificationProgress(Math.max(1, currentProgressPhase), "invalid");
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
      if (e.key === "Enter") {
        e.preventDefault();
        dismiss();
      }
    }

    closeBtn?.addEventListener("click", dismiss);
    document.addEventListener("keydown", handleKey);

    closeBtn?.focus();
  });
}

function resultModalFor(result: CombinedVerificationResult): {
  type: ResultModalType;
  config: { title: string; desc: string; detail?: string; buttonText: string };
} {
  const type = classifyResult(result);
  const isVideo = result.local.mediaKind === "video";

  switch (type) {
    case "success":
      return {
        type,
        config: {
          title: t(isVideo ? "modal.videoValidTitle" : "modal.validTitle"),
          desc: t(isVideo ? "modal.videoValidDesc" : "modal.validDesc"),
          detail: t("modal.validNote", {
            fileName: result.fileName,
            fileSize: formatBytes(result.fileSize)
          }),
          buttonText: t("modal.continueAnalysis")
        }
      };
    case "noSignature":
      return {
        type,
        config: {
          title: t("modal.noSignatureTitle"),
          desc: t(isVideo ? "modal.videoNoSignatureDesc" : "modal.noSignatureDesc"),
          detail: t(isVideo ? "modal.videoNoSignatureHint" : "modal.noSignatureHint"),
          buttonText: t("modal.continueAnalysis")
        }
      };
    case "networkError":
      return {
        type,
        config: {
          title: t("modal.networkErrorTitle"),
          desc: t("modal.networkErrorDesc"),
          detail: t("modal.networkErrorHint"),
          buttonText: t("modal.continueAnalysis")
        }
      };
    case "invalid":
      return {
        type,
        config: {
          title: t("modal.invalidTitle"),
          desc: t(isVideo ? "modal.videoInvalidDesc" : "modal.invalidDesc"),
          detail: t("modal.invalidHint"),
          buttonText: t("modal.continueAnalysis")
        }
      };
    case "parseError":
      return {
        type,
        config: {
          title: t("modal.parseErrorTitle"),
          desc: t("modal.parseErrorDesc"),
          buttonText: t("modal.retry")
        }
      };
  }
}

function beginSelectedFile(file: File): number {
  activeRunId += 1;
  restoreDynamicPanels();
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
  cleanupVideoPlayback();
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
  }
  activeObjectUrl = null;
  activeInputKind = null;

  currentFile = file;
  currentResult = null;
  isVerifying = true;
  verifyingFileName = file.name;
  verifyingFileSize = file.size;
  currentDepthState = null;
  currentGeometryState = null;
  currentProgressPhase = 0;
  currentProgressStatus = "running";

  visualizationEl.hidden = true;
  visualizationEl.innerHTML = "";
  onboardingEl!.hidden = true;
  emptyParticleField.setActive(false);
  dropzoneParticles!.hidden = true;
  syncFileSummary();
  syncProgressUI();
  updateDepthPanel({ status: "loading" });
  updateGeometryPanel({ status: "loading" });
  resultEl.innerHTML = renderVerificationBusy(file.name, file.size);
  return activeRunId;
}

function startAnalysis(runId: number, captureInput: CaptureInput): void {
  if (runId !== activeRunId) {
    return;
  }

  setVerificationProgress(1, "running");
  activeInputKind = captureInput.kind;
  if (captureInput.kind === "tap-video") {
    renderVideoVisualizationScaffold(captureInput.videoFile);
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
    <div class="analysis-layout">
      <div class="analysis-main">
        <article class="visual-pane visual-pane--geometry" data-pane-geometry>
          <header>
            <h2>${t("panel.geometry")}</h2>
            <span>${t("panel.geometrySubtitle")}</span>
          </header>
          <div class="geometry-panel" id="geometryPanel"></div>
        </article>
      </div>
      <aside class="analysis-side">
        <article class="visual-pane" data-pane-original>
          <header>
            <h2>${t("panel.original")}</h2>
          </header>
          <div class="media-frame" id="originalFrame">
            <img id="originalPreview" src="${objectUrl}" alt="${escapeHtml(file.name)}" />
          </div>
        </article>
        <article class="visual-pane" data-pane-depth>
          <header>
            <h2>${t("panel.depth")}</h2>
          </header>
          <div class="depth-panel" id="depthPanel"></div>
        </article>
        <article class="visual-pane analysis-details" data-pane-details>
          <header>
            <h2>${t("panel.details")}</h2>
          </header>
          <div class="analysis-details__result" data-result-slot></div>
          <div class="analysis-details__diagnostics" data-depth-details></div>
          <div class="analysis-details__diagnostics" data-geometry-details></div>
        </article>
      </aside>
    </div>
  `;
  placeAnalysisPanels();
  attachOriginalPreviewFallback(file, activeRunId);
}

function renderVideoVisualizationScaffold(file: File): void {
  visualizationEl.hidden = true;
  visualizationEl.innerHTML = `
    <div class="analysis-layout analysis-layout--video">
      <div class="analysis-main">
        <article class="visual-pane" data-pane-video>
          <header>
            <h2>${t("panel.video")}</h2>
            <span>${escapeHtml(file.name)} · ${formatBytes(file.size)}</span>
          </header>
          <div class="video-frame" id="videoFrame">
            <div class="video-auth-wait" data-video-auth-wait>${t("videoPlayer.waitingForVerification")}</div>
            <video id="videoPreview" controls playsinline preload="metadata" aria-label="${t("videoPlayer.ariaLabel")}" hidden></video>
          </div>
        </article>
      </div>
      <aside class="analysis-side">
        <article class="visual-pane" data-pane-video-depth>
          <header>
            <h2>${t("panel.videoDepth")}</h2>
            <span data-video-depth-meta>${t("videoPlayer.depthSubtitle")}</span>
          </header>
          <div class="video-depth-frame">
            <canvas id="videoDepthCanvas" aria-label="${t("videoPlayer.depthAriaLabel")}"></canvas>
            <p class="video-depth-status" data-video-depth-status>${t("videoPlayer.waitingForVerification")}</p>
          </div>
        </article>
        <article class="visual-pane visual-pane--disabled" data-pane-geometry aria-disabled="true">
          <header>
            <h2>${t("panel.geometry")}</h2>
            <span class="disabled-badge">${t("videoPlayer.disabled")}</span>
          </header>
          <div class="geometry-message geometry-message--disabled">
            <span>${t("videoPlayer.geometryDisabled")}</span>
          </div>
        </article>
        <article class="visual-pane analysis-details" data-pane-details>
          <header><h2>${t("panel.details")}</h2></header>
          <div class="analysis-details__result" data-result-slot></div>
        </article>
      </aside>
    </div>
  `;
  placeAnalysisPanels();
}

function placeAnalysisPanels(): void {
  const resultSlot = visualizationEl.querySelector<HTMLElement>("[data-result-slot]");
  if (resultSlot) {
    resultSlot.append(resultEl);
  }
}

function activateVerifiedVideoPlayback(runId: number, input: Extract<CaptureInput, { kind: "tap-video" }>): void {
  if (runId !== activeRunId || activeInputKind !== "tap-video") return;
  const video = visualizationEl.querySelector<HTMLVideoElement>("#videoPreview");
  const canvas = visualizationEl.querySelector<HTMLCanvasElement>("#videoDepthCanvas");
  const status = visualizationEl.querySelector<HTMLElement>("[data-video-depth-status]");
  const metadata = visualizationEl.querySelector<HTMLElement>("[data-video-depth-meta]");
  const wait = visualizationEl.querySelector<HTMLElement>("[data-video-auth-wait]");
  if (!video || !canvas || !status || !metadata) return;

  cleanupVideoPlayback();
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = URL.createObjectURL(input.videoFile);
  video.src = activeObjectUrl;
  video.hidden = false;
  wait?.remove();
  status.textContent = t("videoPlayer.depthLoading");
  activeVideoPlaybackCleanup = mountTapVideoDepthPlayback(video, canvas, status, metadata, input.videoBytes);
}

function updatePaneHeaders(): void {
  const videoPane = visualizationEl.querySelector<HTMLElement>("[data-pane-video] h2");
  const videoDepthPane = visualizationEl.querySelector<HTMLElement>("[data-pane-video-depth] h2");
  if (videoPane) videoPane.textContent = t("panel.video");
  if (videoDepthPane) videoDepthPane.textContent = t("panel.videoDepth");
  const originalPane = visualizationEl.querySelector<HTMLElement>("[data-pane-original] h2");
  const depthPane = visualizationEl.querySelector<HTMLElement>("[data-pane-depth] h2");
  const depthPaneSubtitle = visualizationEl.querySelector<HTMLElement>("[data-pane-depth] header span");
  const geometryPane = visualizationEl.querySelector<HTMLElement>("[data-pane-geometry] h2");
  const geometryPaneSubtitle = visualizationEl.querySelector<HTMLElement>("[data-pane-geometry] header span");
  const detailsPane = visualizationEl.querySelector<HTMLElement>("[data-pane-details] h2");

  if (originalPane) originalPane.textContent = t("panel.original");
  if (depthPane) depthPane.textContent = t("panel.depth");
  if (depthPaneSubtitle) depthPaneSubtitle.textContent = t("panel.depthSubtitle");
  if (geometryPane) geometryPane.textContent = t("panel.geometry");
  if (geometryPaneSubtitle) geometryPaneSubtitle.textContent = t("panel.geometrySubtitle");
  if (detailsPane) detailsPane.textContent = t("panel.details");
  const disabledBadge = visualizationEl.querySelector<HTMLElement>(".disabled-badge");
  const disabledMessage = visualizationEl.querySelector<HTMLElement>(".geometry-message--disabled span");
  if (disabledBadge) disabledBadge.textContent = t("videoPlayer.disabled");
  if (disabledMessage) disabledMessage.textContent = t("videoPlayer.geometryDisabled");
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
  relocatePanelDiagnostics(depthPanel, "[data-depth-details]");
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
  relocatePanelDiagnostics(geometryPanel, "[data-geometry-details]");
}

function relocatePanelDiagnostics(panel: HTMLElement, targetSelector: string): void {
  const target = visualizationEl.querySelector<HTMLElement>(targetSelector);
  if (!target) {
    return;
  }
  target.replaceChildren();
  const diagnostics = Array.from(
    panel.querySelectorAll<HTMLElement>(":scope > .depth-meta, :scope > .depth-warnings")
  );
  target.append(...diagnostics);
}

function cleanupGeometryViewer(): void {
  activeGeometryViewerCleanup?.();
  activeGeometryViewerCleanup = null;
}

function cleanupVideoPlayback(): void {
  activeVideoPlaybackCleanup?.();
  activeVideoPlaybackCleanup = null;
}

async function verifyFileBytes(runId: number, captureInput: CaptureInput): Promise<CombinedVerificationResult> {
  const local = captureInput.kind === "tap-video"
    ? await verifyTapVideoLocally(captureInput.videoBytes)
    : await verifyPhotoInputLocally(captureInput);
  const localFailure = hasLocalFailure(local);

  if (runId === activeRunId) {
    setVerificationProgress(localFailure ? 1 : 2, localFailure ? "invalid" : "running");
  }

  if (!localFailure && captureInput.kind === "tap-video") {
    activateVerifiedVideoPlayback(runId, captureInput);
  }

  if (localFailure || !local.serverRequest) {
    if (runId === activeRunId && !localFailure) {
      setVerificationProgress(2, "invalid");
    }
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
    if (runId === activeRunId) {
      setVerificationProgress(3, "running");
    }
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

function verifyPhotoInputLocally(captureInput: PhotoCaptureInput): Promise<LocalVerificationReport> {
  return verifyCapturePackageLocally(captureInput.photoBytes, captureInput.pairedVideoBytes);
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
  const topbarLabels = getTapCamTopbarLabels(getLang());
  navBrandText!.textContent = "TAPCam";
  navDocLink!.textContent = topbarLabels.docs;
  navToolLink!.textContent = topbarLabels.verify;
  navDownloadLink!.textContent = topbarLabels.download;
  navGithubLink!.setAttribute("aria-label", "GitHub");
  navLangBtn!.dataset.locale = getLang();
  navLangBtn!.setAttribute("aria-label", getLang() === "zh" ? "Switch to English" : "切换到中文");

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

  const dropzoneSelect = dropzone!.querySelector<HTMLElement>("[data-dropzone-select]");
  const dropzoneInstruction = dropzone!.querySelector<HTMLElement>("[data-dropzone-instruction]");
  const dropzoneFormats = dropzone!.querySelector<HTMLElement>("[data-dropzone-formats]");
  const dropzonePrivacy = dropzone!.querySelector<HTMLElement>("[data-dropzone-privacy]");
  if (dropzoneSelect) dropzoneSelect.textContent = dropzone!.classList.contains("dropzone--compact")
    ? t("dropzone.replace")
    : t("dropzone.select");
  if (dropzoneInstruction) dropzoneInstruction.textContent = t("dropzone.instruction");
  if (dropzoneFormats) dropzoneFormats.textContent = t("dropzone.formats");
  if (dropzonePrivacy) dropzonePrivacy.textContent = t("dropzone.privacy");

  syncFileSummary();
  syncProgressUI();

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

refreshUI();
