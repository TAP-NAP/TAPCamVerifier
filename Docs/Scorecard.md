# Engineering Scorecard

Date: 2026-06-24

Overall: 8.9 / 10

## Scores

| Area | Score | Notes |
| --- | ---: | --- |
| Verification correctness | 9.1 | Content-binding v2 local verification passes the real `test/tap-depth-photo.HEIC` and `test/tap-depth-photo.JPG` fixtures. Asset hash, metadata hash, proof slot, content digest, and signing binding are recomputed in Rust/WASM. |
| Rust/WASM boundary | 8.8 | Proof-slot parsing, canonical JSON hashing, asset hashing, and final hard-binding checks live in Rust. TypeScript now handles only UI and WASM loading. |
| Static deployment fit | 8.8 | Vite uses a relative asset base. WASM is a static asset. Server verify is called through the production TAP-NAP endpoint with production-origin CORS. |
| Documentation readability | 8.7 | README, Mermaid flow, strict verifier rule, fixture policy, scorecard, and DevLog now describe the v2 hard-binding flow. |
| Test coverage | 8.4 | Rust unit tests cover BMFF/JPEG slot parsing, synthetic content binding, ImageIO RDF-attribute XMP manifest parsing, real HEIC/JPG fixtures, and point-cloud quality flags. TypeScript tests cover rendering, point-cloud filtering, WASM risk-flag decoding, server calls, and the server-boundary echo diagnostic. TypeScript typecheck, production build, and a manual Chrome upload verification are part of the gate. Browser drag/drop automation is deferred unless explicitly reopened. |
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
