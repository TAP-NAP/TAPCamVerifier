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
