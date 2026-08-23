# Verification Flow

The documentation-only
[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts)
repository is the authority for current Still/Live/Video manifests,
canonicalization, containers/KLV, proof slots, signing, verification, hash
participation, and `.tapnap` transport. This page owns only TAPCamVerifier's
input routing, implementation stages, report scopes, presentation, and server
orchestration.

This flow adopts shared revision
[`63f96b31de193c3ad456ffa500cc0db03fb97142`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/63f96b31de193c3ad456ffa500cc0db03fb97142).

## Local Flow

```text
selected HEIC/JPG, TAP Video MP4, .tapnap, or legacy ZIP
  -> bounded input and package resolution
  -> photo/Live Rust/WASM verifier or TAP Video TypeScript verifier
  -> reconstruct and compare the binding required for the reported local scope
  -> if that local gate passes: submit the shared App Attest request
  -> join local scope + server response into final valid / invalid

after input resolution:
  -> bounded photo preview/depth/geometry work may run independently
after a TAP Video local gate passes:
  -> bounded playback/KLV inspection may start while the server is pending
```

The required ordering and rejection relationships live in the shared
[binding/proof contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/bindings/capture-binding-and-proof-v1.md).
Known implementation gaps are recorded in the shared
[divergence ledger](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/KNOWN_DIVERGENCES.md)
rather than normalized into another local wire contract.

The browser keeps original media bytes local and submits only the shared
capture-signature request shape. A local relationship pass is not cryptographic
App Attest validity; a server-valid response alone is not a verdict about the
received media.

## Input And Scope Ownership

- Rust/WASM owns HEIC/JPEG proof-slot/XMP parsing, Still/Live local binding
  reconstruction, and the photo/paired-MOV report.
- TypeScript owns bounded package resolution, TAP Video MP4 parsing and local
  binding reconstruction, server orchestration, playback, and UI state.
- The unsigned package sidecar may locate resources but cannot classify signed
  media or provide trusted hash/verdict values.
- A complete matching Live Photo package may report `fullLivePhoto`.
- A proof-bearing Live Photo primary without a matching MOV may report
  `primaryPhotoFromLivePhoto`; the report must state that motion/video bytes
  were not verified.
- MOV-only input remains unsupported because it lacks the primary artifact's
  embedded manifest, proof slot, and assertion material.

Current `.tapnap` layout and rejection rules live in the shared
[transport contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/transport/tapnap-v1.md).
This source revision also retains a local legacy ZIP compatibility route. That
route does not define a current shared format.

## Report And Presentation

The final result is `valid` or `invalid`. A result is valid only when the
required local scope passes and the server returns a valid App Attest result.
Local failure, missing server material, server rejection, and network failure
cannot produce a valid result.

Warnings are an attached list, not a third final state. A missing or mismatched
Live Photo MOV limits the report to the primary-photo scope and must never be
presented as full Live Photo verification. Preview, depth, geometry, or
playback warnings do not become signature inputs and do not upgrade a failed
verification.

## Parallel Analysis Boundary

After input resolution, photo preview, auxiliary-depth/disparity analysis,
relative geometry, and signature verification may run as independent bounded
paths over the same bytes. The valid-signature modal controls when completed
analysis becomes visible; it does not make that analysis part of the signature.

For TAP Video, playback and bounded sample-table/KLV inspection may begin after
the local binding relationship passes while the server request is pending.
Those semantic results remain untrusted until the App Attest gate passes and
cannot produce the final authenticated result. A later signature failure does
not turn visualization output into signed evidence or a scene-truth claim.

## Server Boundary

After the local gate passes, the browser posts the shared request shape to:

```text
https://www.tapnap.net/tapcam/capture-signatures/verify
```

The production page origin is `https://verifier.tapnap.net`. Local development
origins are expected to fail server verification unless the server CORS
allowlist explicitly includes them. Network/CORS failure is reported
separately from a local binding failure.

## Implementation Entry Points

- `src/input/` resolves supported files and packages.
- `crates/tapcam-verifier-wasm/` implements photo/Live local verification.
- `src/video/tapVideo.ts` implements TAP Video local verification and bounded
  depth inspection.
- `src/video/videoPlayback.ts` owns synchronized browser playback.
- `src/verifier/serverVerify.ts` submits the server request after local success.
- `src/verifier/serverBoundaryDiagnostic.ts` compares the server's diagnostic
  signing-binding hash; that diagnostic is not an artifact field.
- `src/main.ts` coordinates local verification, server response, analysis,
  playback, and final UI state.
