import type {
  CaptureSignatureVerifyRequest,
  CaptureSignatureVerifyResponse
} from "./types";

export const CAPTURE_SIGNATURE_VERIFY_PATH = "/tapcam/capture-signatures/verify";
export const CAPTURE_SIGNATURE_VERIFY_URL =
  "https://www.tapnap.net/tapcam/capture-signatures/verify";

export async function verifyCaptureSignature(
  request: CaptureSignatureVerifyRequest,
  fetcher: typeof fetch = fetch,
  endpoint: string = CAPTURE_SIGNATURE_VERIFY_URL
): Promise<CaptureSignatureVerifyResponse> {
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) throw new Error(`Signature verification endpoint returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  if (!isObject(payload) || (payload.status !== "valid" && payload.status !== "invalid")) {
    throw new Error("Signature verification endpoint returned an invalid response shape.");
  }

  return payload as unknown as CaptureSignatureVerifyResponse;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
