# Verification Flow

The documentation-only
[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts)
repository is the sole authority for Still/Live/Video manifests,
canonicalization, containers/KLV, proof slots, signing, local reconstruction,
App Attest verification, hash participation, and `.tapnap` routing. This page
owns only TAPCamVerifier's input routing, implementation stages, report scopes,
presentation, and server-call orchestration.

This flow adopts shared revision
[`ca3b223e0717242ce1016b34dc34f04ef2417936`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/ca3b223e0717242ce1016b34dc34f04ef2417936).

## Local Flow

```text
selected HEIC/JPG, TAP Video MP4, or current .tapnap
  -> bounded input/package resolution
  -> photo/Live only: one browser auxiliary-depth readback probe
  -> Rust/WASM photo/Live verifier or TypeScript TAP Video verifier
  -> reconstruct and compare the binding required for the reported local scope
  -> TAP Video only: bounded manifest, MP4/KLV, and decompression semantic gate
  -> scoped local report
  -> if local gate passed: server App Attest request
  -> join local scope + server result into final valid / invalid

after input resolution:
  -> bounded photo preview/depth/geometry work may run independently
after a TAP Video local gate passes:
  -> bounded playback/KLV inspection may start while the server is pending
```

The required ordering and rejection relationships live in the shared
[binding/proof contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/bindings/capture-binding-and-proof-v1.md).
Verifier-specific coverage and compatibility choices are recorded in the local
[Shared Contract Adoption Status](Roadmap.md#shared-contract-adoption-status);
they do not redefine the shared wire contract.

The browser keeps original media bytes local and submits only the shared
capture-signature request shape. A local relationship pass is not cryptographic
App Attest validity, and a server-valid response alone is not a verdict about
the received media.

## Input And Scope Ownership

- Rust/WASM owns HEIC/JPEG proof-slot/XMP parsing, Still/Live local binding
  reconstruction, and the photo/paired-MOV report. It receives the browser's
  explicit auxiliary-depth present/unavailable readback and rejects disagreement
  with either signed availability field or the reconstructed descriptor.
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
[`.tapnap` contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/transport/tapnap-v1.md).

## Report And Presentation Rules

The final result is `valid` or `invalid`. A result is valid only when the
required local scope passes and the server returns a valid App Attest result.
Warnings are an attached list, not a third final state.

A missing or mismatched Live Photo MOV limits the result to the primary-photo
scope and must never be presented as full Live Photo verification. Preview,
depth, geometry, or playback warnings do not become signature inputs and do not
upgrade a failed verification.

## Parallel Analysis Boundary

After input resolution, photo visual analysis and signature verification may run as
independent bounded paths over the same primary bytes. Photo/Live verification
and depth visualization share one auxiliary-depth readback promise: the
present/unavailable result validates signed availability, while decoded pixels,
preview rendering, point clouds, and video frames are never base-signature
inputs.

For TAP Video, bounded sample-table/KLV inspection runs after the local binding
relationship gate and before local success or server submission. Playback may
start while the server request is pending only after that semantic gate passes.
Those results remain untrusted until App Attest succeeds and cannot produce the
final authenticated result. A signature failure does not make already bounded
visualization a signature input or scene-truth claim.

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
