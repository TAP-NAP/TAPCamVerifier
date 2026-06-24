# TAPCamVerifier Roadmap

## Current Visualization Step

- Show the selected original capture beside its embedded depth/disparity preview.
- Use browser-native original preview when possible, with a HEIC WASM fallback
  that decodes the primary image and lets Rust/WASM own TAP orientation and
  preview downscaling.
- Show a third `3D Pixel Projection` pane when decoded RGB and embedded depth are
  both available.
- Keep final detection below the visual panes.
- Keep detailed local content-binding checks collapsed by default.
- Show a server-boundary diagnostic when the verify endpoint echoes
  `signingBindingSHA256`; compare it with the browser/WASM-recomputed hash of the
  exact submitted `signingBinding` to catch integration drift without redefining
  local content verification.
- Keep original/depth visualization separate from base verification.
  Visualization can fail or be unavailable without changing local
  content-binding semantics.

## Current Geometry Direction: Signed Depth Pixel Back-Projection

Use the signed embedded depth/disparity pixels as the geometry source. Each
sampled depth pixel is back-projected into a relative 3D point, then the aligned
RGB pixel is attached as per-point color. This lets a user inspect what image
pixels sit on the claimed depth shape.

Version 1 is a point-cloud inspection model, with Mesh RGB kept as research-only
on the mesh pre-research branch:

- depth/disparity pixels -> relative 3D point cloud;
- RGB pixels -> per-point color;
- optional Mesh RGB uses the same sampled vertices and per-vertex RGB;
- point filtering also filters Mesh RGB by remapping triangle indices to the
  visible point set;
- long stretched depth-jump faces are hidden by default and can be shown only
  through an explicit `Stretched faces` research control;
- browser rotate, pan, zoom, and reset controls;
- negative-Z view-space convention, where near samples are closer to the default
  +Z camera and far samples are farther away;
- explicit `relative geometry` labeling, with no metric-reconstruction claim.

The base verifier remains C2PA-style hard binding over format-native bytes plus
App Attest verification. Pixel back-projection reports additional inspection
signals only; it does not redefine `LocalVerificationReport.status` or final
`valid` / `invalid`.

## Current Geometry Step: Point Cloud Inspection

Keep Point Cloud as the default geometry view. Completed point-cloud inspection
improvements:

- tuned point size, sampling density, and default camera framing so the shape is
  easier to read on desktop and mobile;
- exposed clear point-cloud metadata, including sample step, source dimensions,
  RGB dimensions, orientation, and depth/disparity range;
- added structured point-cloud quality analysis for clipped/narrow depth ranges,
  isolated outliers, discontinuity edges, RGB/depth alignment risk, and
  uncorrected distortion-edge risk;
- added frontend point filtering with always-visible clean points, per-risk-type
  Show/Highlight controls, distinct highlight colors, and a Low/Medium/High
  strength slider.
- on this research branch, added Mesh RGB as a second render mode inside the
  same filter panel; it inherits the visible point set from the point filter and
  drops triangles whose source vertices are hidden.

Current point-cloud inspection constraints:

- keep explicit `relative geometry` labeling: manifest camera calibration can
  provide single-photo pinhole intrinsics, but the verifier still has no stable
  world coordinates, multi-frame poses, hidden-surface geometry, or serialized
  distortion lookup table.

## Verification And QA Notes

- Keep visualization failures non-fatal for `LocalVerificationReport.status` and
  final `valid` / `invalid` semantics.

Completed verification coverage:

- Signed JPEG fixture coverage now exercises ImageIO RDF-attribute XMP manifest
  extraction, the fixed APP11 proof-slot parser, and the full local
  content-binding path against `test/tap-depth-photo.JPG`.

## Deferred TODO

- 3D point-cloud screenshot or canvas-pixel CI checks are deferred. Do not treat
  blank-render or framing automation as a current CI gate unless this item is
  explicitly reopened.
- Mesh and texture remain research-only because the current mesh visual result
  is too ugly for the production verifier experience. Mesh RGB hides stretched
  faces by default in this branch; UV texture projection remains deferred until
  mesh topology is visually stable.
- Browser drag/drop automation against `test/tap-depth-photo.HEIC` is deferred
  after manual verification. This repo should not add Playwright, Puppeteer, or
  another browser automation dependency for this item unless the TODO is
  explicitly reopened. While deferred, preserve the existing `src/main.ts`
  dropzone workflow unless there is a direct product need to change it.

## Research Direction: RGB-Predicted Depth Consistency

Use RGB data to predict an independent depth map, then compare it against the
signed capture's embedded depth/disparity data. The intended signal is geometric
consistency: large disagreement between RGB-predicted geometry and embedded
depth can indicate a suspicious or non-real-world capture.

Depth Pro is the preferred research target because it can produce a dense depth
map from a single RGB image. The current research report is
`Docs/Research/2026-06-25-depth-pro-rgb-depth-consistency.md`.

## Research TODO: 3D Gaussian Splatting Reconstruction

Keep the 3D Gaussian Splatting track as a separate deferred TODO. This direction
is still useful if TAPCam later captures or imports enough reconstruction input:

- burst or video frames;
- multi-view stills;
- camera poses;
- sparse point clouds;
- a COLMAP-compatible package.

This TODO should confirm the minimum TAPCam capture/export package needed before
3DGS can be treated as an implementation direction. It should stay separate from
the Depth Pro path: Depth Pro is the near-term single-image depth consistency
check, while 3DGS remains the longer-term multi-view reconstruction research
track.
