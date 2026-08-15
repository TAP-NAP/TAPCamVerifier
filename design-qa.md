# TAPCam Verifier design QA

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
