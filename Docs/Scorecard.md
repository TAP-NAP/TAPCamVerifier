# Engineering Scorecard

Date: 2026-07-04

Overall: 8.9 / 10

## Scores

| Area | Score | Notes |
| --- | ---: | --- |
| Verification correctness | 9.2 | Content-binding v2 still-photo local verification passes the real `test/tap-depth-photo.HEIC` and `test/tap-depth-photo.JPG` fixtures. Content-binding v3 Live Photo verification now reports scoped results: the real AirDrop primary-photo fixture can pass as `primaryPhotoFromLivePhoto` with a missing-MOV warning, and the full verification ZIP reports `fullLivePhoto` when the MOV matches. Asset hash, metadata hash, proof slot, content digest/signing-binding material, and signed resource descriptors are checked in Rust/WASM. |
| Rust/WASM boundary | 8.9 | Proof-slot parsing, canonical JSON hashing, asset hashing, paired-MOV hashing, and final hard-binding checks live in Rust. TypeScript handles ZIP input resolution, UI, and WASM loading. |
| Static deployment fit | 8.8 | Vite uses a relative asset base. WASM is a static asset. Server verify is called through the production TAP-NAP endpoint with production-origin CORS. |
| Documentation readability | 8.8 | README, Mermaid flow, scoped verifier rule, fixture policy, scorecard, and AITrace now describe the v2 still-photo and v3 Live Photo hard-binding flow. |
| Test coverage | 8.6 | Rust unit tests cover BMFF/JPEG slot parsing, synthetic still-photo and Live Photo content binding, scoped missing/mismatched paired MOV handling, ImageIO RDF-attribute XMP manifest parsing, real HEIC/JPG fixtures, and point-cloud quality flags. TypeScript tests cover ZIP input resolution, scoped-warning rendering, point-cloud filtering, WASM risk-flag decoding, server calls, and the server-boundary echo diagnostic. TypeScript typecheck, production build, and a manual Chrome upload verification are part of the gate. Browser drag/drop automation is deferred unless explicitly reopened. |
| Extensibility | 8.1 | The base verifier is decoupled from image/depth analysis. Future decoded-depth, geometry, or Gaussian Splatting modules can be added as separate WASM modules after hard-binding verification. |

## Raise The Score Next

1. Define a shared WASM module contract before adding research-only geometry or
   3D Gaussian Splatting modules.

## Deferred Work

- 3D point-cloud screenshot or canvas-pixel CI checks are deferred.
- Mesh and texture rendering are deferred until a cleaner inspection surface is
  justified.
- Browser drag/drop automation is deferred after manual verification; do not add
  Playwright, Puppeteer, or another browser automation dependency unless it is
  explicitly reopened.
