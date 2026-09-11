# TAPCamVerifier

English | [简体中文](README.zh-CN.md)

## Purpose

TAPCamVerifier is a static website for verifying signed TAPCam HEIC/JPG photos,
TAP Video MP4 files, and `.tapnap` capture packages. It supports Live Photo
verification, including the primary-photo scope when the paired MOV is unavailable.

The browser checks artifact integrity and asks the server to verify the App Attest
assertion. Original media stays in the browser. Photo depth, relative 3D views,
and synchronized video depth playback provide separate inspection tools.

## Usage

Open the [verifier](https://www.tapnap.net/verify/) and select or drop a supported
file. A standalone MOV lacks the primary artifact's manifest and proof and cannot
be verified on its own.

### Local development

With `nvm` and `rustup` installed, run:

```sh
nvm use
rustup show
npm ci
npm run dev
```

[.nvmrc](.nvmrc) pins Node `22.23.2`;
[rust-toolchain.toml](rust-toolchain.toml) pins Rust `1.98.0` and the
`wasm32-unknown-unknown` target. The development command builds WASM and starts
Vite on `127.0.0.1`; open `/verify/` at the address printed by Vite.

### Checks and production build

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

These [package scripts](package.json) run Rust tests and Vitest, check TypeScript,
build WASM and the static site into `dist/`, then serve that build locally.
`npm run build` also includes the TypeScript check.

Optional device fixtures at `test/tap-depth-photo.HEIC` and
`test/tap-depth-photo.JPG` are ignored by Git; their decoding tests skip when the
files are absent. These skips do not establish device compatibility.
When changing the contract revision, check the mirrored vectors in
[src/video/tapVideo.test.ts](src/video/tapVideo.test.ts) and
[src/video/fixtures/](src/video/fixtures/) against the
[pinned contract vectors](https://github.com/TAP-NAP/TAPArtifactContracts/tree/16242f01674d5c8b771b93e2cb46bc42a039d174/examples/vectors).

### Deployment

Set the repository's GitHub Pages source to **GitHub Actions**.
The [workflow](.github/workflows/deploy-pages.yml) tests and builds on pushes to
`main` or manual dispatch. It deploys `dist/` to Pages and independently publishes
the same artifact to the `ecs-web` branch; publication is skipped if `main` has
advanced. Make source changes on `main`, not in the generated branch.

The [server deployment tools](https://github.com/TAP-NAP/server/tree/main/deploy)
provide `tap update web` to install that branch on ECS without compiling the
frontend there. `.tap-source` in the artifact records its source commit.
The verification endpoint is configured in
[src/verifier/serverVerify.ts](src/verifier/serverVerify.ts); the server must
be reachable and allow the page's origin, including any local development origin.

<a name="verification-flow"></a>

## Principles

1. Resolve the input and enforce file/package resource limits.
2. Use Rust/WASM for photo and Live Photo binding, or TypeScript for TAP Video,
   to hash the covered original bytes and raw manifest payload and reconstruct
   the signing binding.
3. After local binding passes, send only `keyId`, `assertionObject`, and
   `signingBinding` to the server for App Attest verification.
4. Report the verified resource scope and server result; a final valid result
   requires both checks. Network failures remain distinct from binding failures.

The [binding contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/bindings/capture-binding-and-proof-v1.md#local-reconstruction-and-cryptographic-verification)
defines byte coverage and Live Photo scopes; the
[backend contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/BackendContract.md#tapcam-capture-signature-verification)
defines the HTTP exchange. Media decoding, timestamps, depth quality, calibration
usefulness, and visualization do not determine signature validity. An unusable
depth sample affects its view. Verification does not establish scene truth,
author identity, time, location, or non-AI origin; see the
[claim boundaries](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/ProductContract.md#7-claim-boundaries).

Local input policy limits each file to 512 MiB and each packaged media entry to
384 MiB, with additional archive expansion limits. Raw and packaged MP4 use the
same verifier. The Rust reader accepts padded base64url and ignores non-zero
reserved proof-header bytes; producers must still emit unpadded base64url and
zero reserved bytes under the pinned contract. See the
[package contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/transport/tapnap-v1.md)
for the shared transport format.

## Directory structure

| Path | Responsibility |
| --- | --- |
| `index.html` | Landing-page entry point. |
| `verify/` | Verification-page entry point. |
| `privacy/` | Privacy-page entry point. |
| `src/` | Page orchestration, shared presentation, styles, and colocated tests. |
| `src/input/` | Photo, video, and package resolution with input resource limits. |
| `src/original/` | Original-image display and HEIC primary-image decoding fallback. |
| `src/depth/` | Auxiliary-depth discovery and decoding. |
| `src/geometry/` | Relative point projection, filtering, and the Three.js viewer. |
| `src/video/` | TAP Video byte verification, contract vectors, and depth playback. |
| `src/verifier/` | HTTP verification requests and server-boundary diagnostics. |
| `src/wasm/` | WASM loading and the photo/Live verification interface. |
| `src/ui/` | Verification and visualization rendering and shared controls. |
| `src/i18n/` | Translations and language preferences. |
| `src/landing/` | Landing-page interactions. |
| `src/assets/` | Bundled visual assets. |
| `crates/tapcam-verifier-wasm/` | Rust photo/Live byte verification, media helpers, and fixture CLI. |
| `scripts/` | WASM build and asset-copy script. |
| `public/` | Static assets, domain configuration, and the generated compatibility WASM copy. |
| `.github/workflows/` | Tests, static build, Pages deployment, and `ecs-web` publication. |

## Repository dependencies

[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts) is the sole
normative source for artifact formats, binding rules, backend API behavior, and
product claims. This implementation is reviewed against
[`16242f01674d5c8b771b93e2cb46bc42a039d174`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/16242f01674d5c8b771b93e2cb46bc42a039d174),
with the local reader allowances described above.

[TAPCamDemo](https://github.com/TAP-NAP/TAPCamDemo) produces compatible artifacts.
[server](https://github.com/TAP-NAP/server) implements the App Attest HTTP service
used at runtime and provides ECS deployment tooling. Neither is a specification
source or a required checkout for building this site.

Build dependencies are declared in [package.json](package.json) and
[Cargo.toml](crates/tapcam-verifier-wasm/Cargo.toml), with checked-in lockfiles.
The Rust `attestation_assertion_verifier` repository is a dependency of the server;
it is not linked into this website's WASM module.
