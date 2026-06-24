# Engineering Scorecard

Date: 2026-06-24

Overall: 9.0 / 10

## Scores

| Area | Score | Notes |
| --- | ---: | --- |
| Verification correctness | 9.1 | Content-binding v2 local verification passes the real `test/tap-depth-photo.HEIC` fixture. Asset hash, metadata hash, proof slot, content digest, and signing binding are recomputed in Rust/WASM. |
| Rust/WASM boundary | 8.9 | Proof-slot parsing, canonical JSON hashing, asset hashing, final hard-binding checks, and geometry mesh index generation live in Rust. TypeScript handles UI, WASM loading, and Three.js rendering. |
| Static deployment fit | 8.8 | Vite uses a relative asset base. WASM is a static asset. Server verify is called through the production TAP-NAP endpoint with production-origin CORS. |
| Documentation readability | 8.8 | README, Mermaid flow, strict verifier rule, fixture policy, scorecard, Roadmap, and DevLog now describe the v2 hard-binding flow and staged Mesh RGB inspection. |
| Test coverage | 8.4 | Rust unit tests cover slot parsing, synthetic content binding, real fixture paths, point projection, and mesh index generation. TypeScript covers rendering metadata and projection-report decoding. Browser drag/drop automation is still missing. |
| Extensibility | 8.2 | The base verifier is decoupled from image/depth analysis. Point Cloud and Mesh RGB now share one geometry report without redefining local/server verification semantics. |

## Raise The Score Next

1. Add browser drag/drop automation against `test/tap-depth-photo.HEIC`,
   including original, depth, point-cloud, and Mesh RGB render checks.
2. Add canvas or screenshot assertions for the 3D point-cloud and Mesh RGB pane
   so blank or badly framed renders fail in CI.
3. Add point-cloud inspection warnings for depth coverage, discontinuities,
   outliers, and RGB/depth alignment risk.
4. Add signed JPEG fixture coverage for the fixed proof-slot parser and full
   local content-binding path when TAPCamDemo exports a signed JPEG sample.
5. Add a server-boundary diagnostic only: if the server echoes
   `signingBindingSHA256`, compare it with the browser-recomputed hash of the
   exact submitted `signingBinding` to catch integration drift. Do not describe
   this as server-side content hash verification.
6. Define a shared WASM module contract before adding research-only geometry or
   3D Gaussian Splatting modules.
