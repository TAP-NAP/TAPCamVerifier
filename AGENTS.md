# TAPCamVerifier Rules

Start with README and the affected source/tests. Use
[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts) as the
normative source for artifact formats, verification rules, backend API behavior,
and product claims. For artifact changes, read the reviewed revision linked in
README and preserve its documented local compatibility allowances.

- Work from the requested scope, current source, and relevant tests. Clarify
  unresolved behavior without reopening established decisions.
- Write documentation for a new reader: purpose, concepts, usage, and limits.
  Keep private planning records, internal identifiers, and execution diaries out
  of source and documentation. Keep exact technical revisions where needed.
- Prefer existing seams and deletion of redundant material. Add no dependencies,
  generated infrastructure, or extra documentation without a current need.
- Keep changes and validation proportional; report actual checks and limits.
  Do not commit or push unless the current conversation authorizes it.

- Fail closed at input and verification boundaries. Depth and a valid binding
  do not prove scene truth, author identity, time, location, or non-AI origin.
- Preserve the verifier/landing particle-cat assets, mounts, touch and
  reduced-motion behavior, and regression tests.
- Run focused tests and the relevant complete gates from README: `npm test`,
  `npm run typecheck`, and `npm run build`. Report skipped fixtures and browser,
  deployment, and backend validation limits.
