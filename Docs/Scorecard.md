# Engineering Scorecard

Date: 2026-06-24

Overall: 9.0 / 10

## Scores

| Area | Score | Notes |
| --- | ---: | --- |
| Verification correctness | 9.1 | Content-binding v2 local verification passes the real `test/tap-depth-photo.HEIC` and `test/tap-depth-photo.JPG` fixtures. Asset hash, metadata hash, proof slot, content digest, and signing binding are recomputed in Rust/WASM. |
| Rust/WASM boundary | 8.9 | Proof-slot parsing, canonical JSON hashing, asset hashing, final hard-binding checks, depth quality flags, and research mesh index generation live in Rust. TypeScript handles UI, WASM loading, filtering, and Three.js rendering. |
| Static deployment fit | 8.8 | Vite uses a relative asset base. WASM is a static asset. Server verify is called through the production TAP-NAP endpoint with production-origin CORS. |
| Documentation readability | 8.8 | README, Mermaid flow, strict verifier rule, fixture policy, scorecard, Roadmap, and DevLog now describe the v2 hard-binding flow, mainline point filtering, and Mesh RGB research caveats. |
| Test coverage | 8.5 | Rust unit tests cover BMFF/JPEG slot parsing, synthetic content binding, ImageIO RDF-attribute XMP manifest parsing, real HEIC/JPG fixtures, point-cloud quality flags, and mesh index separation. TypeScript tests cover rendering, point-cloud filtering, mesh index remapping, WASM risk/mesh decoding, server calls, and the server-boundary echo diagnostic. |
| Extensibility | 8.2 | The base verifier is decoupled from image/depth analysis. Point Cloud remains the product default; Mesh RGB is isolated as a research render mode that reuses the same filter panel without redefining verification semantics. |

## Raise The Score Next

1. Define a shared WASM module contract before adding research-only geometry or
   3D Gaussian Splatting modules.

## Deferred Work

- 3D point-cloud screenshot or canvas-pixel CI checks are deferred.
- Mesh and texture rendering remain research-only until a cleaner inspection
  surface is justified; stretched mesh faces are hidden by default on the
  research branch because the current mesh result is too ugly for production.
- Browser drag/drop automation is deferred after manual verification; do not add
  Playwright, Puppeteer, or another browser automation dependency unless it is
  explicitly reopened.
