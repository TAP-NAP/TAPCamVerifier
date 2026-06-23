import "./styles.css";
import { verifyCaptureLocally } from "./wasm/tapcamVerifier";
import type {
  CombinedVerificationResult,
  LocalVerificationReport,
  VerificationCheck
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
    <section class="result" id="result" aria-live="polite"></section>
  </section>
`;

const dropzone = document.querySelector<HTMLDivElement>("#dropzone");
const fileInput = document.querySelector<HTMLInputElement>("#fileInput");
const resultPanel = document.querySelector<HTMLElement>("#result");

if (!dropzone || !fileInput || !resultPanel) {
  throw new Error("Verifier UI did not mount.");
}

const resultEl = resultPanel;

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
  renderBusy(file);

  try {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    renderResult(await verifyFileBytes(file, fileBytes));
  } catch (error) {
    renderError(error);
  }
}

async function verifyFileBytes(file: File, fileBytes: Uint8Array): Promise<CombinedVerificationResult> {
  const local = await verifyCaptureLocally(fileBytes);

  return {
    fileName: file.name,
    fileSize: file.size,
    local,
    server: null,
    serverError: "deferred",
    finalStatus: finalStatus(local)
  };
}

function finalStatus(
  local: LocalVerificationReport
): CombinedVerificationResult["finalStatus"] {
  const hasLocalFailure = local.checks.some((check) => check.status === "fail");

  if (hasLocalFailure) {
    return "invalid";
  }

  return "valid";
}

function renderBusy(file: File): void {
  resultEl.innerHTML = `
    <div class="status-line">
      <span class="status-pill status-pill--busy">verifying</span>
      <span>${escapeHtml(file.name)} · ${formatBytes(file.size)}</span>
    </div>
  `;
}

function renderError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  resultEl.innerHTML = `
    <div class="status-line">
      <span class="status-pill status-pill--invalid">invalid</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderResult(result: CombinedVerificationResult): void {
  const serverStatus = result.server
    ? `${result.server.status}${result.server.reason ? ` · ${result.server.reason}` : ""}`
    : result.serverError ?? "not run";

  resultEl.innerHTML = `
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
    <div class="checks">
      ${result.local.checks.map(renderCheck).join("")}
    </div>
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value: string): string {
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
