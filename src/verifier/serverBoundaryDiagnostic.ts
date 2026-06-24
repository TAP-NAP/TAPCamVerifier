import type {
  CaptureSignatureVerifyResponse,
  LocalVerificationReport,
  ServerBoundaryDiagnostic
} from "./types";

export function buildServerBoundaryDiagnostic(
  local: LocalVerificationReport,
  server: CaptureSignatureVerifyResponse | null,
  serverError: string | null
): ServerBoundaryDiagnostic {
  const localSigningBindingSHA256 = local.recomputed?.signingBindingSHA256;

  if (!server) {
    return {
      status: "not-run",
      summary: serverError
        ? `Server boundary comparison did not run: ${serverError}.`
        : "Server boundary comparison did not run.",
      localSigningBindingSHA256
    };
  }

  const serverSigningBindingSHA256 = server.signingBindingSHA256;

  if (!localSigningBindingSHA256) {
    return {
      status: "not-run",
      summary: "Server boundary comparison did not run: browser/WASM signingBindingSHA256 is missing.",
      serverSigningBindingSHA256
    };
  }

  if (!serverSigningBindingSHA256) {
    return {
      status: "not-echoed",
      summary: "Server response did not echo signingBindingSHA256; boundary comparison was skipped.",
      localSigningBindingSHA256
    };
  }

  if (serverSigningBindingSHA256 !== localSigningBindingSHA256) {
    return {
      status: "mismatch",
      summary:
        "Server boundary integration drift: echoed signingBindingSHA256 does not match the browser/WASM hash of the submitted signingBinding.",
      localSigningBindingSHA256,
      serverSigningBindingSHA256
    };
  }

  return {
    status: "matched",
    summary: "Server boundary echo matched the browser/WASM hash of the submitted signingBinding.",
    localSigningBindingSHA256,
    serverSigningBindingSHA256
  };
}
