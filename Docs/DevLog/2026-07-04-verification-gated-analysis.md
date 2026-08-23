# 2026-07-04 Verification-Gated Analysis AI Trace

## Conversation Record

The drag/drop flow should verify the selected capture before showing original,
depth, or 3D geometry analysis panes. A valid TAPCam signature should first show
`照片验签通过` and `该照片由 TAPCam 拍摄`; the short confirmation state gives the
analysis pipeline a buffer without making the user wait unnecessarily. If the
user clicks anywhere on the page during that state, the page should start
analysis immediately instead of waiting for the automatic transition.

For invalid signatures, the page should not auto-advance into analysis. It
should show `这张照片不是由 TAPCam 拍摄`, ask `还要继续进行分析吗？`, and let the
user choose `是` or `否`.

## Implemented Direction

- Moved original/depth/geometry panel creation behind the combined verification
  result.
- Added a valid confirmation dialog that auto-advances after about 1.5 seconds
  and can be skipped by clicking anywhere on the page.
- Added an invalid analysis prompt with `是` and `否` actions. Choosing `是`
  starts the existing downstream analysis path; choosing `否` keeps analysis
  stopped.
- Kept detailed verification diagnostics available under `验签细节` for invalid
  files.
- Left the base verifier semantics unchanged: visual analysis is still
  downstream evidence and does not change `valid` / `invalid`.

## Boundary

This is a verifier UI sequencing change. It does not change Rust/WASM
content-binding checks, server verification payloads, depth decoding, or
point-cloud generation.
