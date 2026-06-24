import { describe, expect, it } from "vitest";
import { buildServerBoundaryDiagnostic } from "./serverBoundaryDiagnostic";
import type { LocalVerificationReport } from "./types";

const local: LocalVerificationReport = {
  status: "valid",
  summary: "All local content binding checks passed.",
  captureId: "capture-id",
  capturedAt: "2026-06-23T00:00:00.000Z",
  recomputed: {
    signingBindingSHA256: "binding"
  },
  serverRequest: {
    keyId: "key",
    assertionObject: "assertion",
    signingBinding: {
      bodySHA256: "body",
      captureID: "capture-id",
      operation: "tapcam.capture.sign",
      schemaID: "urn:tapnap:tapcam:app-attest-capture-signing:v1"
    }
  },
  checks: []
};

describe("buildServerBoundaryDiagnostic", () => {
  it("marks matching server echoes", () => {
    const diagnostic = buildServerBoundaryDiagnostic(
      local,
      { status: "valid", signingBindingSHA256: "binding" },
      null
    );

    expect(diagnostic).toEqual({
      status: "matched",
      summary: "Server boundary echo matched the browser/WASM hash of the submitted signingBinding.",
      localSigningBindingSHA256: "binding",
      serverSigningBindingSHA256: "binding"
    });
  });

  it("marks mismatched server echoes as integration drift", () => {
    const diagnostic = buildServerBoundaryDiagnostic(
      local,
      { status: "valid", signingBindingSHA256: "other-binding" },
      null
    );

    expect(diagnostic.status).toBe("mismatch");
    expect(diagnostic.summary).toContain("integration drift");
    expect(diagnostic.localSigningBindingSHA256).toBe("binding");
    expect(diagnostic.serverSigningBindingSHA256).toBe("other-binding");
  });

  it("marks missing server echoes as skipped diagnostics", () => {
    const diagnostic = buildServerBoundaryDiagnostic(local, { status: "valid" }, null);

    expect(diagnostic).toEqual({
      status: "not-echoed",
      summary: "Server response did not echo signingBindingSHA256; boundary comparison was skipped.",
      localSigningBindingSHA256: "binding"
    });
  });

  it("marks absent server results as not run", () => {
    const diagnostic = buildServerBoundaryDiagnostic(local, null, "Failed to fetch");

    expect(diagnostic.status).toBe("not-run");
    expect(diagnostic.summary).toContain("Failed to fetch");
  });
});
