# TAPCam Verifier design QA

## Round 4 — shared particle-cat timing and discovery aid

### Source and implementation evidence

- Selected source visual: `/Users/harold/.codex/generated_images/01a0070e-4036-7710-816b-592068be33c9/exec-f9bb822b-e4b8-49a6-9638-5408ec9dab1d.png` (`1254 × 1254` pixels).
- Mobile implementation: `/private/tmp/tapcam-particle-cat-qa/design-qa-hero-cat-mobile-random-hold.png` (`393 × 852` CSS and image pixels).
- Mobile excitation transition: `/private/tmp/tapcam-particle-cat-qa/design-qa-hero-cat-mobile-random-hover.png` (`393 × 852` CSS and image pixels).
- 4K implementation: `/private/tmp/tapcam-particle-cat-qa/design-qa-hero-cat-4k-random-hover.png` (`3840 × 2160` CSS and image pixels).
- Same-input focused comparison: `/private/tmp/tapcam-particle-cat-qa/design-qa-hero-cat-comparison.png`. The left side is the selected source and the right side is the live particle implementation crop.
- Four-expression source sheet: `/private/tmp/tapcam-particle-cat-qa/cat-candidates/particle-cat-expression-sheet-v3.png`.
- Four-expression same-input comparison: `/private/tmp/tapcam-particle-cat-qa/design-qa-hero-cat-four-comparison.png`; selected expression sources are on the left and the live shared particle field is on the right.

### Required fidelity surfaces

- Fonts and typography: the cat remains a canvas-only ambient layer. It does not enter layout, change the Hero type metrics, or affect the scramble row's safe width.
- Spacing and layout rhythm: the cat is sized in screen pixels, placed in normalized viewport coordinates, and keeps a square scale at every aspect ratio. New placements exclude the preceding illumination-diameter area. On coarse-pointer layouts, placement candidates also exclude the rendered rectangles of the top bar, Hero wordmark and copy, scroll cue, progress rail, verifier progress, and dropzone copy.
- Colors and visual tokens: source paper, cobalt, coral, and lime points are sampled into the live geometry. The normal ambient opacity is `0.09`; only every seventh unresolved appearance uses the subtle `0.12` hint. Excitation still reaches the established full peak.
- Image quality and asset fidelity: four optimized WebP runtime sources are sampled into real point geometries: smile, sleepy with a larger acid-lime bubble, crying, and the user-selected pouting face. The comparison confirms that ears, eyes, nose, mouth, whiskers, tears, and the sleep bubble remain legible without rendering the rasters themselves.
- Copy and content: no product copy changed in this round.
- Interaction and accessibility: one cat exists globally. It fades in for one second, holds for eight seconds while unexcited, fades out for one second, stays fully off for one second, then moves. Its first B/C excitation may reset the timer once and chooses a weighted `1–8` second hold, concentrated around `4–6` seconds; later excitation in the same appearance cannot reset it again. Expressions are weighted `60%` smile, `15%` sleepy, `10%` crying, and `15%` pouting. Coarse-pointer devices use a `0.9s` click spotlight and never launch a random automatic spotlight. Reduced motion keeps a stable decorative state.

### Comparison findings and history

1. The earlier implementation used one fixed post-excitation hold, so a discovered cat became predictable. The reset now samples a discrete weighted distribution with a `4–6` second majority and a slightly longer mean.
2. Repeated excitation previously needed an explicit lifecycle guard. Each appearance now owns one reset flag; the first qualifying excitation consumes it.
3. A user who misses six consecutive appearances now receives one subtle seventh-appearance hint. The eighth returns to normal, and any excitation immediately clears the missed-appearance counter.
4. The 4K browser measurement reports `hostWidth = canvasWidth = scrollWidth = innerWidth = 3840`; the particle surface therefore fills the window without horizontal overflow.
5. The focused source/implementation comparison has no actionable P0, P1, or P2 shape, aspect-ratio, clipping, or contrast findings.
6. Sliding the Hero away interpolates the normal ambient opacity from `0.09` to the same `0.12` used by the seventh-miss discovery aid, without changing the excitation peak.
7. The automatic mobile spotlight was removed. A click now activates the same circular, screen-space-correct spotlight for `0.9s`.

### Validation

- `npm test`: 48 Rust tests and 117 Vitest tests passed.
- `npm run build`: TypeScript, WASM, and Vite production build passed.
- `git diff --check`: passed.
- Final browser state: `http://127.0.0.1:5173/` at `393 × 852`, marked as the deliverable preview.

final result: passed

## Comparison target

- Source visual truth: `/Users/harold/.codex/generated_images/01a005a6-465e-7fd0-b598-2d5bd1b6763b/exec-f21130fd-6d9a-4e68-8f65-bfd9cbbbf4e1.png` for the empty state, `/Users/harold/.codex/generated_images/01a005a6-465e-7fd0-b598-2d5bd1b6763b/exec-384c53cc-2486-4666-9c50-34aef6edc531.png` for the loaded workbench, plus the later annotated browser requirements that supersede those images.
- Rendered implementation: `http://127.0.0.1:4174/verify/`.
- Empty desktop screenshot: `/private/tmp/tapcam-verifier-desktop-qa-final.png`.
- Empty mobile hover screenshot: `/private/tmp/tapcam-verifier-empty-mobile-hover.png`.
- Unsigned-file confirmation screenshot: `/private/tmp/tapcam-verifier-nosignature-mobile.png`.
- Combined empty-state comparison: `/private/tmp/tapcam-verifier-empty-comparison.jpg`.
- State: dark theme; Chinese locale for visual comparison; empty, particle hover, unsigned-file confirmation, and revealed-analysis states checked.

## Viewport and normalization

- Source empty-state image: 1440 × 1024 pixels.
- Desktop implementation: 1440 × 1024 CSS pixels, captured from the in-app browser at device scale 1. The browser capture surface returned a double-coordinate canvas, so the full captured surface was normalized back to 1440 × 1024 before comparison.
- Mobile implementation: 430 × 932 CSS pixels at device scale 2 for the empty hover and unsigned-file modal checks.
- Responsive bounds: desktop document width 1440 with scroll width 1440; mobile document width 430 with scroll width 430. No horizontal overflow was present.

## Full-view comparison evidence

The combined comparison confirms the selected black, warm-white, acid-lime, coral, and cobalt system; a five-step horizontal verification rail; a centered file action; and the shared compact pill navigation established by the landing page. Later user annotations intentionally remove the mock's left explanatory column and bottom three-step explainer, expand the particle field across the viewport, and keep the upload action centered. These are accepted product decisions rather than fidelity drift.

The loaded-state browser evidence confirms that the 3D projection remains the primary panel, original image and depth remain secondary panels, the duplicate lower replacement dropzone is absent, and replacement is available only from the top file summary.

## Focused-region comparison evidence

- Top navigation: landing and verifier both render `renderTapCamTopbar` and import `topbar.css`. The two routes remain isolated MPA entries, with a progressive cross-document view transition; desktop and mobile bounds were checked without clipping.
- Empty action: the Three.js canvas measures the full viewport, stays pointer-transparent, and produces a brighter raised cluster around the pointer while leaving the file control usable.
- Verification gate: an unsigned JPEG completed local image/depth analysis while `#visualization` remained hidden. The blocking modal showed the missing-signature consequence and an explicit “继续查看分析” action. Only after that action did the analysis become visible.
- Loaded replacement affordance: the top file summary contains no repeated logo, reads “选择其他照片”, accepts file drops, and no `.dropzone--compact` or `.compact-dropzone-slot` remains.

## Required fidelity surfaces

- Fonts and typography: the implementation preserves the landing page's Inter/system display stack and monospaced technical labels. Weight, tracking, hierarchy, wrapping, and mobile truncation were checked at 1440 and 430 CSS pixels.
- Spacing and layout rhythm: the top bar, progress rail, centered action, two-column desktop workbench, and single-column mobile workbench maintain consistent narrow rules and compact spacing. No content collision or horizontal overflow was found.
- Colors and visual tokens: black background, warm-white text, lime action/pass state, coral server/failure state, and cobalt verified/depth state match the selected direction. The rail uses those colors as a functional status gradient.
- Image quality and asset fidelity: the real TAPCam launch logo is used. The empty visual is no longer a raster background; it is a live Three.js particle field as explicitly requested. Loaded 3D points use source RGB pixel colors at constant screen-space point size.
- Copy and content: Chinese and English states are internally coherent. Product terms such as TAPCam, TAP Video, HEIC, RGB, 3D, and App Attest remain untranslated where necessary. Failure copy clearly separates depth analysis from provenance and integrity claims.
- Interaction and accessibility: visible keyboard focus, semantic buttons/links, modal role and focus placement, reduced-motion handling, drag/drop, file chooser, language switch, hover response, and blocking confirmation behavior were checked. The modal cannot be dismissed by clicking its backdrop.

## Comparison history

### Iteration 1 — blocked

- [P1] The empty particle effect was confined to the upload card and moved too subtly.
- [P1] The verifier's first navigation pass drifted from the established landing-bar structure and visual tokens.
- [P1] Failed or missing signatures revealed analysis without an explicit blocking decision.
- [P2] The loaded mobile workbench retained a large second dropzone and repeated the logo in the file summary.
- [P2] Intro motion rotated around the geometry's original coordinate origin, which could appear as translation when the cloud was off-center.

Fixes: moved the particle canvas to a fixed full-viewport layer, increased fluctuation and hover lift, extracted the landing and verifier navigation into one shared top-bar renderer and stylesheet, restored a result-dependent confirmation gate, removed the loaded compact dropzone and repeated logo, and introduced a point-cloud pivot at the filtered geometry bounding-box center.

### Iteration 2 — passed

- Post-fix evidence: desktop and mobile empty states, particle hover, unsigned-file modal, post-confirmation analysis, shared navigation DOM, responsive bounds, and console output were rechecked.
- No actionable P0, P1, or P2 findings remain.

## Primary interactions tested

- Choose-file flow with an unsigned JPEG.
- Missing-signature modal blocks analysis and requires explicit continuation.
- Analysis becomes visible after confirmation and retains locally parsed media/depth outcomes.
- Full-screen particle hover highlight.
- Chinese-to-English language switch.
- Replacement button and drag target presence in the loaded file summary.
- Desktop and mobile responsive layout.
- Browser console checked: no warnings or errors.

## Follow-up polish

- [P3] Re-evaluate particle density on low-power mobile hardware after device testing; reduced-motion behavior is already present.
- [P3] Validate the final loaded workbench with additional real signed TAPCam photo and TAP Video samples across very wide and very tall aspect ratios.

final result: passed

---

# Landing and verifier annotations round 3 design QA

## Source and implementation evidence

- Source Hero: `/Users/harold/TAPCamVerifier/artifacts/design-qa/round-3-source-hero-en-393x852.png`.
- Implementation Hero: `/Users/harold/TAPCamVerifier/artifacts/design-qa/round-3-implementation-hero-en-393x852.png`.
- Source verifier empty state: `/Users/harold/TAPCamVerifier/artifacts/design-qa/round-3-source-verify-en-393x852.png`.
- Implementation verifier empty state: `/Users/harold/TAPCamVerifier/artifacts/design-qa/round-3-implementation-verify-en-393x852.png`.
- Additional implementation states: `/Users/harold/TAPCamVerifier/artifacts/design-qa/round-3-implementation-capture-393x852.png` and `/Users/harold/TAPCamVerifier/artifacts/design-qa/round-3-implementation-action-docs-393x852.png`.
- All captures are `393 x 852` CSS pixels and `393 x 852` PNG pixels in the in-app browser. Hero source and implementation were compared at the same English `VERIFIABLE MOMENTS` resolved state; verifier source and implementation were compared at the same empty English state. Both pairs were emitted together in one comparison input.

## Required fidelity surfaces

- Fonts and typography: the established display and monospaced stacks, weights, tracking, line breaks, and uppercase treatment are unchanged. During the live scramble, the measured safe capacity was ten glyphs at a `353px` line width; the document stayed exactly `393px` wide.
- Spacing and layout rhythm: the empty verifier progress rail now contributes no height. In the loaded state, the compact `RESULT` label ends after the server label with a measured gap and no overlap. The Capture panel ends `11.72px` above the stable progress-band top.
- Colors and visual tokens: Hero particles reuse the verifier's muted olive/warm-white field and lime hover highlight. Action cards preserve lime, coral, and cobalt while interpolating fill, text, index, and arrow colors over `320ms` with the same easing.
- Image quality and asset fidelity: no raster placeholder was introduced. The Hero uses the existing WebGL particle language; two low-opacity particle cats periodically resolve and brighten locally under pointer or touch proximity.
- Copy and content: no product copy was changed in this round. The mobile verifier visually shortens only the last progress label to `RESULT` or `结果`; the full localized text remains in the DOM and accessibility tree.
- Interaction and accessibility: the scramble layer is absolutely positioned inside a strict contained row, so intermediate glyphs cannot resize ancestors. Reduced motion remains honored. The empty progress rail is hidden with the native `hidden` state. Pointer and touch events reveal the particle easter eggs without capturing input.

## Comparison history

### Iteration 1 — needs changes

- [P1] The English scramble could exceed its line and change the document width during a transition.
- [P1] Capture and Sign panels had independent opacity timelines, allowing Sign to become fixed before Capture had fully released on iPhone.
- [P1] The progress rail followed Safari's changing visual viewport, causing panel-top jitter and repeated boundary calculations.
- [P2] The verifier showed a progress rail before any file was selected, and its final two mobile labels overlapped.
- [P2] Action-card fill and text colors snapped rather than interpolating.

Fixes: isolated the Hero value in a strict fixed-size row, measured the widest scramble glyph and capped the live frame with one-glyph reserve, added an explicit mutually exclusive entry gate for each incoming chapter, anchored the mobile progress rail to the stable `svh/lvh` Safari band and aligned panels to its rendered top, hid idle verification progress, supplied a compact final label, and unified card color transitions.

### Iteration 2 — passed

- Same-state Hero comparison preserves the exact typography and spacing while adding only the requested particle layer.
- Live scramble evidence measured `glyphCount = 10`, `scrollWidth = innerWidth = 393`, and no width jump.
- Capture-to-Sign sampling found zero simultaneously visible panels and zero geometric overlaps.
- The mobile progress band measured `790.40px` from the top and `61.59px` high in the fallback viewport, ending exactly at `852px`; the Capture panel retained its `12px` design gap.
- Empty verifier comparison confirms the rail is absent. Loaded-state metrics show `RESULT` at `31.21px` wide with no overlap against `SERVER BOUNDARY`.
- The active Docs card uses cobalt fill and black foreground; computed transition duration is `0.32s` for background, foreground, and border.
- No actionable P0, P1, or P2 findings remain.

## Validation

- `npm test`: 48 Rust tests and 102 Vitest tests passed.
- `npm run build`: TypeScript and Vite production build passed.
- `git diff --check`: passed.

## Follow-up acceptance boundary

- [P3] The `svh/lvh` band intentionally allows expanded Safari chrome to cover the progress rail. The in-app browser verifies fallback geometry and stable panel alignment; final physical-Safari toolbar acceptance remains a device check.

final result: passed

---

# Landing annotations round 2 design QA

## Source and implementation evidence

- Source screenshots: `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/source-capture-1152x876.png`, `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/source-sign-1152x876.png`, and `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/source-verify-1152x876.png`.
- Implementation screenshots: `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/implementation-capture-1152x876.png`, `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/implementation-sign-final-1152x876.png`, `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/implementation-verify-empty-1152x876.png`, `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/implementation-hero-mobile-430x932.png`, `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/implementation-hero-en-mobile-430x932.png`, `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/implementation-sign-mobile-final-c.png`, `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/implementation-sign-mobile-final-d.png`, `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/implementation-privacy-mobile-430x932.png`, and `/Users/harold/TAPCamVerifier/artifacts/design-qa/annotations-round-2/implementation-depth-legend-mobile-430x932.png`.
- Source and implementation pairs for Capture, Bind & Sign, and Verifier empty state were emitted together in one in-app-browser comparison input and judged at the same `1152 × 876` viewport.
- Mobile states were checked at `430 × 932` CSS pixels. Desktop states were checked at `1152 × 876` CSS pixels. Captured PNG pixel dimensions matched the CSS viewport dimensions.
- States: Chinese Capture, Chinese Bind & Sign at two rotation frames, Chinese Open Verification, verifier empty state, Chinese mobile hero, English mobile hero, and a verifier-style depth legend probe.

## Required fidelity surfaces

- Fonts and typography: existing TAPCam display and monospaced technical styles remain unchanged. The English scramble value stayed inside its `390px` row safe boundary (`value.right = 278.86`, `row.right = 410`) and did not resize or move neighboring lines.
- Spacing and layout rhythm: the mobile hero body ended at `793.41px`; the scroll cue began at `809.41px`, leaving a measured `16px` gap with zero overlap. Capture labels use live projected image-plane bounds, so the RGB label sits outside the image rather than over it. The mobile chapter panel remains above the progress rail with a small fixed gap.
- Colors and visual tokens: the four Bind & Sign payload layers preserve paper, lime, cobalt, and coral. The depth legend now renders the full blue, cyan, green, yellow, orange, and red range, with computed stops from `rgb(0, 38, 255)` through `rgb(255, 38, 0)`.
- Image quality and asset fidelity: no new raster assets were introduced. The verifier dropzone's repeated logo was removed. WebGL point density remains crisp at both viewports; the four payload objects are single point planes rather than doubled box faces.
- Copy and content: the Sign body now says that image data, depth data, and verifiable credentials are bound together while retaining the App Attest context and verification boundary. Chinese and English strings were updated together and covered by locale tests.
- Interaction and motion: Capture depth-bloom travel is one third of its previous horizontal distance. The four rectangular layers converge, retain visible spacing, are encircled by a ring slightly longer than the rectangle's long side, and rotate as one assembly; the center sphere is gone. Chapter copies use fixed positioning with device-pixel-rounded top coordinates and a shared opacity timeline, including Open Verification. Progress-link animation remains `2500ms`.

## Comparison history

### Iteration 1 — needs changes

- [P1] Bind & Sign used square, two-faced box geometry, making each color read as two layers and making the mobile assembly too small.
- [P1] The ring and payload layers did not consistently reveal all four colors during rotation.
- [P2] The RGB callout used an estimated center box and could overlap the image after the WebGL plane moved.
- [P2] The verifier dropzone repeated the TAPCam logo.
- [P2] The depth legend omitted the cyan, green, orange, and red portions visible in the depth canvas.
- [P2] The mobile hero scroll cue was viewport-positioned rather than anchored after the body copy.

Fixes: replaced signing boxes with four single point planes sized as vertical rectangles, added separated depth layers and a permanently tilted rotating assembly, enlarged the binding ring relative to the rectangle's long side, projected live RGB/depth plane corners for callout layout, removed the repeated verifier logo, expanded the depth legend gradient, and placed the mobile scroll cue in hero-copy flow.

### Iteration 2 — passed

- Same-input comparison confirms the Capture bloom stays near its source plane and the RGB label clears the image.
- Bind & Sign now reads as four colored layers bound by a larger ring; two frames confirm the assembly rotates rather than remaining a flat composition.
- Desktop and mobile dimensions preserve the same object logic; only the scene scale changes.
- Verifier empty-state comparison confirms the dropzone logo is absent while the centered action remains intact.
- Mobile geometry confirms the hero cue has no copy overlap, the English scramble respects its row boundary, and the Open Verification panel sits above the progress rail.
- No actionable P0, P1, or P2 findings remain.

## Validation

- `npm test`: 48 Rust tests and 100 Vitest tests passed.
- `npm run build`: TypeScript and Vite production build passed.
- `git diff --check`: passed.

## Follow-up polish

- [P3] Confirm WebGL point density and the fixed panel's Safari toolbar gap on the user's physical iPhone; browser viewport evidence is complete, but physical-device acceptance remains separate.

final result: passed

---

# TAPCam hero scramble design QA

## Evidence

- Source visual truth: `/Users/harold/.codex/generated_images/01a006cc-6e53-7df1-a56f-fec4ef3f3564/exec-11ac75ca-6341-4877-9a51-8af86366afdf.png`
- Implementation screenshot: `/Users/harold/.codex/worktrees/eb49/TAPCamVerifier/implementation-hero.png`
- Mobile implementation screenshot: `/Users/harold/.codex/worktrees/eb49/TAPCamVerifier/implementation-hero-mobile.png`
- Side-by-side comparison: `/Users/harold/.codex/worktrees/eb49/TAPCamVerifier/design-qa-comparison.png`
- Desktop viewport and pixels: `1438 x 1094` CSS px at density 1; source and implementation are both `1438 x 1094` pixels.
- Mobile viewport and pixels: `390 x 844` CSS px at density 1; implementation is `390 x 844` pixels.
- State: Chinese locale, intro route, initial resolved phrase captured immediately after a fresh page load.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: the implementation preserves the existing Inter / PingFang / system fallback stack, heavy display weight, compact line height, and monospace technical accents. The selected ImageGen result is an illustrative font reference rather than a distributable font source; the implementation keeps the product's real type system while matching its hierarchy.
- Spacing and layout rhythm: the headline width, two-line desktop composition, lower-left alignment, variable-copy slot, body-copy offset, and bottom progress rail match the selected direction. The desktop page has no horizontal overflow (`bodyScrollWidth = 1438`).
- Colors and tokens: black, paper white, lime, coral, and cobalt continue to use the existing TAPCam CSS tokens. The variable phrase and scramble glyphs use the existing lime token.
- Image quality and asset fidelity: the existing TAPCam logo asset is preserved. The selected direction contains no new raster imagery, illustration, or icon asset that needs replacement.
- Copy and content: the user annotations supersede the selected visual for the headline treatment. The fixed Chinese line is `在 AI 时代，记录`; the cycle contains all 20 combinations of `我们的 / 真实的 / 不可篡改的 / 可验的` with `生活 / 影像 / 新闻 / 回忆 / 瞬间`; and both square brackets are removed. Existing localized body copy and navigation are intentionally preserved rather than copying the mock's English placeholders.
- Interaction: a fresh page always begins at `我们的生活`. The locale switch, 4.4-second hold, 760-ms scramble/decode transition, scrambled phrase state, and resolved phrase state were exercised in the browser. The first transition contained scrambled glyph states and subsequently resolved to `真实的新闻`. No browser console errors were present.
- Responsive behavior: at `390 x 844`, the fixed lead breaks at the intended semantic boundary, the lime variable phrase remains on one line, and `bodyScrollWidth` equals the viewport width.

## Comparison history

1. First same-size comparison found a P2 hierarchy mismatch: the Chinese headline was too small and sat lower than the selected visual. The hero copy width increased from `1060px` to `1120px`, the heading width increased from `1000px` to `1120px`, and the Chinese display size increased to `clamp(3rem, 7.5vw, 7.4rem)`.
2. The next desktop comparison removed the scale mismatch. Mobile capture then found a P2 orphaned final character in the fixed lead. The lead was split at the semantic boundary between `在 AI 时代，` and `记录下我们` for narrow viewports.
3. Browser annotations then changed the fixed phrase to `记录`, added `我们的` as the first descriptor, removed the brackets, changed the variable phrase to lime, and doubled the resolved hold interval from 2.2 to 4.4 seconds.
4. Final desktop and mobile captures verify the annotated direction, including the deterministic `我们的生活` first frame, with no actionable P0/P1/P2 differences or overflow.

## Focused comparison

A separate crop was not required: the normalized `1438 x 1094` side-by-side image keeps the full hero headline, glyph treatment, navigation, body copy, and progress rail readable at the same scale. The mobile screenshot separately verifies the only responsive typography risk.

## Follow-up polish

- P3: the exact random glyph shown at any instant intentionally varies from the static concept frame; this is the behavior being designed, not fidelity drift.

final result: passed

---

# Landing scroll transition round 4 design QA

## Design intent

- `00 → 01` is a three-part scroll transition on mobile: the cover opens and the Capture scene reaches its expected position; the empty Capture copy panel then pulls upward; only after the panel reaches its destination do its labels and body copy fade in.
- The Capture panel keeps the same whole-panel fade-out behavior used by the other story panels after it is established.
- `01 → 02` receives a dedicated, longer scroll runway because it carries more simultaneous scene motion. The Sign and Privacy chapter spans are unchanged.

## Implementation evidence

- The mobile Capture scene preview completes at entrance progress `0.72`. Panel lift runs from `0.72` to `0.90`, and panel content fades from `0.90` to `1.00`.
- The panel shell uses a scroll-linked `translateY` offset of up to `22%` of the stable viewport height. Child content has an independent opacity channel, so the shell is visibly pulled into place without prematurely revealing labels.
- The Capture chapter span increases from `130svh` to `158svh` on desktop and from `115svh` to `140svh` on mobile. This adds physical scroll distance only before the Sign chapter while geometry-derived chapter anchors continue to drive the animation timeline.
- Existing baseline captures remain available under `/Users/harold/TAPCamVerifier/artifacts/product-design-audit/2026-08-16-scroll-timing/`, including `11-mobile-after-visual-first.png` and `12-mobile-after-copy.png`.

## Automated validation

- TypeScript typecheck passed.
- `48` Rust tests and `119` Vitest tests passed.
- Production build passed.
- `git diff --check` passed.

## Browser comparison status

- Intended QA viewport: `390 × 844` CSS pixels.
- The in-app browser's URL policy blocked DOM and screenshot access to the current local preview at `http://127.0.0.1:5173/` after the implementation reload.
- Because no current same-state implementation screenshots could be captured and combined with the baseline evidence, this round cannot honestly receive a visual pass. Physical iPhone Safari behavior also remains an owner/device acceptance check.

final result: blocked
