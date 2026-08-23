# 2026-06-23 Depth Visualization Roadmap

## Conversation Record

The verifier needs to become visually inspectable after a user selects or drops a
capture. The page should show the selected original image, show the embedded
depth/disparity data next to it, and place the pass/fail result below the visual
comparison.

The existing local content-binding verifier remains the base trust gate. The
decoded RGB/depth visualization is downstream evidence for inspection and future
geometry analysis; it must not change the meaning of local `valid` or `invalid`.

## Implemented Direction

- The left pane first uses a browser object URL for the selected original file.
- If native browser preview cannot render HEIC, the left pane falls back to
  `libheif-js` WASM primary-image decode, then sends the decoded RGBA plane to
  Rust/WASM for browser-sized preview downscaling. The fallback preserves the
  decoder's display-oriented pixel axis so portrait captures remain portrait in
  the page.
- The right pane decodes the embedded HEIF auxiliary depth/disparity item through
  a browser HEIF backend, then sends the luma plane to Rust/WASM.
- Rust/WASM parses TAP and Apple depth metadata, normalizes the plane, and
  returns RGBA preview pixels for a canvas. When the original pane exposes a
  display reference, depth follows that webpage display direction so the two
  panes share portrait/landscape orientation.
- Detailed local checks render under a collapsed disclosure below the visible
  local summary.

## Roadmap Captured From Discussion

- Direction 1: run RGB data through 3D Gaussian Splatting, derive a reconstructed
  depth field, and compare it with the embedded depth to detect whether the image
  likely came from a real scene.
- Direction 2: render the embedded depth itself as a 3D model with RGB pixels
  projected as texture, allowing small orbit and translation controls so users can
  inspect the scene geometry.
- Both directions must stay separate from the C2PA-style hard-binding verifier.
  Geometry checks can add confidence or flag suspicious captures, but they should
  not replace the format-native byte binding and App Attest verification path.
