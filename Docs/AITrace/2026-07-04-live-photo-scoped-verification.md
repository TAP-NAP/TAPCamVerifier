# Live Photo Scoped Verification

Date: 2026-07-04

## Context

TAPCamDemo Live Photo captures sign the primary HEIC/JPG, canonical TAP manifest
payload, and paired `paired-video.mov` descriptor under
`urn:tapnap:tapcam:content-binding:v3`. The App Attest proof and signing binding
live in the primary photo's TAP proof slot.

Transport can lose the paired MOV. AirDrop or other share paths may leave only
the Live Photo primary HEIC/JPG, even though the primary photo still carries a
valid TAP proof for the original Live Photo content binding.

## Decision

The verifier supports scoped Live Photo verification:

- `fullLivePhoto`: primary photo, manifest payload, paired MOV, embedded content
  digest, signing binding, and server App Attest verification all pass.
- `primaryPhotoFromLivePhoto`: primary photo, manifest payload, embedded v3
  content digest descriptor set, signing binding, and server App Attest
  verification pass, but the paired MOV is not verified because it is missing or
  does not match.

The verifier must not reclassify a Live Photo primary HEIC/JPG as a still photo.
It remains `mediaKind: livePhoto`; only `verificationScope` changes.

## Unsupported Scope

MOV-only verification is not supported by the current protocol. The MOV does not
carry the TAP proof slot, manifest payload, App Attest assertion object, key id,
or signing binding. A future detached-resource proof would be required before a
paired video can verify by itself.

## UI Requirements

The UI may show `valid` when either full Live Photo verification or primary-only
Live Photo verification passes server App Attest verification. Analysis and
verification run as independent async paths, but the visual panes are revealed
only after the valid-signature modal is shown and then dismissed. It must also
show which scope was verified:

- full Live Photo: paired video matched and was verified.
- primary-only: paired video was not supplied, so video/motion bytes were not
  verified.
- primary-only with mismatched MOV: supplied MOV failed the signed resource hash;
  only the primary photo scope is verified.

If both the primary photo scope and paired MOV scope fail, the result is invalid.

## Implementation Notes

For primary-only Live Photo verification, the verifier can still:

1. Hash primary photo bytes excluding the TAP proof slot.
2. Hash canonical `manifest.payload` JSON.
3. Compare both values with `assetHash`, `metadataHash`, `primaryPhoto`, and
   `tapDepthManifestPayload` in the embedded v3 content digest.
4. Confirm a `pairedLivePhotoVideo` signed resource descriptor is present.
5. Hash the embedded full `contentDigest` JSON and compare it with
   `signingBinding.bodySHA256`.
6. Submit `keyId`, `assertionObject`, and the embedded `signingBinding` to the
   server.

The missing MOV is a scope warning, not a local hard-binding failure.

## Deferred TODO

Real worker-thread separation is not implemented in this slice. Verification and
visual analysis are independent async paths, but WASM calls still run on the
browser main thread. Move verification and/or analysis into Web Workers only if
main-thread contention becomes a measured problem.
