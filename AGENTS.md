# TAPCamVerifier Rules

This repository owns the browser verifier, visualization, copy, tests, and
build/deployment code. Start with its README and the affected source/tests.
Read the pinned shared artifact contract only for the boundary being changed;
public authenticity claims also follow the
[product contract](../TAPArtifactContracts/ProductContract.md#7-claim-boundaries).

- An explicit bounded user request is sufficient for a routine fix. Do not
  require a Task, Board Steward, full backlog scan, or other repo agent guides.
  Consult a named work item only when its scope is relevant to this request.
- Shared formats and product requirements live in TAPArtifactContracts. Keep
  local implementation coverage, limits, and run/test commands in this README.
- Fail closed at input and verification boundaries. Depth and a valid binding
  do not prove scene truth, author identity, time, location, or non-AI origin.
- Preserve the approved verifier/landing particle-cat assets, mounts, touch and
  reduced-motion behavior, and regression tests.
- Reuse existing seams. Do not add compatibility layers, dependencies, parallel
  parsers, or UI infrastructure without a current requirement.
- Run focused tests, then relevant complete gates: `npm test`,
  `npm run typecheck`, `npm run build`. Report skipped fixtures and ignored-file,
  browser, deployment, and backend validation limits.
- Do not create per-task Markdown or duplicate specifications. Do not commit or
  push unless requested.
