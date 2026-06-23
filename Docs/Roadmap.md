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
- explicit `relative geometry` labeling, with no metric-reconstruction claim.

The base verifier remains C2PA-style hard binding over format-native bytes plus
App Attest verification. Pixel back-projection reports additional inspection
signals only; it does not redefine `LocalVerificationReport.status` or final
`valid` / `invalid`.

## Next Geometry TODO: Mesh And Texture

Use the depth grid to build a triangle mesh, skip triangles across large depth
discontinuities, and attach RGB as vertex color or UV texture. Add inspection
warnings for depth coverage, surface continuity, and RGB/depth alignment.

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
