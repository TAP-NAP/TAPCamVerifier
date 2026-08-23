# Local TAPCam Fixtures

Put real TAPCam-exported HEIC/JPG files, TAPNAP `.tapnap` packages, and legacy
Live Photo verification ZIPs in this directory for local validation.

The repository ignores image files here by default because they are real device
captures. The current local fixture paths are:

- `test/tap-depth-photo.HEIC`
- `test/tap-depth-photo.JPG`
- `test/tap-livephoto-airdrop-raw.HEIC`
- `test/tapcam-live-photo-verification 2.zip`

`tap-livephoto-airdrop-raw.HEIC` is the Live Photo primary photo by itself. It
should pass in the `primaryPhotoFromLivePhoto` scope and warn that the paired
MOV/video bytes were not supplied or verified. `tapcam-live-photo-verification
2.zip` is the legacy full byte-preserving verification package with
`primary-photo.heic`, `paired-video.mov`, and unsigned `tapcam-export.json`.

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
responsibilities. Current tests pin the 16-entry package boundary, raw `mebx`
extraction, and zstd1 decoding; they do not certify native H.264/AAC playback or
LZFSE decoding.
