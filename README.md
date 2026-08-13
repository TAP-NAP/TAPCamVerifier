# TAPCamVerifier

TAPCamVerifier is a static web verifier for TAPCam signed HEIC/JPG captures,
signed TAP Video MP4 files, TAPNAP capture packages, legacy TAPCam Live Photo
verification ZIPs, and Live Photo primary photos that lost their paired MOV
during transport.

The page accepts a dropped image, TAP Video MP4, `.tapnap` package, or legacy
Live Photo ZIP and runs the appropriate local hard-binding verifier. When the
local checks pass, the page posts the proof material to the TAP-NAP server:

```text
POST https://www.tapnap.net/tapcam/capture-signatures/verify
```

The original photo and paired MOV bytes stay in the browser. The server request
only includes `keyId`, `assertionObject`, and `signingBinding`.

## Current Status

This slice follows TAPCamDemo `origin/refacteor_under_review` still-photo
`content-binding:v2` and Live Photo `content-binding:v3`. The verifier does not
decode RGB pixels, video frames, or Apple auxiliary depth into DepthFloat32 for
the base signature. Rust/WASM verifies:

- exactly one fixed TAP proof slot;
- proof slot magic, version, envelope length, and zero padding;
- XMP `tapdepth:Manifest` with empty `manifest.proofs`;
- Release capture profile policy for HEIC/JPG;
- `assetHash` over native HEIC/JPG bytes excluding the proof slot container
  range;
- `metadataHash` over the exact `manifest.payload` JSON bytes embedded in XMP,
  after XML entity decoding and without parsing or reserializing the payload;
- Live Photo `signedResources` for primary photo, manifest payload, and paired
  MOV descriptors;
- complete `paired-video.mov` bytes when a capture package supplies it, or a
  scoped primary-photo result when only the proof-bearing HEIC/JPG is supplied;
- reconstructed `CaptureContentBinding` equality;
- `signingBinding.bodySHA256` and full signing binding equality.

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

Strict means the verifier never treats a Live Photo as an ordinary still photo.
Any mismatch in the proof slot, manifest, primary asset hash, metadata hash,
signed resource descriptors, or signing binding is `invalid`. Live Photo results
are scoped: a matching package reports full Live Photo verification, while a
primary HEIC/JPG without `paired-video.mov` may still verify as a Live Photo
primary photo and continue to server App Attest verification. The UI must state
that the paired MOV/video bytes were not verified.

## TAPNAP Capture Package

`.tapnap` is the preferred byte-preserving transport wrapper for a TAPNAP
capture. It is a ZIP-compatible container, not a new signature format:

```text
TAPNAP-Capture.tapnap
├── primary-photo.heic or primary-photo.jpg
├── paired-video.mov              # Live Photo only
└── tapcam-export.json
```

The registered identifiers are UTI `net.tapnap.capture-package` and MIME
`application/vnd.tapnap.capture-package+zip`. The optional
`tapcam-export.json` uses
`urn:tapnap:tapcam:verification-export:v1` and only indexes resource roles. It
may label `packageKind` as `stillPhoto` or `livePhotoPackage`, but it is not
signed or trusted: the browser derives the real media/signature scope from the
proof-bearing primary photo, and falls back to the fixed filenames when the
sidecar is absent or invalid. A still-photo package is valid input without
`paired-video.mov`. Existing `.zip` packages remain supported.

## TAP Video MP4

TAP Video is one signed `video/mp4` file, not a `.tapnap` wrapper. The browser
reads its v2 manifest UUID box and fixed proof-slot UUID box, recomputes the v4
SHA-256 content binding over every MP4 byte except that proof slot, and derives
the existing App Attest server request from the verified proof envelope.

Only after the local hard binding passes does downstream playback begin. The
standard RGB/audio tracks use the native browser player. The TAP private
`mdta/com.tapnap.depth.klv` track is indexed from the MP4 sample tables; raw and
zstd1 Float16/Float32 depth or disparity frames are decoded on demand and
synchronized to the player's current time. At most two decoded frames are
retained. The signed RGB-track rotation and optional front-camera mirroring are
applied to the depth canvas as well, so both panes keep the same display
direction. LZFSE remains readable in the Apple app but is not supported by
this browser build.

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
- `src/input/` owns single-photo vs TAPNAP/legacy ZIP package input resolution.
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
- `Docs/VerificationFlow.md` documents the hard-binding hash flow.
- `Docs/AITrace/` records protocol decisions and implementation handoff notes.
- `Docs/Roadmap.md` records the depth-to-geometry roadmap.
- `Docs/Research/` records depth/geometry research reports before implementation.
- `Docs/Scorecard.md` tracks engineering health.
- `Docs/DevLog/` records decisions and handoff context.

## Local Fixture

`test/tap-depth-photo.HEIC` and `test/tap-depth-photo.JPG` are local real-device
fixtures generated by the TAPCamDemo still-photo content-binding v2 flow.
`test/tap-livephoto-airdrop-raw.HEIC` is a Live Photo primary photo without the
paired MOV; it should verify in the `primaryPhotoFromLivePhoto` scope and warn
that video bytes were not checked. `test/tapcam-live-photo-verification 2.zip`
is the legacy full Live Photo verification package; an equivalent
`TAPNAP-Capture.tapnap` uses the same byte-preserving entries. The repository
ignores photo files under `test/` by default so real captures are not committed
by accident.

## Test

```sh
npm run test:rust
npm run typecheck
npm run test
```

`npm run build` also builds the WASM module before producing the static site.
