import type { DecodedDepthPlane, DepthVisualizationResult, DisplayOrientationReference } from "../depth/types";
import type { DecodedPrimaryImage, OriginalPreviewResult } from "../original/types";
import type { LocalVerificationReport } from "../verifier/types";

interface TapcamVerifierExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  tapcam_verify_alloc(len: number): number;
  tapcam_verify_dealloc(ptr: number, len: number): void;
  tapcam_verify_file(ptr: number, len: number): number;
  tapcam_visualize_depth_u8(
    filePtr: number,
    fileLen: number,
    lumaPtr: number,
    lumaLen: number,
    width: number,
    height: number,
    displayWidth: number,
    displayHeight: number
  ): number;
  tapcam_prepare_original_rgba(
    filePtr: number,
    fileLen: number,
    rgbaPtr: number,
    rgbaLen: number,
    width: number,
    height: number,
    maxEdge: number
  ): number;
  tapcam_verify_result_len(): number;
  tapcam_verify_clear_result(): void;
}

const ORIGINAL_PREVIEW_MAX_EDGE = 1200;

let exportsPromise: Promise<TapcamVerifierExports> | null = null;

export async function verifyCaptureLocally(fileBytes: Uint8Array): Promise<LocalVerificationReport> {
  const wasm = await loadVerifierWasm();
  const inputPtr = wasm.tapcam_verify_alloc(fileBytes.length);

  try {
    new Uint8Array(wasm.memory.buffer, inputPtr, fileBytes.length).set(fileBytes);
    const resultPtr = wasm.tapcam_verify_file(inputPtr, fileBytes.length);

    const resultLen = wasm.tapcam_verify_result_len();
    const resultBytes = new Uint8Array(wasm.memory.buffer, resultPtr, resultLen);
    const resultJson = new TextDecoder().decode(resultBytes);
    return JSON.parse(resultJson) as LocalVerificationReport;
  } finally {
    wasm.tapcam_verify_dealloc(inputPtr, fileBytes.length);
    wasm.tapcam_verify_clear_result();
  }
}

export async function visualizeDepthPlane(
  fileBytes: Uint8Array,
  depthPlane: DecodedDepthPlane,
  displayReference?: DisplayOrientationReference
): Promise<DepthVisualizationResult> {
  const wasm = await loadVerifierWasm();
  const filePtr = wasm.tapcam_verify_alloc(fileBytes.length);
  const lumaPtr = wasm.tapcam_verify_alloc(depthPlane.luma.length);

  try {
    new Uint8Array(wasm.memory.buffer, filePtr, fileBytes.length).set(fileBytes);
    new Uint8Array(wasm.memory.buffer, lumaPtr, depthPlane.luma.length).set(depthPlane.luma);
    const resultPtr = wasm.tapcam_visualize_depth_u8(
      filePtr,
      fileBytes.length,
      lumaPtr,
      depthPlane.luma.length,
      depthPlane.width,
      depthPlane.height,
      displayReference?.width ?? 0,
      displayReference?.height ?? 0
    );

    const result = readJsonResult(wasm, resultPtr) as DepthVisualizationResult & {
      previewRgbaBase64?: string;
    };
    if (result.status === "available") {
      result.previewRgba = decodeBase64(result.previewRgbaBase64 ?? "");
      delete result.previewRgbaBase64;
    }
    return result;
  } finally {
    wasm.tapcam_verify_dealloc(filePtr, fileBytes.length);
    wasm.tapcam_verify_dealloc(lumaPtr, depthPlane.luma.length);
    wasm.tapcam_verify_clear_result();
  }
}

export async function prepareOriginalPreviewRgba(
  fileBytes: Uint8Array,
  primaryImage: DecodedPrimaryImage
): Promise<OriginalPreviewResult> {
  const wasm = await loadVerifierWasm();
  const filePtr = wasm.tapcam_verify_alloc(fileBytes.length);
  const rgbaPtr = wasm.tapcam_verify_alloc(primaryImage.rgba.length);

  try {
    new Uint8Array(wasm.memory.buffer, filePtr, fileBytes.length).set(fileBytes);
    new Uint8Array(wasm.memory.buffer, rgbaPtr, primaryImage.rgba.length).set(primaryImage.rgba);
    const resultPtr = wasm.tapcam_prepare_original_rgba(
      filePtr,
      fileBytes.length,
      rgbaPtr,
      primaryImage.rgba.length,
      primaryImage.width,
      primaryImage.height,
      ORIGINAL_PREVIEW_MAX_EDGE
    );

    const result = readJsonResult(wasm, resultPtr) as OriginalPreviewResult & {
      previewRgbaBase64?: string;
    };
    if (result.status === "available") {
      result.previewRgba = decodeBase64(result.previewRgbaBase64 ?? "");
      delete result.previewRgbaBase64;
    }
    return result;
  } finally {
    wasm.tapcam_verify_dealloc(filePtr, fileBytes.length);
    wasm.tapcam_verify_dealloc(rgbaPtr, primaryImage.rgba.length);
    wasm.tapcam_verify_clear_result();
  }
}

async function loadVerifierWasm(): Promise<TapcamVerifierExports> {
  exportsPromise ??= instantiateVerifierWasm();
  return exportsPromise;
}

async function instantiateVerifierWasm(): Promise<TapcamVerifierExports> {
  const wasmUrl = new URL(`${import.meta.env.BASE_URL}wasm/tapcam_verifier_wasm.wasm`, window.location.href);
  const response = await fetch(wasmUrl);

  if (!response.ok) {
    throw new Error(`Failed to load verifier WASM: HTTP ${response.status}`);
  }

  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.instantiate(bytes, {});
  return module.instance.exports as TapcamVerifierExports;
}

function readJsonResult(wasm: TapcamVerifierExports, resultPtr: number): unknown {
  const resultLen = wasm.tapcam_verify_result_len();
  const resultBytes = new Uint8Array(wasm.memory.buffer, resultPtr, resultLen);
  const resultJson = new TextDecoder().decode(resultBytes);
  return JSON.parse(resultJson) as unknown;
}

function decodeBase64(value: string): Uint8ClampedArray {
  const binary = atob(value);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
