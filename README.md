# TAPCamVerifier

TAPCamVerifier is a static web verifier for TAPCam signed HEIC/JPG captures.

The page accepts a dropped image and runs the local Rust/WASM verifier. When the
local hard-binding checks pass, the page posts the proof material to the TAP-NAP
server:

```text
POST https://www.tapnap.net/tapcam/capture-signatures/verify
```

The original HEIC file stays in the browser. The server request only includes
`keyId`, `assertionObject`, and `signingBinding`.

## Current Status

This slice follows TAPCamDemo `origin/refacteor_under_review` content-binding
v2. The verifier does not decode RGB pixels or convert Apple auxiliary depth to
DepthFloat32 for the base signature. Rust/WASM verifies:

- exactly one fixed TAP proof slot;
- proof slot magic, version, envelope length, and zero padding;
- XMP `tapdepth:Manifest` with empty `manifest.proofs`;
- Release capture profile policy for HEIC/JPG;
- `assetHash` over native HEIC/JPG bytes excluding the proof slot container
  range;
- `metadataHash` over canonical `manifest.payload` JSON;
- reconstructed `CaptureContentBinding` equality;
- `signingBinding.bodySHA256` and full signing binding equality.

The page also includes a downstream visual inspection path. After selection, the
left pane first tries the browser's native image decoder for the original file.
If that decoder cannot render HEIC, the browser falls back to `libheif-js` WASM
to decode the primary HEIF image and sends the RGBA plane to Rust/WASM for TAP
orientation handling and preview downscaling. The right pane decodes the
embedded HEIF auxiliary depth/disparity plane in the browser and sends that luma
plane to Rust/WASM for TAP metadata interpretation, orientation, normalization,
and RGBA preview generation. A third pane uses decoded RGB plus embedded
depth/disparity pixels to build a signed depth pixel back-projection point cloud
for relative 3D inspection. These visualizations are not signature inputs and do
not change local `valid` / `invalid` semantics.

Strict means there is no tolerant fallback. Any mismatch in the proof slot,
manifest, asset hash, metadata hash, content binding, or signing binding is
`invalid`.

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
- `src/depth/` owns HEIF auxiliary depth discovery and visual preview
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
- `Docs/VerificationFlow.md` documents the hard-binding hash flow.
- `Docs/Roadmap.md` records the depth-to-geometry roadmap.
- `Docs/Scorecard.md` tracks engineering health.
- `Docs/DevLog/` records decisions and handoff context.

## Local Fixture

`test/tap-depth-photo.HEIC` is the current local real-device fixture generated by
the TAPCamDemo content-binding v2 flow. The repository ignores HEIC files under
`test/` by default so real captures are not committed by accident.

## Test

```sh
npm run test:rust
npm run typecheck
npm run test
```

`npm run build` also builds the WASM module before producing the static site.
