# Engineering Scorecard

Date: 2026-06-23

Overall: 8.9 / 10

## Scores

| Area | Score | Notes |
| --- | ---: | --- |
| Verification correctness | 9.1 | Content-binding v2 local verification passes the real `test/tap-depth-photo.HEIC` fixture. Asset hash, metadata hash, proof slot, content digest, and signing binding are recomputed in Rust/WASM. |
| Rust/WASM boundary | 8.8 | Proof-slot parsing, canonical JSON hashing, asset hashing, and final hard-binding checks live in Rust. TypeScript now handles only UI and WASM loading. |
| Static deployment fit | 8.8 | Vite uses a relative asset base. WASM is a static asset. Verify API remains same-origin and no proxy is introduced. |
| Documentation readability | 8.7 | README, Mermaid flow, strict verifier rule, fixture policy, scorecard, and DevLog now describe the v2 hard-binding flow. |
| Test coverage | 8.3 | Rust unit tests cover slot parsing, synthetic content binding, and the real fixture. TypeScript typecheck, production build, and a manual Chrome upload verification are part of the gate. Browser drag/drop automation is still missing. |
| Extensibility | 8.1 | The base verifier is decoupled from image/depth analysis. Future decoded-depth, geometry, or Gaussian Splatting modules can be added as separate WASM modules after hard-binding verification. |

## Raise The Score Next

1. Add browser drag/drop automation against `test/tap-depth-photo.HEIC`.
2. Add JPEG proof-slot fixture coverage when TAPCamDemo exports a signed JPEG
   sample.
3. Compare the server's `signingBindingSHA256` with the locally recomputed value
   in the UI once a reachable same-origin backend is available.
4. Define a shared WASM module contract before adding depth reconstruction or 3D
   Gaussian Splatting modules.
