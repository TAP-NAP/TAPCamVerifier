# TAPCam Landing Design QA

## Comparison setup

- Source visual truth:
  - `/Users/harold/.codex/generated_images/01a00467-edbd-7381-948f-0db43cc079c5/exec-8c135a64-bdb4-4686-84d5-9955043376e5.png` — 862 × 1824 px.
  - `/Users/harold/.codex/generated_images/01a00467-edbd-7381-948f-0db43cc079c5/exec-af756c29-44b5-4c97-a56f-36446346c563.png` — 864 × 1821 px.
  - `/Users/harold/.codex/generated_images/01a00467-edbd-7381-948f-0db43cc079c5/exec-e36852a0-aa4f-42ea-b5a6-8b4d1580bd06.png` — 864 × 1821 px.
  - `/private/var/folders/hw/p2sd7bcx3j5g6km12ml617600000gn/T/codex-clipboard-8b84b2d3-ad56-49b6-a5ae-5fc899a650a4.png` — persistent top-bar reference.
- Rendered implementation: `http://127.0.0.1:4173/` from the production Vite build.
- Desktop evidence: `Docs/Assets/LandingQA/desktop-{hero,capture,sign,privacy,actions}.jpg`.
- Mobile evidence: `Docs/Assets/LandingQA/mobile-{hero,capture,sign,privacy,actions}.jpg`.
- Full-view comparison evidence: `Docs/Assets/LandingQA/reference-comparison.png`.
- Navigation iteration evidence: `Docs/Assets/LandingQA/desktop-{hero-nav,capture-navigation}-v2.png`.
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
- Accessibility and interaction: skip link, semantic headings/links, visible focus treatments, a polite chapter status announcement that preserves keyboard focus in the progress navigation, reduced-motion presentation frames, mobile tap targets, WebGL fallback, and context restore paths were checked. The Verify link was activated and reached `/verify/`; the existing file-drop verifier mounted successfully.
- Semantic chapter navigation: each bottom node lands after that chapter's intro motion, with the explanatory panel visible rather than at the chapter's raw DOM start. The active progress line is quantized to the five node centers. Desktop measurements put the active-dot/line-end error between `0.006` and `0.015` CSS px.
- Moving annotations: RGB, depth, spatial-camera, and real-world-subject callouts are projected from their live Three.js targets every frame. Their opacity measured `0` during the early move, approximately `0.384` mid-transition, and `1` at the Capture presentation state; the two-segment leaders use obtuse bends.
- Panel alignment: Capture, Bind & Sign, and Open Verification presentation states place the copy top at approximately `64%` of the viewport when the panel fits. Desktop measurements were `63.98%`, `64.01%`, and `63.99%`; a short `1910 × 1075` desktop check placed all three at `64.00%`. Every panel remained fully visible above the fixed progress navigation. The same calculation moves taller copy upward as a hard bottom-clearance constraint; an English Open Verification check at the requested `320 × 568` override remained clear of both the top bar and progress navigation.

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

### Pass 3 — blocked

The first persistent-navigation iteration exposed four interaction mismatches:

- Chapter links targeted each article's DOM start instead of the moment its intro animation and explanatory copy had settled.
- The progress fill tracked continuous document progress rather than terminating at the active node center.
- Capture callouts were fixed overlays, so their leaders separated from the moving Three.js objects.
- Capture and Bind & Sign copy settled too high and obscured the scene compared with Open Verification.

Fixes made:

- Added semantic presentation points for all five navigation nodes and aligned initial hash loads to the same points.
- Temporarily disabled CSS smooth scrolling during the controlled node animation so landing is deterministic.
- Quantized the fill to `0 / 0.25 / 0.5 / 0.75 / 1` and corrected desktop/mobile rail endpoints.
- Projected callout anchors from live 3D world positions, added progressive opacity, and replaced right-angle leaders with obtuse two-segment leaders.
- Completed the Capture object's intro transform at a shared `0.10` semantic presentation frame, before every responsive node target, then held the settled composition until its exit begins. Bind & Sign and reduced-motion rendering use the same shared presentation-frame contract.
- Unified the three chapter panels around a `64%` viewport-top presentation position while preserving a safe gap above the progress bar.

### Pass 4 — passed

Final browser inspection covered all five node destinations, moving and settled Capture states, initial and same-document hash navigation, Chinese and English copy, desktop and mobile layouts, viewport changes while a node was aligned, and the isolated verifier route. Capture, Bind & Sign, and Open Verification all landed with the expected stage active and their copy fully visible. All four mobile callout labels remained inside the scene after their leader directions were adapted for the narrow layout. No horizontal overflow or browser error-level console entries were found. The browser screenshot compositor produced duplicated tiles in one capture attempt, so that artifact was excluded from layout findings; DOM geometry and the clean saved comparison captures were used instead.

## Primary checks

- Production routes: `/` 200; `/verify/` 200; `/wasm/tapcam_verifier_wasm.wasm` 200 with `application/wasm`.
- Browser console: no error-level entries on the production landing or verifier routes.
- Responsive checks: 1440 × 900 and 390 × 844; no horizontal overflow at mobile width.
- Automated checks: 48 Rust tests and 77 Vitest tests passed; TypeScript and Vite production build passed.

## Implementation checklist

- [x] Black introductory hero with logo and explicit problem/solution copy.
- [x] Stereo capture composition: outputs left, two capture modules center, subject right.
- [x] Scroll-driven bind/sign animation with completed signature state.
- [x] Open verification and privacy/R&D boundaries represented accurately.
- [x] Persistent top navigation and bilingual landing copy.
- [x] Five semantic bottom nodes with center-aligned progress fill.
- [x] Live projected Capture callouts with progressive reveal and obtuse leaders.
- [x] Capture, Bind & Sign, and Open Verification copy aligned to the same stable viewport height.
- [x] Horizontal Download / Verify / Technology destinations.
- [x] Existing verifier isolated at `/verify/` and production WASM path verified.

## Open questions

- Non-blocking: provide an approved TAPCam camera GLB/GLTF later if the marketing scene should match final industrial design rather than the current point-cloud concept.

## Follow-up polish

- Replace the conceptual camera modules when production hardware geometry becomes available.

final result: passed
