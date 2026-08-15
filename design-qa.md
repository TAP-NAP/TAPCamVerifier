# TAPCam Landing Design QA

## Comparison setup

- Source visual truth:
  - `/Users/harold/.codex/generated_images/01a00467-edbd-7381-948f-0db43cc079c5/exec-8c135a64-bdb4-4686-84d5-9955043376e5.png` — 862 × 1824 px.
  - `/Users/harold/.codex/generated_images/01a00467-edbd-7381-948f-0db43cc079c5/exec-af756c29-44b5-4c97-a56f-36446346c563.png` — 864 × 1821 px.
  - `/Users/harold/.codex/generated_images/01a00467-edbd-7381-948f-0db43cc079c5/exec-e36852a0-aa4f-42ea-b5a6-8b4d1580bd06.png` — 864 × 1821 px.
- Rendered implementation: `http://127.0.0.1:4173/` from the production Vite build.
- Desktop evidence: `Docs/Assets/LandingQA/desktop-{hero,capture,sign,privacy,actions}.jpg`.
- Mobile evidence: `Docs/Assets/LandingQA/mobile-{hero,capture,sign,privacy,actions}.jpg`.
- Full-view comparison evidence: `Docs/Assets/LandingQA/reference-comparison.png`.
- Viewports and normalization:
  - Desktop: 1440 × 900 CSS px; screenshot output 1440 × 900 px.
  - Mobile: 390 × 844 CSS px; screenshot output 390 × 844 px.
  - Browser viewport override produced one output pixel per CSS pixel. The tall source concepts are not same-state full-page specifications, so the user-selected source regions were aspect-fitted without stretching into 700 × 440 cells beside same-size implementation captures. The final contact sheet is 1400 × 1320 px.
- States: black hero; capture scene; bound-and-signed package; open verification/privacy scene; final Download / Verify / Technology links; mobile equivalents.

## Findings

No actionable P0, P1, or P2 findings remain.

- [P3] The camera is a deliberate point-cloud concept model, not a scan-accurate TAPCam hardware mesh.
  - Location: capture scene in `src/landingScene.ts`.
  - Evidence: the references use a stylized camera/product object; the implementation uses two explicit point-cloud camera modules because no production camera mesh was supplied.
  - Impact: the intended stereo-capture relationship is clear, but future marketing work could make the hardware silhouette more proprietary.
  - Follow-up: replace only the camera modules with an approved GLB/GLTF asset when one exists; retain the current scroll lifecycle and photo/depth layout.

## Required fidelity surfaces

- Fonts and typography: the implementation preserves the references' oversized Chinese display type, condensed monospace metadata, hard line breaks, and high-contrast hierarchy. Desktop and mobile wraps were inspected; no clipping or orphaned wordmark remains.
- Spacing and layout rhythm: hero, three long sticky chapters, and the horizontal final links follow the selected order. The desktop comparison keeps the subject right, twin camera modules centered, and photo/depth output left. Mobile collapses only the final link row and keeps all scene labels and copy readable.
- Colors and tokens: black background is continuous. Warm white, lime, coral, and bright cobalt reproduce the young technical palette; cobalt was raised to `#5e78ff` for small-text contrast. There are no generic rounded cards, glass surfaces, or decorative gradients.
- Image quality and asset fidelity: the real `launch_logo.png` asset is used for the brand. The point-cloud scene is live WebGL at capped device pixel ratio rather than a raster placeholder. The source concepts provide composition and motion direction rather than a production hardware asset; that intentional limitation is recorded as P3 above.
- Copy and content: the hero explicitly states the post-capture verification problem and TAPCam's role. Current local checks and the server verification boundary are distinguished from decentralized verification and zero-knowledge privacy proofs, which are labeled R&D/future work.
- Accessibility and interaction: skip link, semantic headings/links, visible focus treatments, reduced-motion handling, mobile tap targets, WebGL fallback, and context restore paths were checked. The Verify link was activated and reached `/verify/`; the existing file-drop verifier mounted successfully.

## Focused region comparison

Focused evidence was required because the tall source boards mix several states. `reference-comparison.png` places the user's selected exploded/depth regions beside the desktop capture state, and the selected horizontal footer region beside the final action row. Individual desktop and mobile captures were also inspected at readable scale for typography, contrast, and wrapping.

## Comparison history

### Pass 1 — blocked

Earlier findings from the first browser-rendered inspection:

- P1: near-viewport preloading also activated a hidden 60 fps scene on the hero.
- P1: the mobile logo lockup could overflow at 320–390 px.
- P1: sticky minimum height and progress geometry diverged on short viewports.
- P1: the sign state faded before the seal animation had a readable hold.
- P1: WebGL restore and bfcache return paths could leave a hidden or disposed scene.
- P1: the original cobalt token was too dark for small metadata text.
- P2: the hero described TAPCam but did not state the verification problem directly.
- P2: the depth plane lacked the selected photo-to-point-cloud expansion cue.

Fixes made:

- Split scene preloading from true viewport activation.
- Stacked and resized the mobile brand lockup; removed sticky minimum-height drift.
- Added a completed-signature hold, context restore event, and persisted page lifecycle handling.
- Raised cobalt to `#5e78ff`, increased the smallest metadata sizes, and added an explicit problem statement.
- Added a live depth-bloom point cloud that expands from the depth output.
- Rebalanced scene scale and camera distance independently for desktop and mobile.

Post-fix evidence: all files under `Docs/Assets/LandingQA/`, especially `desktop-capture.jpg`, `desktop-sign.jpg`, `mobile-capture.jpg`, and `mobile-sign.jpg`.

### Pass 2 — passed

The normalized source/implementation contact sheet and focused desktop/mobile captures show no remaining P0/P1/P2 difference. The remaining hardware-model fidelity gap is non-blocking P3 because no approved production mesh exists.

## Primary checks

- Production routes: `/` 200; `/verify/` 200; `/wasm/tapcam_verifier_wasm.wasm` 200 with `application/wasm`.
- Browser console: no error-level entries on the production landing or verifier routes.
- Responsive checks: 1440 × 900 and 390 × 844; no horizontal overflow at mobile width.
- Automated checks: 48 Rust tests and 67 Vitest tests passed; TypeScript and Vite production build passed.

## Implementation checklist

- [x] Black introductory hero with logo and explicit problem/solution copy.
- [x] Stereo capture composition: outputs left, two capture modules center, subject right.
- [x] Scroll-driven bind/sign animation with completed signature state.
- [x] Open verification and privacy/R&D boundaries represented accurately.
- [x] Horizontal Download / Verify / Technology destinations.
- [x] Existing verifier isolated at `/verify/` and production WASM path verified.

## Open questions

- Non-blocking: provide an approved TAPCam camera GLB/GLTF later if the marketing scene should match final industrial design rather than the current point-cloud concept.

## Follow-up polish

- Replace the conceptual camera modules when production hardware geometry becomes available.

final result: passed
