import { describe, expect, it } from "vitest";
import {
  CAPTURE_SIGNATURE_VERIFY_PATH,
  CAPTURE_SIGNATURE_VERIFY_URL,
  verifyCaptureSignature
} from "./serverVerify";
import type { CaptureSignatureVerifyRequest } from "./types";

const request: CaptureSignatureVerifyRequest = {
  keyId: "test-key-id",
  assertionObject: "assertion",
  signingBinding: {
    bodySHA256: "body",
    captureID: "capture",
    operation: "tapcam.capture.sign",
    schemaID: "urn:tapnap:tapcam:app-attest-capture-signing:v1"
  }
};

describe("verifyCaptureSignature", () => {
  it("posts proof material to the server endpoint", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          status: "valid",
          keyId: "test-key-id",
          signingBindingSHA256: "binding"
        }),
        { status: 200 }
      );
    };

    const response = await verifyCaptureSignature(request, fetcher as typeof fetch);

    expect(response.status).toBe("valid");
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe(CAPTURE_SIGNATURE_VERIFY_URL);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual(request);
  });

  it("can post proof material to an overridden endpoint", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ status: "valid" }), { status: 200 });
    };

    await verifyCaptureSignature(request, fetcher as typeof fetch, CAPTURE_SIGNATURE_VERIFY_PATH);

    expect(calls[0].input).toBe(CAPTURE_SIGNATURE_VERIFY_PATH);
  });

  it("normalizes semantic invalid responses", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          status: "invalid",
          reason: "bad-signature"
        }),
        { status: 200 }
      );

    const response = await verifyCaptureSignature(request, fetcher as typeof fetch);

    expect(response).toEqual({
      status: "invalid",
      reason: "bad-signature"
    });
  });

  it("normalizes non-2xx responses", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          reason: "not-found"
        }),
        { status: 404 }
      );

    const response = await verifyCaptureSignature(request, fetcher as typeof fetch);

    expect(response).toEqual({
      status: "invalid",
      reason: "not-found"
    });
  });
});
