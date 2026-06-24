export type CheckStatus = "pass" | "fail";

export interface VerificationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  actual?: unknown;
  expected?: unknown;
}

export interface SigningBinding {
  bodySHA256: string;
  captureID: string;
  operation: "tapcam.capture.sign";
  schemaID: "urn:tapnap:tapcam:app-attest-capture-signing:v1";
}

export interface CaptureSignatureVerifyRequest {
  keyId: string;
  assertionObject: string;
  signingBinding: SigningBinding;
}

export interface CaptureSignatureVerifyResponse {
  status: "valid" | "invalid" | string;
  keyId?: string;
  signingBindingSHA256?: string;
  reason?: string;
}

export type ServerBoundaryDiagnosticStatus =
  | "matched"
  | "mismatch"
  | "not-echoed"
  | "not-run";

export interface ServerBoundaryDiagnostic {
  status: ServerBoundaryDiagnosticStatus;
  summary: string;
  localSigningBindingSHA256?: string;
  serverSigningBindingSHA256?: string;
}

export interface LocalVerificationReport {
  status: "invalid" | "valid" | string;
  summary: string;
  captureId: string | null;
  capturedAt: string | null;
  manifest?: {
    containerFormat?: "heif" | "jpeg" | "unknown" | string;
    schemaId?: string | null;
    proofCount?: number;
    capture?: unknown;
  };
  proofSlot?: {
    kind?: string;
    offset?: number;
    length?: number;
    payloadOffset?: number;
    payloadLength?: number;
  };
  proof?: {
    type?: string;
    algorithm?: string;
    keyId?: string;
    createdAt?: string;
  };
  recomputed?: {
    assetSHA256?: string;
    metadataSHA256?: string;
    bodySHA256?: string;
    signingBindingSHA256?: string;
  };
  expected?: {
    assetSHA256?: string;
    metadataSHA256?: string;
    bodySHA256?: string;
    contentDigest?: unknown;
  };
  serverRequest: CaptureSignatureVerifyRequest | null;
  checks: VerificationCheck[];
}

export interface CombinedVerificationResult {
  fileName: string;
  fileSize: number;
  local: LocalVerificationReport;
  server: CaptureSignatureVerifyResponse | null;
  serverError: string | null;
  serverBoundary: ServerBoundaryDiagnostic;
  finalStatus: "valid" | "invalid";
}
