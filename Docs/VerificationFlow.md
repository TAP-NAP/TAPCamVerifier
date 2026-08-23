# Verification Flow

The documentation-only
[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts)
repository is the sole authority for Still/Live/Video manifests,
canonicalization, containers/KLV, proof slots, signing, local reconstruction,
App Attest verification, hash participation, and `.tapnap` routing. This page
owns only TAPCamVerifier's input routing, implementation stages, report scopes,
presentation, and server-call orchestration.

This flow adopts shared revision
[`63f96b31de193c3ad456ffa500cc0db03fb97142`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/63f96b31de193c3ad456ffa500cc0db03fb97142).

## Local Flow

```text
selected HEIC/JPG, TAP Video MP4, or current .tapnap
  -> bounded input/package resolution
  -> Rust/WASM photo/Live verifier or TypeScript TAP Video verifier
  -> reconstruct and compare the binding required for the reported local scope
  -> scoped local report
  -> if local gate passed: server App Attest request
  -> join local scope + server result into final valid / invalid

after input resolution:
  -> bounded photo preview/depth/geometry work may run independently
after a TAP Video local gate passes:
  -> bounded playback/KLV inspection may start while the server is pending
```

The required ordering and rejection relationships live in the shared
[binding/proof contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/bindings/capture-binding-and-proof-v1.md).
Known implementation gaps remain in the shared
[divergence ledger](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/KNOWN_DIVERGENCES.md)
rather than being normalized into another local wire contract.

The browser keeps original media bytes local and submits only the shared
capture-signature request shape. A local relationship pass is not cryptographic
App Attest validity, and a server-valid response alone is not a verdict about
the received media.

## Input And Scope Ownership

- Rust/WASM owns HEIC/JPEG proof-slot/XMP parsing, Still/Live local binding
  reconstruction, and the photo/paired-MOV report.
- TypeScript owns current `.tapnap` resolution, TAP Video MP4 parsing and local
  binding reconstruction, and server-request orchestration.
- Package parsing is bounded before extraction. The unsigned sidecar locates
  resources but cannot classify signed media or supply trusted values.
- A complete Live Photo package may report `fullLivePhoto`. A proof-bearing
  Live Photo primary without its MOV may report
  `primaryPhotoFromLivePhoto`, but must state that video bytes were not checked.
- MOV-only input remains unsupported because it lacks the primary artifact's
  embedded manifest, proof slot, and assertion material.

Transport layout and rejection rules are not repeated here; they live in the
shared
[`.tapnap` contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/transport/tapnap-v1.md).

## Report And Presentation Rules

The final result is `valid` or `invalid`. A result is valid only when the
required local scope passes and the server returns a valid App Attest result.
Warnings are an attached list, not a third final state.

A missing or mismatched Live Photo MOV limits the result to the primary-photo
scope and must never be presented as full Live Photo verification. Preview,
depth, geometry, or playback warnings do not become signature inputs and do not
upgrade a failed verification.

## Parallel Analysis Boundary

After input resolution, visual analysis and signature verification may run as
independent bounded paths over the same primary bytes. Decoded RGB, auxiliary
depth/disparity, point clouds, and video frames are never base-signature inputs.

For TAP Video, the player may start bounded sample-table/KLV inspection after
the local binding relationship gate while the server request is pending. Those
semantic results remain untrusted until the App Attest gate passes and cannot
produce the final authenticated result. A signature failure does not make an
already bounded visualization a signature input or scene-truth claim.

## Server Boundary

After the local gate passes, the browser posts the shared request shape to:

```text
https://www.tapnap.net/tapcam/capture-signatures/verify
```

The production page origin is `https://verifier.tapnap.net`. Local development
origins are expected to fail server verification unless the server CORS
allowlist explicitly includes them. Network/CORS failure is reported separately
from a local binding failure.

## Implementation Entry Points

- `src/input/` resolves supported files and packages.
- `crates/tapcam-verifier-wasm/` implements photo/Live local verification.
- `src/video/tapVideo.ts` implements TAP Video local verification and bounded
  depth inspection.
- `src/verifier/serverVerify.ts` submits the server request after local success.
- `src/verifier/serverBoundaryDiagnostic.ts` compares the server's diagnostic
  signing-binding hash; that diagnostic is not an artifact field.
- `src/main.ts` joins verification, server, analysis, playback, and UI state.
