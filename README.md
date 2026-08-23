# TAPCamVerifier

TAPCamVerifier is a static web verifier for TAPCam signed HEIC/JPG captures,
signed TAP Video MP4 files, TAPNAP capture packages, legacy TAPCam Live Photo
verification ZIPs, and Live Photo primary photos that lost their paired MOV
during transport.

The browser resolves the selected artifact, performs the local byte-binding
checks required for the reported scope, and—only after that local gate
passes—submits proof material to:

```text
POST https://www.tapnap.net/tapcam/capture-signatures/verify
```

Original photo, video, and depth bytes remain in the browser. The server
receives the shared capture-signature request shape, not the media.

The documentation-only
[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts)
repository is the shared authority for current Still/Live/Video manifests,
content bindings, signing and verification relationships, containers, KLV,
proof slots, hashes, and `.tapnap` transport. This repository owns the browser
implementation, bounded-input policy, local scopes, reports, playback, and UI;
it implements but does not redefine those conventions.

This adoption was reviewed against shared revision
[`ca3b223e0717242ce1016b34dc34f04ef2417936`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/ca3b223e0717242ce1016b34dc34f04ef2417936).

## Current Status

Rust/WASM owns photo and Live Photo local verification. TypeScript owns TAP
Video verification, package routing, server orchestration, and the browser UI.
The exact required relationships live in the shared
[binding/proof contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/bindings/capture-binding-and-proof-v1.md).
Known consumer gaps remain explicit in the local
[Roadmap](Docs/Roadmap.md).

The consumer evidence baseline for extraction was Verifier revision
`20972aff2675cab4a8bb9936bd7fba9115d21951` with pre-existing tracked and
untracked work; it was evidence, not a clean release qualification. That base
still contains older photo/Live content-binding and TAP Video family identifiers
plus legacy ZIP routing. These are local compatibility facts, not a second
format authority.

After input selection, bounded visual analysis and signature verification may
run independently over the same resolved bytes. The original preview first
uses the browser decoder and falls back to `libheif-js` for HEIC. Rust/WASM
normalizes the decoded original and auxiliary depth/disparity previews. The
geometry path combines decoded RGB with depth/disparity for relative 3D
inspection. These visualizations are not signature inputs and do not alter the
final `valid` / `invalid` result.

Live Photo results are scoped. A matching package may report full Live Photo
verification. A proof-bearing HEIC/JPG without a matching MOV may report only
the Live Photo primary-photo scope and must state that motion/video bytes were
not verified. See [Verification Flow](Docs/VerificationFlow.md) for the local
pipeline, warning behavior, and server-result join.

## TAPNAP Capture Package

The browser accepts current `.tapnap` input and this revision's legacy ZIP
compatibility route. It bounds ZIP-compatible input before extraction and
passes byte-preserved resources to the family verifier. Current layout,
identifiers, unsigned sidecar roles, and rejection rules live in the shared
[transport contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/transport/tapnap-v1.md).
Routing metadata cannot determine the signed family or verdict.

The browser's local extraction budgets are 512 MiB of package bytes, 16 archive
entries, 384 MiB per media resource, 512 MiB of aggregate extracted bytes, and
256 KiB for `tapcam-export.json`. These are consumer safety limits, not wire
fields or evidence about the media.

## TAP Video MP4

Raw MP4 input uses the shared
[TAP Video manifest](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/manifests/tap-video-v1.md),
[container/KLV](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/containers/tap-video-container-v1.md),
and binding/proof contracts. TAP Video is not routed through `.tapnap`.

After the local binding gate passes, native browser playback may start while
the server result is pending. Standard RGB/audio playback is delegated to the
HTML media stack; this verifier makes no H.264 or AAC compatibility guarantee.
The producer's current codec choices therefore do not define this browser's
runtime support.

The verifier indexes the selected timed-metadata track from bounded MP4 sample
tables and reads `mebx` KLV records. It recognizes raw, zstd1, and LZFSE record
labels, but this browser build decodes only raw and zstd1 and rejects LZFSE.
Additional local limits are 512 MiB per MP4, 4,096 boxes in one parsed box list,
10,800 depth samples, 16,777,216 pixels per rendered depth frame, and two cached
decoded frames. It aligns decoded frames to player time and applies the signed
RGB display transform to the depth canvas. Playback and depth inspection remain
untrusted until the server gate also passes.

The 3D point-cloud pane is deliberately disabled for TAP Video. This release
provides video playback with synchronized 2D depth frames and does not claim
video 3D reconstruction.

## Run

```sh
npm install
rustup target add wasm32-unknown-unknown
npm run dev
```

Build the static site:

```sh
npm run build
```

The build output is `dist/`, suitable for GitHub Pages. Vite uses a relative
asset base. Local development can validate the Rust/WASM flow, but calls to the
production server may fail when CORS does not allow the local origin.

## Deploy To GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. On every push to
`main`, GitHub Actions installs locked Node dependencies with `npm ci`, installs
the Rust WASM target, builds the WASM module and static site, uploads `dist/`,
and deploys it through GitHub Pages.

First-time setup:

1. Open the GitHub repository.
2. Go to `Settings` -> `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Push to `main`, or run `Deploy GitHub Pages` manually from `Actions`.
5. Open the Pages URL shown in the successful workflow summary.

The production custom domain is `https://verifier.tapnap.net/`. The server must
allow the exact origin `https://verifier.tapnap.net` through CORS. Local
`http://127.0.0.1:*` origins are not expected to pass server verification unless
explicitly allowed.

## Project Map

- `src/main.ts` owns drag-and-drop orchestration and final state joining.
- `src/input/` owns photo, package, legacy ZIP, and TAP Video input resolution.
- `src/depth/` owns HEIF/JPEG auxiliary-depth discovery and preview work.
- `src/geometry/` owns relative point-cloud inspection.
- `src/original/` owns the HEIC browser-decoder fallback.
- `src/ui/` owns verification and analysis rendering.
- `src/video/` owns TAP Video parsing, local verification, and playback.
- `src/wasm/tapcamVerifier.ts` loads the Rust-generated WebAssembly module.
- `src/verifier/serverVerify.ts` calls the server after local success.
- `crates/tapcam-verifier-wasm/` owns photo/Live parsing, local binding checks,
  and preview normalization for already-decoded planes.
- [Docs/VerificationFlow.md](Docs/VerificationFlow.md) owns Verifier-local
  routing, scopes, presentation, and server orchestration.
- [Docs/Roadmap.md](Docs/Roadmap.md) owns the active depth-to-geometry roadmap.
- [Docs/LandingDesignPrompt.zh-CN.md](Docs/LandingDesignPrompt.zh-CN.md) owns the
  retained landing visual direction and public-claim language boundaries.
- [Docs/Research/](Docs/Research/) owns active depth/geometry research reports.

## Local Fixtures

Ignored real-device files under `test/` remain local implementation fixtures.
They exercise container decoding, primary-only Live Photo scope, and legacy
package compatibility without becoming shared public examples. Shared synthetic
examples and exact cross-repository vectors live in
[TAPArtifactContracts examples](https://github.com/TAP-NAP/TAPArtifactContracts/tree/ca3b223e0717242ce1016b34dc34f04ef2417936/examples).

## Test

```sh
npm run test:rust
npm run typecheck
npm run test
```

`npm run build` also builds the WASM module before producing the static site.
