# TAPCamVerifier Agent Rules

This repository owns the browser/server verifier implementation, its local
verification flow, user-facing verifier copy, tests, deployment, and downstream
artifact-contract adoption gaps. It does not own camera product behavior or shared
wire formats.

## Required reading

Before changing files:

1. Read this file.
2. Search the sibling [TAPCamKanban Project Board](../TAPCamKanban/ProjectBoard.md)
   and read the complete matching Task and dependencies.
3. Read [README.md](README.md).
4. Read the pinned TAPArtifactContracts revision for wire behavior.
5. For public authenticity claims, read TAPCamDemo
   `Docs/ProductContract.md` claim boundaries.
6. Inspect the current implementation and tests; historical design or QA prose
   is not current authority.

## Boundaries

- Keep shared wire/schema/signing/container rules in TAPArtifactContracts. Keep
  Verifier-local coverage, compatibility choices, and any implementation gaps
  in [README.md](README.md).
- Fail closed at input and verification boundaries; do not infer authenticity,
  scene truth, author identity, time, location, or non-AI origin from depth or a
  valid cryptographic binding.
- Preserve the verifier and landing particle-cat easter-egg system, its assets,
  touch behavior, reduced-motion behavior, and regression tests unless the product
  owner explicitly reverses that decision.
- Do not add compatibility layers, parallel parsers, new dependencies, or UI
  infrastructure without a demonstrated current requirement.
- Do not commit or push unless the product owner explicitly requests it.

## Validation

Run focused tests first, then the relevant complete gates:

```sh
npm test
npm run typecheck
npm run build
```

Report skipped real-media fixtures, browser/deployment/device boundaries, and any
validation that depends on ignored local files.
