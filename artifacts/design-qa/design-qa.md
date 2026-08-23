# TAPCam landing annotation QA

final result: passed

## Scope

- Hero-to-01 scroll preview begins while the story is pulled into view.
- 01, 02, and 03 panels lock to a viewport-fixed position, hold, and fade in place.
- 03 fades before the 04 / NEXT section.
- Mobile panels maintain a 12 px gap above the visible Safari/progress boundary.
- English hero scrambling uses the selected display font, one stable safe-line width, and layout containment.
- Action heading reads `从现在开始，记录当下。` / `Start now. Capture the moment.`

## Verification

- Desktop panel sampling at 1024 × 768: fixed top remained constant throughout each fade.
- Mobile panel sampling at 393 × 852: fixed top remained constant and the measured boundary gap was approximately 12 px.
- English hero sampling at 393 × 852: the scale was stable across short and long phrases; the following paragraph moved 0 px.
- Reference and implementation were visually compared together at 1152 × 876.
- `npm test`: 48 Rust tests and 100 Vitest tests passed.
- `npm run build`: TypeScript and Vite production build passed.
- `git diff --check`: passed.

## Evidence

- `source-capture-1152x876.png`
- `implementation-capture-fixed-final-1152x876.png`
- `implementation-capture-final-393x852.png`
- `implementation-hero-en-final-393x852.png`
