# TAPCamVerifier

TAPCamVerifier is a static web verifier for TAPCam signed HEIC/JPG captures,
signed TAP Video MP4 files, TAPNAP capture packages, and Live Photo primary
photos that lost their paired MOV during transport.

This repository owns the browser implementation, bounded-input policy,
verification reports, visualization, user-facing copy, tests, and deployment.
The documentation-only
[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts)
repository owns the shared Still/Live/Video manifest, content-binding, proof,
container, KLV, and `.tapnap` wire conventions. This implementation was reviewed
against shared revision
[`ca3b223e0717242ce1016b34dc34f04ef2417936`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/ca3b223e0717242ce1016b34dc34f04ef2417936).

## Verification Flow

```text
HEIC/JPG, TAP Video MP4, or current .tapnap
  -> bounded input/package resolution
  -> photo/Live only: one auxiliary-depth presence probe
  -> Rust/WASM photo/Live verifier or TypeScript TAP Video verifier
  -> local artifact-binding and applicable MP4/KLV semantic gates
  -> if every local gate passed: server App Attest request
  -> local scope + server result -> final valid / invalid
```

The original media remains in the browser. The server request contains only
`keyId`, `assertionObject`, and `signingBinding`. A final result is `valid`
only when the required local scope passes and the server returns a valid App
Attest result; warnings are attached details, not a third final state. A local
failure suppresses the server request. A network or CORS failure is reported
separately from a local binding failure.

A complete Live Photo package may report full Live Photo verification. A
proof-bearing Live Photo primary without its MOV may report only the primary
photo scope and must state that the video bytes were not checked. MOV-only input
is unsupported because it lacks the primary artifact's embedded manifest, proof
slot, and assertion material.

Photo analysis may run alongside verification over the same resolved bytes, but
preview pixels, point clouds, and playback frames are not signature inputs and
cannot upgrade a failed result. For a valid signature, the result modal is shown
before the visualization panes are revealed.

The required verification relationships live in the shared
[binding/proof contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/bindings/capture-binding-and-proof-v1.md).
Rust/WASM owns HEIC/JPEG proof-slot/XMP parsing and Still/Live reconstruction.
TypeScript owns `.tapnap` resolution, TAP Video verification, and server
orchestration.

### Local Consumer Policy

- `.tapnap` layout, sidecar roles, and rejection rules live in the shared
  [transport contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/transport/tapnap-v1.md).
  The sidecar is untrusted routing metadata and cannot determine the signed
  family or verdict.
- Raw TAP Video MP4 consumes the shared
  [manifest](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/manifests/tap-video-v1.md)
  and [container/KLV](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/containers/tap-video-container-v1.md)
  contracts; TAP Video is not routed through `.tapnap`.
- The Rust reader accepts padded base64url and ignores non-zero
  producer-reserved proof-header bytes without assigning them meaning. Shared v1
  still requires producers to emit unpadded base64url and zero reserved bytes.
- Package/MP4 safety budgets and native-media codec support are browser-local
  policy, not producer permissions or verification guarantees.

## Visualization

For photos, the browser uses its native image decoder when possible and falls
back to `libheif-js` plus Rust/WASM for HEIC. Embedded HEIF/JPEG auxiliary
depth is displayed separately and can be projected into an interactive relative
3D point cloud. This is an inspection view, not proof that the physical scene or
depth is correct.

For TAP Video, playback starts only after the local binding and semantic gates
pass. The native player renders RGB/audio while bounded raw, LZFSE, or zstd1
depth frames are decoded on demand and synchronized to the signed RGB display
transform. Video 3D remains disabled.

## Run

```sh
nvm use
rustup show
npm ci
npm run dev
```

The repository pins Node `22.23.2` in `.nvmrc` and Rust `1.98.0` plus the
`wasm32-unknown-unknown` target in `rust-toolchain.toml`.

Build the static site:

```sh
npm run build
```

The output is `dist/`, suitable for GitHub Pages with Vite's relative asset
base.

## Deploy To GitHub Pages

`.github/workflows/deploy-pages.yml` runs the Rust and Vitest suites, builds
the WASM module and Vite site, and deploys `dist/` on pushes to `main` or a
manual workflow dispatch. Configure the repository's Pages source as
`GitHub Actions`.

- Production page: <https://verifier.tapnap.net/>
- Default project page: <https://tap-nap.github.io/TAPCamVerifier/>
- Server endpoint:
  <https://www.tapnap.net/tapcam/capture-signatures/verify>

The server must allow the exact production origin
`https://verifier.tapnap.net`. Local `http://127.0.0.1:*` origins are expected
to fail server verification unless explicitly added to its CORS allowlist.

## Project Map

- `src/main.ts`: drag/drop orchestration and final UI state.
- `src/input/`: single-photo, TAP Video, and TAPNAP input resolution.
- `src/depth/`: HEIF/JPEG auxiliary-depth discovery.
- `src/geometry/`: relative point projection and Three.js viewer.
- `src/original/`: HEIC primary-image browser fallback.
- `src/ui/`: verification and visualization rendering.
- `src/video/`: TAP Video verification and synchronized depth playback.
- `src/verifier/`: server request and boundary diagnostics.
- `src/wasm/` and `crates/tapcam-verifier-wasm/`: WebAssembly loading and
  photo/Live local verification.

## Test

```sh
npm test
npm run typecheck
npm run build
```

`npm test` runs Rust and Vitest. `npm run build` rebuilds WASM, type-checks
TypeScript, and produces the static site.

Real device captures are intentionally ignored. Optional
`test/tap-depth-photo.HEIC` and `test/tap-depth-photo.JPG` files exercise
physical-device HEIC/JPEG decoding; their tests skip when the files are absent.
A skip is not current schema, device, backend, or acceptance evidence.

`src/video/tapVideo.test.ts` keeps literal hermetic mirrors of the shared
[exact vectors](https://github.com/TAP-NAP/TAPArtifactContracts/tree/ca3b223e0717242ce1016b34dc34f04ef2417936/examples/vectors).
When the reviewed contract revision changes, compare those literals with the
shared vectors; the local copies are executable mirrors, not a second authority.
