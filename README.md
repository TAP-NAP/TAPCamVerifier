# TAPCamVerifier

## Purpose

TAPCamVerifier is a static website for verifying TAPCam signed HEIC/JPG photos,
TAP Video MP4 files, and `.tapnap` capture packages. It can also verify the
primary-photo scope of a Live Photo whose paired MOV is unavailable.

The browser checks the received artifact, requests App Attest verification from
the server, and presents the combined result. The original media stays in the
browser. Photo depth and relative 3D views, and synchronized TAP Video depth
playback, help inspect the artifact.

## Usage and build

Open the [verifier](https://www.tapnap.net/verify/) and select or drop a supported
file. MOV-only input is unsupported because it lacks the primary artifact's
manifest, proof slot, and assertion material.

For local development:

```sh
nvm use
rustup show
npm ci
npm run dev
```

The repository pins Node `22.23.2` in `.nvmrc` and Rust `1.98.0` with the
`wasm32-unknown-unknown` target in `rust-toolchain.toml`. `npm run dev` builds
WASM and starts Vite on `127.0.0.1`; open its `/verify/` page.

```sh
npm test
npm run typecheck
npm run build
```

`npm test` runs Rust and Vitest. `npm run build` rebuilds WASM, type-checks
TypeScript, and produces `dist/` with relative asset URLs. `npm run preview`
serves the built site locally.

Real-device captures are ignored by Git. Optional `test/tap-depth-photo.HEIC`
and `test/tap-depth-photo.JPG` fixtures exercise physical-device decoding;
their tests skip when the files are absent. A skip provides no current device,
schema, backend, or acceptance evidence.

`src/video/tapVideo.test.ts` mirrors the reviewed contract's
[exact vectors](https://github.com/TAP-NAP/TAPArtifactContracts/tree/16242f01674d5c8b771b93e2cb46bc42a039d174/examples/vectors).
It also checks the bytes in `src/video/fixtures/tap-video-extensions-v1.json`
through the artifact verifier. Extension content acceptance is a consumer concern,
separate from whether those bytes match the signature binding. When updating the contract pin, compare the literals and
compare that JSON byte-for-byte with the
[shared extension vector](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/examples/vectors/tap-video-extensions-v1.json).
These executable mirrors take their expected bytes from the contract.

### Deployment

Set the repository's GitHub Pages source to `GitHub Actions`.
[The deployment workflow](.github/workflows/deploy-pages.yml) runs the Rust and
Vitest suites, builds WASM and Vite, and deploys `dist/` on pushes to `main` or
manual dispatch.

After the build, tests, and artifact upload pass, the independent `publish-ecs`
job publishes the same files to `ecs-web`. Only this job has repository write
permission. It skips publication if `main` has advanced; a pending or failed
Pages deployment does not block it.

On ECS, `tap update web` downloads the public `ecs-web` branch with Git and
switches the website served by Nginx. ECS requires no frontend compiler,
GitHub token, Actions run ID, or SSH access from GitHub. The branch contains
generated files; make source changes on `main`. `.tap-source` records the
source commit, and the branch commit identifies the published files. Follow the
[server deployment instructions](https://github.com/TAP-NAP/server/tree/main/deploy)
for installation and updates. The first update requires a successful
`publish-ecs` run to create the branch.

JavaScript, CSS, and WASM use content-hashed filenames. The compatibility copy
at `/wasm/tapcam_verifier_wasm.wasm` supports previously loaded Pages tabs;
new pages reference the hashed WASM asset.

- ECS production: <https://www.tapnap.net/>; redirect `tapnap.net` here.
- Overseas and testing: <https://verifier.tapnap.net/>
- Default project page: <https://tap-nap.github.io/TAPCamVerifier/>
- Verification endpoint: <https://www.tapnap.net/tapcam/capture-signatures/verify>

The server must allow the exact overseas origin `https://verifier.tapnap.net`.
Local `http://127.0.0.1:*` origins are expected to fail server verification
unless explicitly added to its CORS allowlist.

<a name="verification-flow"></a>

## Principles

The normative artifact formats, verification rules, API behavior, and public
claim boundaries belong to
[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts).
This repository owns their browser implementation, local input and
compatibility policies, reports, visualization, tests, and site deployment.

```text
bounded input/package resolution
  -> photo/Live: Rust/WASM byte-binding verification
     TAP Video: TypeScript byte-binding verification
  -> exact covered-byte hashes and signing-binding reconstruction
  -> server App Attest verification after local binding passes
  -> local scope + server result -> valid / invalid
```

The [binding and verification contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/bindings/capture-binding-and-proof-v1.md#local-reconstruction-and-cryptographic-verification)
defines the two required gates and Live Photo scopes. The
[backend API contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/BackendContract.md#tapcam-capture-signature-verification)
defines the request and response: only `keyId`, `assertionObject`, and
`signingBinding` leave the browser. The final result is valid only when both
the required local scope and the server verification pass. A local failure
suppresses that request; network/CORS failure is reported separately from local
binding failure.
Warnings are details on a `valid` or `invalid` result, not a third final state.
Public authenticity claims follow the
[product claim boundaries](https://github.com/TAP-NAP/TAPArtifactContracts/blob/main/ProductContract.md#7-claim-boundaries).

### Local consumer policy

Package resolution follows the
[transport contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/transport/tapnap-v1.md).
Raw MP4 and the MP4 resolved from `.tapnap` use the same verifier. The local
implementation adds these compatibility allowances and resource budgets:

- The Rust reader accepts padded base64url and ignores non-zero
  producer-reserved proof-header bytes without assigning them meaning. Shared
  v1 still requires producers to emit unpadded base64url and zero reserved bytes.
- Every input is limited to 512 MiB by `File.size` before reading and by actual
  byte length afterward. Packages also limit each media entry, including MP4,
  to 384 MiB and apply separate archive expansion limits. Raw MP4 retains the
  512 MiB limit. Browser safety budgets and codec support do not grant producer
  permissions or verification guarantees.

### Visualization

Photo analysis can run alongside verification over the same resolved bytes.
The browser uses native image decoding when possible and `libheif-js` with
Rust/WASM as the HEIC fallback. Embedded auxiliary depth is displayed separately
and can form an interactive relative 3D point cloud. Preview pixels, point
clouds, and playback frames are not signature inputs and cannot upgrade a
failed result or prove physical scene or depth correctness. For valid results,
the result modal appears before visualization panes are revealed.

TAP Video playback starts after local byte binding passes. Native
playback renders RGB/audio. The depth player reads bounded MP4/KLV data,
decodes raw, LZFSE, or zstd1 samples on demand, and applies the recorded RGB
display transform. It selects the nearest timestamp without assuming sample
order and caches each sample independently. Unusable depth affects the depth
view. Telemetry is not consumed by playback; video 3D is disabled.

## Directory structure

| Path | Responsibility |
| --- | --- |
| `index.html`, `verify/`, `privacy/` | Landing, verifier, and privacy page entry points. |
| `src/` | Page orchestration, shared presentation, styles, and colocated tests; `main.ts` coordinates verification and final UI state. |
| `src/input/` | Raw photo/video and `.tapnap` input resolution and size limits. |
| `src/depth/`, `src/original/` | Auxiliary-depth discovery and HEIC primary-image fallback. |
| `src/geometry/` | Relative point projection, filtering, and Three.js viewer. |
| `src/video/` | TAP Video verification, contract-vector fixtures, and synchronized depth playback. |
| `src/verifier/` | HTTP verification requests and server-boundary diagnostics. |
| `src/wasm/` | WASM loading and photo/Live verification interface. |
| `src/ui/`, `src/i18n/` | Verification and visualization rendering, shared controls, and translations. |
| `src/landing/`, `src/assets/` | Landing-page interactions and bundled visual assets. |
| `crates/tapcam-verifier-wasm/` | Rust photo/Live parsing, binding reconstruction, media helpers, and fixture CLI. |
| `scripts/` | WASM build and asset-copy script. |
| `public/` | Static assets, domain configuration, and generated compatibility WASM. |
| `.github/workflows/` | Tests, static build, GitHub Pages deployment, and `ecs-web` publication. |

## Repository dependencies

| Repository | Relationship |
| --- | --- |
| [TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts) | Normative center for artifact formats, binding and verification rules, backend API behavior, and product claims. This implementation was reviewed against [`16242f01674d5c8b771b93e2cb46bc42a039d174`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/16242f01674d5c8b771b93e2cb46bc42a039d174); local compatibility allowances are listed above. |
| [TAPCamDemo](https://github.com/TAP-NAP/TAPCamDemo) | Native producer of signed artifacts consumed here; interoperability follows the shared contract. |
| [server](https://github.com/TAP-NAP/server) | Runtime implementation of the App Attest HTTP endpoint and ECS/Nginx installation and update tooling. Protocol requirements remain in TAPArtifactContracts. |

No sibling repository is required to build this site. JavaScript and Rust
dependencies are declared in `package.json` and
`crates/tapcam-verifier-wasm/Cargo.toml`, with checked-in lockfiles. Final App
Attest verification requires the server to be reachable and allow the page's
origin.
