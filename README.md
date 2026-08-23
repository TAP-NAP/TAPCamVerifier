# TAPCamVerifier

TAPCamVerifier is a static web verifier for TAPCam signed HEIC/JPG captures,
signed TAP Video MP4 files, TAPNAP capture packages, and Live Photo primary
photos that lost their paired MOV during transport.

The page accepts a dropped image, TAP Video MP4, or `.tapnap` package and runs
the appropriate local hard-binding verifier. When the local checks pass, the
page posts the proof material to the TAP-NAP server:

```text
POST https://www.tapnap.net/tapcam/capture-signatures/verify
```

The original photo and paired MOV bytes stay in the browser. The server request
only includes `keyId`, `assertionObject`, and `signingBinding`.

The documentation-only
[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts)
repository owns the shared Still/Live/Video manifest, content-binding, proof,
container, KLV, and `.tapnap` wire conventions. This repository owns the
browser implementation, bounded-input policy, verification reports, and UI; it
implements but does not redefine those shared conventions.

This adoption was reviewed against shared revision
[`63f96b31de193c3ad456ffa500cc0db03fb97142`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/63f96b31de193c3ad456ffa500cc0db03fb97142).

## Current Status

Rust/WASM implements the shared Still/Live contract; TypeScript implements TAP
Video and package routing. Both paths reconstruct and compare the binding
required for the reported local scope before a server request. The exact
fields, hashes, resource roles, and failure order live in the shared
[binding/proof contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/bindings/capture-binding-and-proof-v1.md),
not in this README.

The page also includes a downstream visual inspection path. After selection, the
browser resolves the primary photo bytes once, then starts visual analysis and
signature verification as independent async paths. Verification results update
the result panel when local/server checks finish. For a valid signature, the UI
shows the TAPCam verification modal first, while analysis work may continue in
the background; original/depth/geometry panes are revealed after that modal
auto-dismisses or the user clicks through it. The left pane first tries the
browser's native image decoder for the original file. If that decoder cannot
render HEIC, the browser falls back to `libheif-js` WASM to decode the primary
HEIF image and sends the RGBA plane to Rust/WASM for TAP orientation handling
and preview downscaling. The right pane decodes embedded auxiliary
depth/disparity pixels in the browser: HEIC uses HEIF auxiliary items, and JPEG
uses the ImageIO/MPF embedded auxiliary disparity JPEG. The luma plane is sent
to Rust/WASM for TAP metadata interpretation, orientation, normalization, and
RGBA preview generation. A third pane uses decoded RGB plus embedded
depth/disparity pixels to build a signed depth pixel back-projection point cloud
for relative 3D inspection. These visualizations are not signature inputs and
do not change local `valid` / `invalid` semantics.

Live Photo results remain scoped: a matching package reports full Live Photo
verification, while a primary HEIC/JPG without its MOV may report only the Live
Photo primary-photo scope and must state that video bytes were not verified.
Final `valid` / `invalid`, attached warnings, and the local/server join are
defined in [Docs/VerificationFlow.md](Docs/VerificationFlow.md).

## TAPNAP Capture Package

The browser accepts the current `.tapnap` transport, resolves it with bounded
ZIP-compatible input handling, and passes byte-preserved resources to the
family verifier. Layout, identifiers, sidecar fields/roles, and rejection rules
live in the shared
[transport contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/transport/tapnap-v1.md).
The sidecar remains untrusted routing metadata and cannot determine the signed
family or verdict.

## TAP Video MP4

The raw MP4 route implements the shared
[TAP Video manifest](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/manifests/tap-video-v1.md),
[container/KLV](https://github.com/TAP-NAP/TAPArtifactContracts/blob/63f96b31de193c3ad456ffa500cc0db03fb97142/containers/tap-video-container-v1.md),
and binding/proof contracts. TAP Video is not routed through `.tapnap`.

Only after the local hard binding passes does downstream playback begin. The
standard RGB/audio tracks use the native browser player. The selected timed-
metadata track is indexed from bounded MP4 sample tables; supported raw and
zstd1 depth or disparity frames are decoded on demand and synchronized to the
player's current time. At most two decoded frames are retained. The signed RGB-
track display transform is applied to the depth canvas as well, so both panes
keep the same direction. LZFSE remains readable in the Apple app but is not
supported by this browser build.

The 3D point-cloud pane is deliberately disabled for TAP Video. This release
provides verified video playback plus synchronized 2D depth frames and does not
claim video 3D reconstruction.

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
asset base. Local development can validate the Rust/WASM hash flow, but browser
calls to the production server may fail locally if server CORS only allows the
production Pages origin.

## Deploy To GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. On every push to
`main`, GitHub Actions installs locked Node dependencies with `npm ci`, installs
the Rust WASM target, builds the WASM module, builds the static Vite site,
uploads `dist/`, and deploys it through GitHub Pages.

First-time setup:

1. Open the GitHub repository.
2. Go to `Settings` -> `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Push to `main`, or run `Deploy GitHub Pages` manually from the `Actions` tab.
5. After the workflow succeeds, open the Pages URL shown in the workflow summary.

Without a custom domain, the project page should be available at:

```text
https://tap-nap.github.io/TAPCamVerifier/
```

The production custom domain is:

```text
https://verifier.tapnap.net/
```

The server endpoint is:

```text
https://www.tapnap.net/tapcam/capture-signatures/verify
```

Because those are different origins, the server must allow the exact production
origin `https://verifier.tapnap.net` through CORS. `http://127.0.0.1:*` is not
expected to pass server verification unless it is explicitly added to the server
CORS allowlist.

## Project Map

- `src/main.ts` owns the simple drag-and-drop workflow.
- `src/input/` owns single-photo, TAP Video, and current TAPNAP package input resolution.
- `src/depth/` owns HEIF/JPEG auxiliary depth discovery and visual preview
  orchestration.
- `src/geometry/` owns signed depth pixel back-projection, decoded RGB analysis
  input, and the Three.js point-cloud viewer.
- `src/original/` owns the HEIC primary-image fallback path for browsers that
  cannot natively preview HEIC.
- `src/ui/` owns render helpers for the verification and depth panels.
- `src/wasm/tapcamVerifier.ts` loads the Rust-generated WebAssembly module.
- `src/verifier/serverVerify.ts` posts the proof material to the TAP-NAP server
  verify endpoint after local verification passes.
- `crates/tapcam-verifier-wasm/` owns proof-slot parsing, manifest parsing,
  canonical JSON hashing, asset hashing, local content-binding self-checks, and
  original/depth preview normalization for decoded image planes.
- `src/decorations/` is intentionally empty for future designer-owned UI layers.
- `Docs/VerificationFlow.md` documents Verifier-local routing, report scopes,
  presentation, and server orchestration.
- `Docs/Roadmap.md` records the depth-to-geometry roadmap.
- `Docs/Research/` records depth/geometry research reports before implementation.
- `Docs/DevLog/` records decisions and handoff context.

## Test

```sh
npm run test:rust
npm run typecheck
npm run test
```

`npm run build` also builds the WASM module before producing the static site.
