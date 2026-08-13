# 3D point-cloud visual QA

- Date: 2026-08-13
- Visual source: `/Users/harold/.codex/generated_images/019ffb25-50d7-7361-8291-65d7b278a4ad/exec-6a7fec36-9aff-4a5d-bcc5-7a9d60d6b333.png`
- Source dimensions: 853 x 1844 px
- Source role: material, particle, and cool/warm energy reference; not a one-to-one page-layout target
- Test fixture: `/Users/harold/TAPCamVerifier/test/tap-depth-photo.HEIC`
- Implementation screenshots:
  - `/private/tmp/tapcam-verifier-design-qa/geometry-head-on.png`
  - `/private/tmp/tapcam-verifier-design-qa/geometry-hover.png`
  - `/private/tmp/tapcam-verifier-design-qa/geometry-pulse.png`
  - `/private/tmp/tapcam-verifier-design-qa/geometry-rotated.png`
  - `/private/tmp/tapcam-verifier-design-qa-in-place-roll/baseline.png`
  - `/private/tmp/tapcam-verifier-design-qa-in-place-roll/roll-a.png`
  - `/private/tmp/tapcam-verifier-design-qa-in-place-roll/roll-b.png`
  - `/private/tmp/tapcam-verifier-design-qa-efficient-in-place-roll/baseline.png`
  - `/private/tmp/tapcam-verifier-design-qa-efficient-in-place-roll/roll-a.png`
  - `/private/tmp/tapcam-verifier-design-qa-efficient-in-place-roll/roll-b.png`
- Side-by-side comparison: `/private/tmp/tapcam-verifier-design-qa/design-comparison.png`
- Focused hover-state comparison: `/private/tmp/tapcam-verifier-design-qa-in-place-roll/focused-comparison.png`
- Final efficient hover-state comparison: `/private/tmp/tapcam-verifier-design-qa-efficient-in-place-roll/focused-comparison.png`
- Browser viewport: 1280 x 720 CSS px
- Device pixel ratio: 2
- UI state: locally verified HEIC with 110,592 projected points, sample step 2, metadata-pinhole camera model

## Visual comparison

- Particle silhouette: passed. The renderer now uses circular, soft-edged splats instead of square point sprites.
- Planar projection: passed. Initial and reset views use the capture camera origin and look directly through the recovered plane, avoiding the former decorative tilt.
- Surface continuity: passed. Depth-aware splat sizing closes large gaps in the head-on view while individual particles remain legible after rotation.
- Color treatment: passed. Neutral image color is retained, and interaction uses a brighter, slightly more saturated version of each particle's own source color. No fixed orange highlight remains.
- Background and contrast: passed. The existing dark viewer surface continues to separate the cloud from the page chrome.

## Interaction checks

- Pointer hover: passed; affected particle centers remain fixed while each circular splat's internal highlight rotates to create an in-place rolling-bead effect.
- Pointer click: passed; a short concentric energy pulse expands from the selected point.
- Pointer drag: passed; OrbitControls rotation remains direct and responsive.
- Reset view: passed; returns to the calibrated, head-on projection.
- Touch fallback: passed by code-path inspection; press targets a point and drag remains available.
- Reduced motion: passed by code-path inspection; the rolling clock and click pulse are suppressed while self-color highlighting remains available.

## Runtime checks

- Browser console warnings/errors: none.
- Local parsing and depth reconstruction: passed.
- Motion cost boundary: passed by implementation inspection. Hover changes one shared direction uniform per frame only while active; it performs no per-point JavaScript updates, geometry translation, point-size animation, or GPU vertex trigonometry. This is not a device power-consumption measurement.
- Remote verification request: unavailable in local preview because the configured verification server is not reachable from the preview origin; this does not affect the local geometry test.

## Comparison history

1. Baseline: square `PointsMaterial` sprites, fixed pixel size, decorative initial tilt.
2. Iteration: circular shader splats, robust median-depth sizing, calibrated initial camera, hover lift, click pulse, and drag rotation.
3. Final tuning: increased controlled overlap, softened particle edge, localized orange energy, and bounded pulse radius.
4. User color refinement: removed the fixed orange energy color and changed hover to source-color self-illumination.
5. User motion refinement: removed all hover translation and point-size oscillation; particle centers and geometry now remain fixed while only the internal highlight rotates. Focused before/after captures confirm a localized animated change, and the shader test guards against reintroducing displaced geometry.
6. Energy refinement: replaced per-vertex sine/cosine work with one shared roll-direction uniform computed once per active frame. The final browser capture preserves the in-place rolling highlight with no console errors.

final result: passed
