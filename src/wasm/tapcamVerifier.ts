import type { DecodedDepthPlane, DepthVisualizationResult, DisplayOrientationReference } from "../depth/types";
import type { PixelProjectionMesh, PixelProjectionReport } from "../geometry/types";
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
  tapcam_project_depth_pixels(
    filePtr: number,
    fileLen: number,
    rgbaPtr: number,
    rgbaLen: number,
    rgbWidth: number,
    rgbHeight: number,
    depthPtr: number,
    depthLen: number,
    depthWidth: number,
    depthHeight: number,
    displayWidth: number,
    displayHeight: number
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

export async function projectDepthPixels(
  fileBytes: Uint8Array,
  rgbImage: DecodedPrimaryImage,
  depthPlane: DecodedDepthPlane,
  displayReference?: DisplayOrientationReference
): Promise<PixelProjectionReport> {
  const wasm = await loadVerifierWasm();
  const filePtr = wasm.tapcam_verify_alloc(fileBytes.length);
  const rgbaPtr = wasm.tapcam_verify_alloc(rgbImage.rgba.length);
  const depthPtr = wasm.tapcam_verify_alloc(depthPlane.luma.length);

  try {
    new Uint8Array(wasm.memory.buffer, filePtr, fileBytes.length).set(fileBytes);
    new Uint8Array(wasm.memory.buffer, rgbaPtr, rgbImage.rgba.length).set(rgbImage.rgba);
    new Uint8Array(wasm.memory.buffer, depthPtr, depthPlane.luma.length).set(depthPlane.luma);
    const resultPtr = wasm.tapcam_project_depth_pixels(
      filePtr,
      fileBytes.length,
      rgbaPtr,
      rgbImage.rgba.length,
      rgbImage.width,
      rgbImage.height,
      depthPtr,
      depthPlane.luma.length,
      depthPlane.width,
      depthPlane.height,
      displayReference?.width ?? 0,
      displayReference?.height ?? 0
    );

    return decodePixelProjectionReport(readJsonResult(wasm, resultPtr) as EncodedPixelProjectionReport);
  } finally {
    wasm.tapcam_verify_dealloc(filePtr, fileBytes.length);
    wasm.tapcam_verify_dealloc(rgbaPtr, rgbImage.rgba.length);
    wasm.tapcam_verify_dealloc(depthPtr, depthPlane.luma.length);
    wasm.tapcam_verify_clear_result();
  }
}

type EncodedPixelProjectionReport = PixelProjectionReport & {
  positionsBase64?: string;
  colorsBase64?: string;
  riskFlagsBase64?: string;
  outlierScoresBase64?: string;
  discontinuityScoresBase64?: string;
  mesh?: Partial<PixelProjectionMesh> & {
    indicesBase64?: string;
    stretchedIndicesBase64?: string;
  };
};

export function decodePixelProjectionReport(result: EncodedPixelProjectionReport): PixelProjectionReport {
  if (result.status === "available") {
    result.positions = decodeBase64Float32(result.positionsBase64 ?? "");
    result.colors = decodeBase64Bytes(result.colorsBase64 ?? "");
    result.riskFlags = decodeBase64Uint16(result.riskFlagsBase64 ?? "");
    result.outlierScores = decodeBase64Bytes(result.outlierScoresBase64 ?? "");
    result.discontinuityScores = decodeBase64Bytes(result.discontinuityScoresBase64 ?? "");
    if (result.mesh) {
      result.mesh.indices = decodeBase64Uint32(result.mesh.indicesBase64 ?? "");
      result.mesh.stretchedIndices = decodeBase64Uint32(result.mesh.stretchedIndicesBase64 ?? "");
      delete result.mesh.indicesBase64;
      delete result.mesh.stretchedIndicesBase64;
    }
    delete result.positionsBase64;
    delete result.colorsBase64;
    delete result.riskFlagsBase64;
    delete result.outlierScoresBase64;
    delete result.discontinuityScoresBase64;
  }
  return result;
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
  return new Uint8ClampedArray(decodeBase64Bytes(value));
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeBase64Float32(value: string): Float32Array {
  const bytes = decodeBase64Bytes(value);
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

export function decodeBase64Uint16(value: string): Uint16Array {
  const bytes = decodeBase64Bytes(value);
  return new Uint16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
}

function decodeBase64Uint32(value: string): Uint32Array {
  const bytes = decodeBase64Bytes(value);
  return new Uint32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}
