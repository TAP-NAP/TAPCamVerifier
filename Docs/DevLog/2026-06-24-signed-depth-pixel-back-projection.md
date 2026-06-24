# 2026-06-24 Signed Depth Pixel Back-Projection

## Conversation Record

The geometry feature should not be described as `Depth-to-3D Textured
Inspection` or as RGB reconstruction. The accurate direction is signed depth
pixel back-projection: take embedded depth/disparity pixels from the signed file,
back-project those pixels into relative 3D, then attach the aligned RGB pixels as
per-point color.

The user goal is to inspect what object shape the signed depth describes and
which visible image pixels sit on that shape. This makes the 3D view an
inspection model, not an independent reconstruction or a new verification input.

## Implemented Direction

- Added a downstream `3D Pixel Projection` pane after the original and depth
  panes.
- Added a Rust/WASM `tapcam_project_depth_pixels` path that generates a sampled
  relative point cloud from decoded RGB plus decoded depth/disparity.
- Kept Three.js responsible only for browser rendering and interaction.
- Marked the model as relative geometry because current fixture metadata does
  not include camera intrinsics, focal length, or baseline.
- Uses a Three.js-compatible view-space depth convention: projected Z is the
  negative relative depth, so nearer samples sit closer to the default +Z camera
  and farther samples sit farther away.
- Kept the local/server verifier status unchanged. Geometry unavailable/error
  states do not affect final `valid` / `invalid`.

## Current Product Decision

Keep the geometry viewer in point-cloud style for now. Mesh rendering is
deferred because the current mesh effect is visually too rough for the verifier
experience.

## Deferred TODO

- Add depth coverage warnings for empty, saturated, or extremely narrow ranges.
- Add discontinuity/outlier warnings without generating a triangle surface.
- Add RGB/depth alignment warnings when dimensions, orientation, or aspect ratio
  suggest unreliable color overlay.
- Add browser drag/drop automation and canvas/screenshot checks for the 3D
  point-cloud pane.
- Defer mesh and texture work until a cleaner inspection surface is justified.
- Research 3D Gaussian Splatting data requirements before implementation. The
  likely missing data includes multi-view images or burst/video, camera poses,
  sparse point cloud, or a COLMAP-compatible export package.

## 2026-06-24 Point Cloud Readability Pass

- Increased point-cloud sampling density while keeping a fixed browser budget.
- Made rendered point size depend on sample spacing instead of a single fixed
  material size.
- Changed reset/default view to fit the normalized point-cloud bounds for the
  current viewport aspect ratio.
- Added point-cloud metadata for sample step, projected/source depth dimensions,
  RGB dimensions, rotation, depth orientation, photo orientation, depth range,
  and relative scale.
