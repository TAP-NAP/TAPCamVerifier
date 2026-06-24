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
- Marked the model as relative geometry. Manifest camera calibration can provide
  single-photo pinhole intrinsics, but the verifier still does not claim stable
  world coordinates, multi-frame reconstruction, hidden-surface geometry, or
  distortion-corrected projection.
- Uses a Three.js-compatible view-space depth convention: projected Z is the
  negative relative depth, so nearer samples sit closer to the default +Z camera
  and farther samples sit farther away.
- Kept the local/server verifier status unchanged. Geometry unavailable/error
  states do not affect final `valid` / `invalid`.

## Current Product Decision

Keep Point Cloud as the default geometry view. Mesh rendering remains
research-only because the current mesh effect is visually too rough for the
production verifier experience. On the mesh research branch, Mesh RGB is exposed
inside the point filter panel for investigation only.

## Deferred TODO

- 3D point-cloud screenshot or canvas-pixel CI checks are deferred.
- Browser drag/drop automation is deferred after manual verification. Do not add
  Playwright, Puppeteer, or another browser automation dependency unless this
  item is explicitly reopened.
- Mesh and texture work is deferred from production until a cleaner inspection
  surface is justified. The research branch hides stretched mesh faces by
  default because long depth-jump triangles look misleading.
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

## 2026-06-24 Capture Camera Reprojection Pass

- Added a `capture-camera` view mode for point-cloud rendering.
- Read `payload.depth.cameraCalibration` from the manifest and scale the 3x3
  intrinsic matrix into projected depth dimensions as `metadata-pinhole`.
- Fall back to `virtual-pinhole` only when manifest calibration is missing or
  invalid.
- Changed point back-projection to pinhole camera coordinates:
  `X = (u - cx) / fx * Z`, `Y = (v - cy) / fy * Z`, with view-space `Z` kept
  negative for Three.js.

## 2026-06-24 Server Boundary Diagnostic Pass

- Added a TypeScript diagnostic that compares the browser/WASM-recomputed
  `signingBindingSHA256` with the server-echoed `signingBindingSHA256` when the
  verify endpoint returns it.
- Rendered the server echo and boundary status in the result summary.
- Treat mismatch copy as server integration drift, not as a new server-side
  native file hash or content verification step.

## 2026-06-24 JPEG XMP Parser Pass

- Fixed Rust/WASM manifest extraction for JPEG files where ImageIO writes
  `tapdepth:Manifest` as an escaped RDF attribute on `rdf:Description` instead
  of a nested `<tapdepth:Manifest>` element.
- Added APP11 proof-slot parser coverage and full local content-binding fixture
  coverage for `test/tap-depth-photo.JPG`.

## 2026-06-24 JPEG Auxiliary Depth Pass

- Added browser-side JPEG/MPF auxiliary image discovery for ImageIO-exported JPG
  captures.
- The verifier now skips HDR gain-map auxiliary JPEGs and decodes the embedded
  `apdi:AuxiliaryImageType=disparity` JPEG as the depth luma plane for the
  existing depth preview and point-cloud path.

## 2026-06-25 Point Cloud Quality Filter Pass

- Added structured quality analysis to the Rust/WASM point-cloud projection
  report, including global risk, metrics, filterable warnings, sampled
  `Uint16Array` risk flags, and sampled outlier/discontinuity scores.
- Quality analysis now runs on the display-oriented depth grid before point
  sampling, so local clipped ranges, isolated outliers, discontinuity edges, and
  RGB/depth alignment risks can be carried into the sampled point cloud.
- Added frontend filtering controls over the 3D pane: clean points are always
  shown, and each risk type has independent Show and Highlight controls with a
  distinct highlight color. Showing every risk type without highlighting is
  equivalent to raw display.
- Filtering changes only the inspection view. It does not affect the local
  content-binding checks, server verification, or final `valid` / `invalid`
  result.

## 2026-06-25 Mesh RGB Research Sync

- Synced the mesh research branch on top of the mainline geometry filter panel.
- Moved Point Cloud / Mesh RGB mode switching into the same filter panel instead
  of using a separate floating toggle.
- Extended the point filter result with source point indexes so Mesh RGB can
  remap triangle indices after filtering. Triangles are rendered only when all
  three source vertices remain visible.
- Split mesh indices into default safe triangles and stretched depth-jump
  triangles. `Stretched faces` is off by default because the long stretched mesh
  faces make the current result look too ugly and potentially misleading.

## 2026-06-25 Depth Pro Research Pass

- Captured the Depth Pro direction in
  `Docs/Research/2026-06-25-depth-pro-rgb-depth-consistency.md`.
- The research direction is RGB-predicted depth consistency, not full
  single-image 3D reconstruction.
- Kept the 3D Gaussian Splatting TODO as a separate deferred multi-view
  reconstruction track in `Docs/Roadmap.md`.
- Full official Depth Pro is too large for default browser loading, so the
  implementation path should validate the comparison offline first, prototype
  browser inference with a smaller WebGPU depth model, and treat Depth Pro as a
  possible optional high-accuracy mode after export and quantization.
- The comparison should use tolerant collision-style matching rather than strict
  pixel equality, then mark meaningful mismatch regions in red.
