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
- Keep original/depth visualization separate from base verification.
  Visualization can fail or be unavailable without changing local
  content-binding semantics.

## Current Geometry Direction: Signed Depth Pixel Back-Projection

Use the signed embedded depth/disparity pixels as the geometry source. Each
sampled depth pixel is back-projected into a relative 3D point, then the aligned
RGB pixel is attached as per-point color. This lets a user inspect what image
pixels sit on the claimed depth shape.

Version 1 is a point-cloud inspection model:

- depth/disparity pixels -> relative 3D point cloud;
- RGB pixels -> per-point color;
- browser rotate, pan, zoom, and reset controls;
- negative-Z view-space convention, where near samples are closer to the default
  +Z camera and far samples are farther away;
- explicit `relative geometry` labeling, with no metric-reconstruction claim.

The base verifier remains C2PA-style hard binding over format-native bytes plus
App Attest verification. Pixel back-projection reports additional inspection
signals only; it does not redefine `LocalVerificationReport.status` or final
`valid` / `invalid`.

## Current Geometry Step: Point Cloud Inspection

Keep the geometry view point-cloud-only for now. Completed point-cloud
inspection improvements:

- tuned point size, sampling density, and default camera framing so the shape is
  easier to read on desktop and mobile;
- exposed clear point-cloud metadata, including sample step, source dimensions,
  RGB dimensions, orientation, and depth/disparity range;

Remaining point-cloud inspection TODO:

- add depth coverage warnings for empty, saturated, or extremely narrow depth
  ranges;
- add discontinuity/outlier warnings that flag abrupt depth jumps without
  generating a triangle surface;
- add RGB/depth alignment warnings when source dimensions, orientation, or
  aspect ratio suggest the color overlay may be unreliable;
- keep explicit `relative geometry` labeling: manifest camera calibration can
  provide single-photo pinhole intrinsics, but the verifier still has no stable
  world coordinates, multi-frame poses, hidden-surface geometry, or serialized
  distortion lookup table.

## Deferred Geometry TODO: Mesh And Texture

Mesh rendering is deferred because the current visual result is not acceptable
for the verifier experience. Revisit only if a later implementation can produce
a cleaner inspection surface than the point cloud. The old mesh direction was:
use the depth grid to build a triangle mesh, skip triangles across large depth
discontinuities, and attach RGB as vertex color or UV texture.

## Verification And QA TODO

- Add browser drag/drop automation against `test/tap-depth-photo.HEIC`.
- Add screenshot or canvas-pixel checks for the 3D point-cloud pane so blank or
  badly framed renders fail in CI.
- Add signed JPEG fixture coverage for the fixed proof-slot parser and full
  local content-binding path when TAPCamDemo exports a signed JPEG sample.
- Add a server-boundary diagnostic, not a new content verification step: if the
  verify endpoint echoes `signingBindingSHA256`, display or assert that it
  matches the browser-recomputed hash of the exact `signingBinding` sent to the
  server. A mismatch should be treated as integration drift; native file
  `assetHash`, manifest `metadataHash`, `bodySHA256`, `contentDigest`, and
  `signingBinding` validation remain browser/WASM responsibilities.
- Keep visualization failures non-fatal for `LocalVerificationReport.status` and
  final `valid` / `invalid` semantics.

## Research TODO: RGB Reconstruction Comparison

Use RGB data to build a 3D Gaussian Splatting reconstruction, derive a
reconstructed depth estimate, and compare it against the signed capture's
embedded depth/disparity data. The intended signal is geometric consistency:
large disagreement between the RGB-derived geometry and the embedded depth can
indicate a suspicious or non-real-world capture.

The 3D Gaussian Splatting track is deferred until the data requirements are
clear. The research task should confirm whether TAPCam needs burst/video,
multi-view frames, camera poses, a sparse point cloud, or a COLMAP-compatible
package before this can be treated as an implementation direction.
