# TAPCamVerifier Roadmap

## Current Visualization Step

- Show the selected original capture beside its embedded depth/disparity preview.
- Use browser-native original preview when possible, with a HEIC WASM fallback
  that decodes the primary image and lets Rust/WASM own TAP orientation and
  preview downscaling.
- Keep final detection below the visual panes.
- Keep detailed local content-binding checks collapsed by default.
- Keep original/depth visualization separate from base verification.
  Visualization can fail or be unavailable without changing local
  content-binding semantics.

## Geometry Direction 1: RGB Reconstruction Comparison

Use RGB data to build a 3D Gaussian Splatting reconstruction, derive a
reconstructed depth estimate, and compare it against the signed capture's
embedded depth/disparity data. The intended signal is geometric consistency:
large disagreement between the RGB-derived geometry and the embedded depth can
indicate a suspicious or non-real-world capture.

## Geometry Direction 2: Depth-To-3D Inspection

Use the embedded depth/disparity data as the geometry source, project the RGB
pixels as texture, and render a small interactive 3D model. The model should
support limited orbit and translation controls around the center point so users
can inspect whether the visible shape matches the claimed scene.

## Verification Boundary

The base verifier remains C2PA-style hard binding over format-native bytes plus
App Attest verification. Future geometry modules should report additional
inspection or confidence signals, not redefine `LocalVerificationReport.status`
or the current final `valid` / `invalid` rule.
