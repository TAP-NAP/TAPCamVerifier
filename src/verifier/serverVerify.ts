import type {
  CaptureSignatureVerifyRequest,
  CaptureSignatureVerifyResponse
} from "./types";

export const CAPTURE_SIGNATURE_VERIFY_PATH = "/tapcam/capture-signatures/verify";

export async function verifyCaptureSignature(
  request: CaptureSignatureVerifyRequest,
  fetcher: typeof fetch = fetch
): Promise<CaptureSignatureVerifyResponse> {
  const response = await fetcher(CAPTURE_SIGNATURE_VERIFY_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text.trim().length > 0) {
    payload = JSON.parse(text) as CaptureSignatureVerifyResponse;
  }

  if (!response.ok) {
    const reason = isObject(payload) && typeof payload.reason === "string"
      ? payload.reason
      : `HTTP ${response.status}`;
    return {
      status: "invalid",
      reason
    };
  }

  if (!isObject(payload) || typeof payload.status !== "string") {
    return {
      status: "invalid",
      reason: "Verify endpoint returned an invalid response shape."
    };
  }

  return payload as unknown as CaptureSignatureVerifyResponse;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
