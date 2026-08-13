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

New exports use `TAPNAP-Capture.tapnap` with MIME
`application/vnd.tapnap.capture-package+zip` and the same ZIP-compatible entry
layout. A Still Photo package contains only `primary-photo.heic` or
`primary-photo.jpg` plus `tapcam-export.json`; a Live Photo package also
contains `paired-video.mov`. The sidecar remains an unsigned resource index and
must not be used as verification evidence.
