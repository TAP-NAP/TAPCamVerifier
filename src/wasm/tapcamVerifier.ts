import type { LocalVerificationReport } from "../verifier/types";

interface TapcamVerifierExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  tapcam_verify_alloc(len: number): number;
  tapcam_verify_dealloc(ptr: number, len: number): void;
  tapcam_verify_file(ptr: number, len: number): number;
  tapcam_verify_result_len(): number;
  tapcam_verify_clear_result(): void;
}

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
