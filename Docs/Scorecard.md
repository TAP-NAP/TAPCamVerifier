# Engineering Scorecard

Date: 2026-06-24

Overall: 8.9 / 10

## Scores

| Area | Score | Notes |
| --- | ---: | --- |
| Verification correctness | 9.1 | Content-binding v2 local verification passes the real `test/tap-depth-photo.HEIC` fixture. Asset hash, metadata hash, proof slot, content digest, and signing binding are recomputed in Rust/WASM. |
| Rust/WASM boundary | 8.8 | Proof-slot parsing, canonical JSON hashing, asset hashing, and final hard-binding checks live in Rust. TypeScript now handles only UI and WASM loading. |
| Static deployment fit | 8.8 | Vite uses a relative asset base. WASM is a static asset. Server verify is called through the production TAP-NAP endpoint with production-origin CORS. |
| Documentation readability | 8.7 | README, Mermaid flow, strict verifier rule, fixture policy, scorecard, and DevLog now describe the v2 hard-binding flow. |
| Test coverage | 8.4 | Rust unit tests cover slot parsing, synthetic content binding, and the real fixture. TypeScript tests cover rendering, server calls, and the server-boundary echo diagnostic. TypeScript typecheck, production build, and a manual Chrome upload verification are part of the gate. Browser drag/drop automation is frozen unless explicitly reopened. |
| Extensibility | 8.1 | The base verifier is decoupled from image/depth analysis. Future decoded-depth, geometry, or Gaussian Splatting modules can be added as separate WASM modules after hard-binding verification. |

## Raise The Score Next

1. Add canvas or screenshot assertions for the 3D point-cloud pane so blank or
   badly framed renders fail in CI.
2. Add point-cloud inspection warnings for depth coverage, discontinuities,
   outliers, and RGB/depth alignment risk.
3. Add signed JPEG fixture coverage for the fixed proof-slot parser and full
   local content-binding path when TAPCamDemo exports a signed JPEG sample.
4. Define a shared WASM module contract before adding research-only geometry or
   3D Gaussian Splatting modules.
