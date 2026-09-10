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
[`77f774005332085fa0ddd324ac9261e67caae2c5`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/77f774005332085fa0ddd324ac9261e67caae2c5).

The adopted optional `TAPCAMTELEMETRY1` UUID records filtering observations and
bounded device motion under the existing asset hash. After binding succeeds,
the reader validates its schema, counts, coordinates, timestamps and size
limits before requesting server verification. Files without telemetry retain
unknown provenance; motion samples describe device motion, not full camera pose.

The optional `CALD` KLV record preserves a frame's calibration when no `CALI`
index is available. The reader validates its canonical JSON, calibration fields,
3,072-byte limit and mutual exclusion with `CALI`, preserving existing coverage
counts and signed bytes. Both extensions keep their existing v1 identifiers.

Public claims follow the [product contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/main/ProductContract.md#7-claim-boundaries).

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
[binding/proof contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/77f774005332085fa0ddd324ac9261e67caae2c5/bindings/capture-binding-and-proof-v1.md).
Rust/WASM owns HEIC/JPEG proof-slot/XMP parsing and Still/Live reconstruction.
TypeScript owns `.tapnap` resolution, TAP Video verification, and server
orchestration.

### Local Consumer Policy

- `.tapnap` layout, sidecar roles, and rejection rules live in the shared
  [transport contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/77f774005332085fa0ddd324ac9261e67caae2c5/transport/tapnap-v1.md).
  The sidecar is untrusted routing metadata and cannot determine the signed
  family or verdict.
- Raw TAP Video MP4 consumes the shared
  [manifest](https://github.com/TAP-NAP/TAPArtifactContracts/blob/77f774005332085fa0ddd324ac9261e67caae2c5/manifests/tap-video-v1.md)
  and [container/KLV](https://github.com/TAP-NAP/TAPArtifactContracts/blob/77f774005332085fa0ddd324ac9261e67caae2c5/containers/tap-video-container-v1.md)
  contracts. A current `tapVideo` package resolves exactly one `primaryVideo`
  MP4 and then uses this same local verifier and server boundary. Its sidecar
  does not provide proof, hash, depth, or verification results. The pre-release
  transport definition retains its v1 identifier; older photo-only revisions
  did not accept this video package.
- Native AAC exports name the codec using CoreMedia (`aac `), while the v1
  manifest table names the MP4 sample entry (`mp4a`). The reader accepts both
  spellings only after the `esds` configuration confirms AAC-LC, and obtains
  sample rate and channel count from that configuration. Other audio object
  types and ambiguous descriptors are rejected.
- Track durations and depth presentation timestamps account for a rate-one
  MP4 media segment, optionally preceded by one empty edit (`elst` v0/v1).
  The empty edit records a track starting after the movie origin; its duration
  is included in the signed presentation duration and depth timestamp mapping,
  but not in the media bytes available to the following segment. Raw sample
  durations still match `mdhd`.
  Native KLV timestamps use a coarser serialized time base than MP4 media ticks.
  The reader compares edited timestamps within one encoded KLV tick, matching
  native export quantization. This compatibility allowance differs from the
  pinned container text's finer-tick rule. Empty-only tracks, trailing or
  repeated empty edits, multiple media segments and non-unit playback rates
  are rejected.
- The Rust reader accepts padded base64url and ignores non-zero
  producer-reserved proof-header bytes without assigning them meaning. Shared v1
  still requires producers to emit unpadded base64url and zero reserved bytes.
- Every file is limited to 512 MiB using `File.size` before reading its bytes;
  the parser checks the actual byte length too. Archive expansion and individual
  resource limits apply separately: package media entries, including MP4, are
  limited to 384 MiB; raw MP4 keeps the 512 MiB input limit.
- Input safety budgets and native-media codec support are browser-local
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

After the `build` job passes its tests, build, and artifact upload, a separate
`publish-ecs` job publishes those same static files to the `ecs-web` branch.
Only this job has repository write permission. It skips publication if `main`
has advanced, so rerunning an older workflow cannot replace a newer website.
A pending or failed Pages deployment does not block this publication.

On ECS, `tap update web` downloads the public `ecs-web` branch with Git and
switches the website served by Nginx. ECS needs no frontend compiler, GitHub
token, Actions run ID, or SSH access from GitHub. The branch contains generated
files only; change source on `main` instead of editing it directly. The
`.tap-source` file records the original source commit, and the branch's own Git
commit identifies the published files. See the
[server deployment instructions](https://github.com/TAP-NAP/server/tree/main/deploy)
for installation and updates. The first ECS update requires a successful run
of the new `publish-ecs` job to create the branch.

JavaScript, CSS, and the verifier WASM are published with content-hashed asset
filenames. A compatibility copy at
`/wasm/tapcam_verifier_wasm.wasm` remains for previously loaded Pages tabs;
new pages reference only the hashed WASM asset.

- ECS production target: <https://www.tapnap.net/>; configure `tapnap.net` to redirect here.
- Overseas and testing page: <https://verifier.tapnap.net/>
- Default project page: <https://tap-nap.github.io/TAPCamVerifier/>
- Server endpoint:
  <https://www.tapnap.net/tapcam/capture-signatures/verify>

The server must allow the exact overseas origin
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
[exact vectors](https://github.com/TAP-NAP/TAPArtifactContracts/tree/77f774005332085fa0ddd324ac9261e67caae2c5/examples/vectors).
When the reviewed contract revision changes, compare those literals with the
shared vectors; the local copies are executable mirrors, not a second authority.

The exact extension vectors are mirrored in
`src/video/fixtures/tap-video-extensions-v1.json`; `tapVideo.test.ts` exercises
them through the artifact verifier. Compare this mirror byte-for-byte with
[`examples/vectors/tap-video-extensions-v1.json`](https://github.com/TAP-NAP/TAPArtifactContracts/blob/77f774005332085fa0ddd324ac9261e67caae2c5/examples/vectors/tap-video-extensions-v1.json)
when updating the contract pin. Expected bytes come from the contract, not the
implementation under test.
