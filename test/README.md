# Local TAPCam Fixtures

Put real TAPCam-exported HEIC/JPG files and current TAPNAP `.tapnap` packages in
this directory for local validation.

The repository ignores media files here because they are physical-device
captures. Fixture-backed tests report as skipped when their required file is
absent; a skip is not current schema, device, or backend acceptance evidence.
The current local fixture paths are:

- `test/tap-depth-photo.HEIC`
- `test/tap-depth-photo.JPG`
- `test/tap-livephoto-airdrop-raw.HEIC`

The HEIC/JPG fixtures protect byte decoding and auxiliary-depth extraction.
They may carry a superseded development proof schema and must not be cited as a
successful current v1 verification artifact.

`tap-livephoto-airdrop-raw.HEIC` is the Live Photo primary photo by itself.

New exports use `TAPNAP-Capture.tapnap` with MIME
`application/vnd.tapnap.capture-package+zip` and a ZIP-compatible entry
layout. A Still Photo package contains only `primary-photo.heic` or
`primary-photo.jpg` plus `tapcam-export.json`; a Live Photo package also
contains `paired-video.mov`. The sidecar remains an unsigned resource index and
must not be used as verification evidence, but a valid current-v1 sidecar is
required to resolve a `.tapnap` package.

Current `.tapnap` MIME, layout, sidecar roles, and rejection rules live in the
shared [transport contract](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/transport/tapnap-v1.md).
Synthetic package shapes and rejection cases live in the shared
[examples index](https://github.com/TAP-NAP/TAPArtifactContracts/blob/ca3b223e0717242ce1016b34dc34f04ef2417936/examples/README.md).

## Executable Contract Mirrors

[`src/video/tapVideo.test.ts`](../src/video/tapVideo.test.ts) intentionally keeps
literal KLV/zstd bytes and display-transform cases as hermetic executable mirrors
of the shared [exact vectors](https://github.com/TAP-NAP/TAPArtifactContracts/tree/ca3b223e0717242ce1016b34dc34f04ef2417936/examples/vectors).
Adoption review must compare the KLV/zstd mirror with the canonical JSON whose
SHA-256 is `e0d4d2d0d5f199ec942d4b1b7a93c945021cab912418422924faaa43c1fe2cd7`;
the local copy is not a second authority.

Ignored device captures and synthetic Rust fixtures remain local executable
evidence. They do not replace a complete cross-implementation Still/Live golden
vector covering high-precision numbers, Unicode, omission, full content digest,
and signing binding.

Consumer limits in the [root README](../README.md) remain local regression
responsibilities. Current tests pin the 16-entry package boundary, exact
`mebx`/KLV semantics, zstd1 decoding, and the fixed LZFSE vector through the
real Rust decoder. They do not certify native H.264/AAC playback.
