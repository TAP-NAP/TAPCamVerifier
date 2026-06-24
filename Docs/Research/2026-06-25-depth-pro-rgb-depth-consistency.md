# 2026-06-25 Depth Pro RGB/Depth Consistency Research

## Goal

Evaluate whether Apple Depth Pro can replace the earlier 3D Gaussian Splatting
research direction for TAPCamVerifier's RGB-derived geometry check.

The verifier already has a signed embedded depth/disparity path. The proposed
research path is:

1. use the selected RGB image to predict an independent depth field;
2. compare that prediction against the signed embedded depth/disparity data;
3. mark large geometric disagreements in red;
4. keep this signal downstream from base signature verification.

This is an inspection and consistency signal. It must not redefine the local
`valid` / `invalid` result, which remains based on format-native byte binding,
proof-slot checks, manifest checks, and App Attest verification.

## Depth Pro Fit

Depth Pro is a strong candidate for the consistency signal because it is a
single-image monocular metric depth model. It predicts dense depth from RGB and
also estimates focal length when camera intrinsics are not supplied. This matches
the verifier's desired comparison better than 3D Gaussian Splatting when the
input is a single signed capture.

Compared with the earlier 3D Gaussian Splatting direction:

- Depth Pro needs one RGB image, while practical 3DGS reconstruction usually
  needs multi-view images, poses, sparse points, or a COLMAP-like package.
- Depth Pro directly returns a depth map, which is the quantity we need for
  consistency comparison.
- Depth Pro does not provide full novel-view reconstruction. It should be used
  for depth agreement, not as a replacement for real multi-view 3D capture.

## Browser Feasibility

The complete official Depth Pro model is heavy for a static browser verifier.
The official checkpoint URL reports `content-length: 1904446787`, about 1.8 GiB.
That size is not acceptable as a default GitHub Pages browser download, and it
also creates a high WebGPU memory risk.

The browser plan should be two-tiered:

1. Offline/reference research: run the official Depth Pro implementation outside
   the browser to validate comparison metrics, thresholds, and expected failure
   modes.
2. Browser prototype: use ONNX Runtime WebGPU or Transformers.js with a smaller
   depth model first, then revisit Depth Pro only as an optional high-accuracy
   mode after export, quantization, and memory tests.

ONNX Runtime WebGPU is the most direct low-level browser path for custom ONNX
models. Transformers.js is a faster product-prototype path because it already
supports browser depth-estimation pipelines, WebGPU execution, and quantized
model loading.

## Comparison Model

The comparison must not be strict pixel equality. Apple auxiliary depth,
browser-decoded RGB, and RGB-predicted monocular depth can differ at object
boundaries, hair, reflective surfaces, textureless regions, transparent objects,
and cropped/rotated display grids.

Recommended comparison:

1. Decode and orient the signed embedded depth/disparity using the existing
   verifier path.
2. Run the RGB image through Depth Pro or the selected browser depth model.
3. Resample both maps into the same display grid.
4. Normalize robustly before comparison:
   - prefer inverse depth or log depth;
   - fit a robust scale/shift using median and percentile statistics;
   - exclude clipped, saturated, and low-confidence edge regions from the fit.
5. Compare surfaces with tolerance instead of single pixels.

The first implementation should treat predicted depth as an inspection depth,
not as a trusted metric ground truth. If Depth Pro focal length and manifest
camera calibration disagree, report that as a warning instead of forcing a hard
failure.

## Collision-Style Matching

Use a small collision volume around each signed depth sample.

For each sampled signed depth point:

1. Project or index the corresponding predicted-depth neighborhood.
2. Search a radius of roughly `1-3px` in image space instead of only the exact
   same pixel.
3. Convert the signed depth and predicted depth into the same comparison space.
4. Give each signed point an axial tolerance band:
   - smaller tolerance on stable interior regions;
   - larger tolerance near discontinuity edges;
   - larger tolerance when the signed depth source is disparity only;
   - larger tolerance where the RGB/depth alignment risk is already high.
5. Mark the point as matched if any predicted-depth surface in the neighborhood
   intersects that tolerance band.
6. Mark the point red only when no acceptable collision is found.

After per-point matching, filter isolated mismatches. The UI should emphasize
connected mismatch regions with meaningful area rather than single noisy points.

## Integration With Current Code

The current verifier already has the right boundary:

- `src/depth/` decodes the embedded HEIF/JPEG auxiliary depth/disparity data.
- `src/geometry/` owns decoded RGB analysis input and Three.js point-cloud
  inspection.
- `crates/tapcam-verifier-wasm/` already builds a sampled signed depth point
  cloud and quality flags.

The new feature should add a separate RGB-predicted-depth analysis module:

- `src/predicted-depth/` for model loading, preprocessing, inference, and
  browser capability checks;
- a WASM or TypeScript comparison layer that accepts signed depth, predicted
  depth, dimensions, orientation, and camera metadata;
- a new risk flag such as `RISK_RGB_DEPTH_MISMATCH`;
- red highlighting in the existing point-cloud/filter UI;
- a summary metric such as mismatch ratio, largest mismatch region, and
  high-confidence mismatch ratio.

The output should be labeled as `RGB-depth consistency warning` or similar. It
should not change local content-binding status or server verification status.

## Implementation Plan

1. Build an offline reference harness using official Depth Pro.
2. Run it against real TAPCam fixtures and save predicted depth outputs for
   repeatable local tests.
3. Implement the collision-style comparison against saved predicted depth first.
4. Add red mismatch overlay and point-cloud risk filtering.
5. Prototype browser inference with a smaller WebGPU depth model.
6. Measure download size, cold-start time, inference time, memory use, and
   failure behavior across Chrome, Edge, Safari, and mobile Safari.
7. Revisit a browser Depth Pro path only if an exported and quantized model is
   small enough for an optional high-accuracy mode.

## Initial Performance Policy

- Do not load any large model automatically on page load.
- Require explicit user action before downloading an ML model.
- Prefer a 384-768 pixel analysis edge for first browser experiments.
- Run inference in a worker where possible.
- Keep the signed verifier path available even when ML inference is unsupported.
- Treat WebGPU absence, model-load failure, or timeout as `unavailable`, not as
  verifier failure.

## Sources

- Apple Depth Pro paper: https://arxiv.org/abs/2410.02073
- Apple Depth Pro repository: https://github.com/apple/ml-depth-pro
- Official Depth Pro checkpoint: https://ml-site.cdn-apple.com/models/depth-pro/depth_pro.pt
- ONNX Runtime WebGPU documentation: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- Transformers.js documentation: https://huggingface.co/docs/transformers.js/index
- Depth Anything V2 paper: https://arxiv.org/abs/2406.09414
