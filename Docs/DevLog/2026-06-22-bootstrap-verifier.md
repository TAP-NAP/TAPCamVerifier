# 2026-06-22 Bootstrap Verifier

## Decisions

- The verifier is a static web app intended for GitHub Pages.
- GitHub Actions builds `dist/` and deploys it through GitHub Pages on pushes to
  `main`.
- Deployment uses GitHub Pages at `verifier.tapnap.net`; the App Attest verify
  API remains on `www.tapnap.net`.
- The original HEIC is never uploaded to the server.
- Rust/WASM owns local binary parsing and hash checks.
- TypeScript owns drag-and-drop, rendering, WASM loading, and the server verify
  call after local verification passes.
- The verifier is strict: missing or duplicated proof slots, duplicated
  manifests, malformed slot padding, profile drift, or hash mismatches are
  `invalid`.
- The visible frontend is intentionally minimal: dropping or selecting a file
  starts verification immediately.
- `src/decorations/` is reserved for future designer-owned UI decoration layers
  and is currently empty.

## Fixture

The current local fixture is `test/tap-depth-photo.HEIC`. It is a TAPCamDemo
`content-binding:v2` HEIC with a fixed BMFF proof slot and empty
`manifest.proofs`.

Historical fixture `test/IMG_8653.HEIC` came from the superseded v1/pixel-digest
flow and contained proof data in `manifest.proofs[0]`.

The repository ignores HEIC files under `test/` so real device captures do not
get committed accidentally.

## Superseded V1 Implementation Boundary

This section records the original v1/pixel-digest investigation. It was
superseded on 2026-06-23 by TAPCamDemo `content-binding:v2`, where the base
signature hashes native file bytes excluding the proof slot instead of decoded
RGB/depth pixels.

That slice parsed the manifest and proof, verified canonical metadata and
signing-binding hashes, and blocked unless required canonical RGB/depth bytes
were available. This is no longer the current verifier boundary.

The page must not claim full `valid` until it can reproduce TAPCamDemo's RGB and
depth digest inputs exactly:

- primary HEIC image decoded to RGBA8;
- auxiliary depth/disparity converted to DepthFloat32 little-endian rows.

Reference checks from this round:

- TAPCamDemo `assert` branch recomputes `CaptureContentDigest` through
  `CGImageSourceCreateImageAtIndex`, `CGContext` RGBA8 drawing, and
  `AVDepthData.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)`.
- macOS Swift/ImageIO running the assert-branch RGB code on
  `test/IMG_8653.HEIC` produced the signed RGB digest
  `3wNtWM6-U2kHRp3pWccRyZMj9UNc6MFv8hiDtFYa848`.
- `libheif-js` and `@discourse/heic` both decode the display-oriented HEIC to
  `3024x4032` with digest
  `lP8ldlVnDr-oYtS0mMi6fM6DSwXVP3OK5pp2p7_zvT4`.
- `libheif-js` low-level `ignore_transformations` decodes `4032x3024` with
  digest `o6VZlmYYG5acpmXyueh8ABSKrWf64vTKK79c1ogT2b8`, still not the signed
  CoreGraphics digest.
- The HEIC embeds a Display P3 ICC profile. A simple Display P3 to sRGB matrix
  transform is close visually but does not match the signed digest.
- `libheif-js` can locate a depth item (`hasDepth=1`) and decode a `576x768`
  8-bit disparity plane with representation `uniform_disparity`,
  `dMin=11.640625`, `dMax=13.5`. Simple disparity/depth mappings did not match
  the signed `DepthFloat32` digest.

## 2026-06-23 Strict Depth Parity Update

- The browser verifier now reconstructs the depth digest for
  `test/IMG_8653.HEIC` exactly.
- ImageIO exposes the auxiliary depth data as `L008` storage plus an `hdis`
  Float16 disparity buffer. The browser path reproduces this from libheif-js's
  `576x768` luma plane by applying APDI `FloatMinValue=11.640625`,
  `FloatMaxValue=13.5`, and native `Orientation=6` rotation into `768x576`.
- `AVDepthData.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)`
  matches ARM NEON `FRECPE` plus one `FRECPS` Newton step, not normal
  Float32 division. `public/assets/apple-hdis-fdep-nr1.bin` stores the
  65536-entry half-bit lookup table so browsers can reproduce the Apple output
  independent of CPU architecture.
- A direct WASM check with the reconstructed depth bytes produced
  `depth-digest: pass` and actual digest
  `mkVWxvobf0nAGPqjFhD1GHpia4L96A8lpqjmq15zrT8`.
- RGB remains the only local blocker. CoreGraphics draws the primary HEIC to
  DeviceRGB/sRGB and produces
  `3wNtWM6-U2kHRp3pWccRyZMj9UNc6MFv8hiDtFYa848`. libheif-js 8-bit and 16-bit
  output, ImageMagick WASM, and LittleCMS P3-to-sRGB transforms do not match
  Apple ImageIO/CoreGraphics byte-for-byte. WebCodecs was added as a strict
  browser-native candidate, but it is accepted only if its RGBA8 bytes hash to
  the signed RGB digest.

## 2026-06-23 Content Binding V2 Update

- TAPCamDemo `origin/refacteor_under_review` now signs a hard binding over the
  saved artifact instead of decoded RGB/depth buffers.
- The current fixture is `test/tap-depth-photo.HEIC`.
- Proof bodies are stored in a fixed proof slot, not in `manifest.proofs`.
- The browser verifier now requires exactly one TAP proof slot:
  - BMFF `uuid` kind `bmff-uuid-proof-slot` for HEIC;
  - JPEG APP11 kind `jpeg-app11-proof-slot` for JPG/JPEG.
- Rust/WASM validates slot magic `TAPCAM-PROOF-SLOT-V1`, version `1`, envelope
  length, and zero-filled padding.
- Rust/WASM requires exactly one XMP `tapdepth:Manifest`.
- Rust/WASM recomputes:
  - `assetHash = SHA-256(file bytes excluding proof slot container range)`;
  - `metadataHash = SHA-256(canonical manifest.payload JSON)`;
  - `CaptureContentBinding`;
  - `CaptureSigningBinding.bodySHA256`.

Correction: the current verifier hashes the exact `manifest.payload` JSON bytes
embedded in XMP rather than parsing and reserializing the payload. See
`2026-07-16-location-metadata-hash-precision.md` for the high-precision location
metadata compatibility fix.

- The real fixture now verifies locally as `valid` with:
  - capture ID `19EE1B2E-16FD-47B5-AD24-D559568CA4AD`;
  - asset hash `L3PxMfXci4kCCi_rQ_XV1wxb9f_oFX7lcwFkTVScY1Y`;
  - metadata hash `pioecsnO2ixGdvZTmMUWGGXQ3uPZrZ4OgNymTvQbnIk`;
  - body hash `6ZIqezCAIVp2RtZyOAA_lW3vWTn5iuHLVrLGEw1jiv0`.
- TypeScript no longer invokes browser RGB/depth decoders in the base
  verification path. The old decoder modules and `libheif-js` dependency were
  removed.
- `npm run test`, `npm run build`, the fixture CLI, and a manual Chrome upload
  on `http://127.0.0.1:4174/` all verified the fixture as `valid`.

## 2026-06-23 Server Verify Integration

- The production page at `https://verifier.tapnap.net/` calls
  `https://www.tapnap.net/tapcam/capture-signatures/verify` after local
  verification passes.
- A direct server call with the real fixture `serverRequest` returns
  `status: valid` and `signingBindingSHA256`
  `dXA6ou1QxqT1PgTYP5qj336Zvp1Z_EhCrss_dbQkzPw`.
- Browser fetch still fails until the server returns CORS headers for
  `https://verifier.tapnap.net` and handles the OPTIONS preflight. Current
  observed preflight response is `405 Allow: POST`.
