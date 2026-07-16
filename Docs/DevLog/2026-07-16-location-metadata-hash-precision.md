# 2026-07-16 Location Metadata Hash Precision Fix

## Summary

The Rust/WASM verifier could incorrectly report `metadata-hash` as failed for a
valid TAPCam photo when `manifest.payload.location` contained high-precision
floating-point values. The affected fields can include `latitude`, `longitude`,
`altitude`, `horizontalAccuracy`, and `verticalAccuracy`.

This was a verifier false negative. The location values and the signed photo
were not modified, and the fix does not add a new location-validity check.

## Root Cause

TAPCam signs the SHA-256 hash of the JSON bytes produced for
`manifest.payload`. Foundation's `JSONEncoder` can emit a high-precision number
with a lexeme such as:

```text
123.45678901234567
```

The verifier previously parsed the embedded payload into `serde_json::Value`
and serialized it again before hashing. Conversion through Rust `f64` could
produce a different, numerically adjacent lexeme:

```text
123.45678901234568
```

The values are effectively equivalent for ordinary location use, but their
UTF-8 bytes differ. SHA-256 therefore produces a completely different digest,
causing `metadataHash`, the reconstructed content digest, and the signing
binding checks to fail for an otherwise valid capture.

## Fix

The verifier now uses `serde_json::value::RawValue` to extract the exact raw
JSON representation of the top-level `manifest.payload` value. It computes
`metadataHash` directly over those bytes after XMP/XML entity decoding, without
converting payload numbers to `f64` or reserializing the payload.

The same exact payload byte count is used when reconstructing the Live Photo
`tapDepthManifestPayload` signed resource. Other canonical JSON operations,
including content-digest and signing-binding serialization, are unchanged.

## Verification Contract

For still-photo `content-binding:v2` and Live Photo `content-binding:v3`:

```text
metadataHash = SHA-256(exact embedded manifest.payload JSON bytes)
```

"Exact embedded bytes" means the JSON value recovered from the XMP manifest
after XML entity decoding. A verifier must not parse and reserialize the
payload before hashing it.

The existing signed descriptor still uses the protocol label
`kind: "canonical-json"`. This fix clarifies how the current TAPCam producer's
canonical payload representation must be recovered; it does not change the
content-binding schema or signed descriptor format.

## Regression Coverage

The Rust test suite includes a synthetic, production-shaped JPEG manifest with
artificial location values. The test demonstrates that:

- Foundation-shaped JSON contains an altitude ending in `...567`;
- parsing and serializing through `serde_json::Value` changes it to `...568`;
- raw payload extraction preserves the original bytes;
- `asset-hash`, `metadata-hash`, `body-sha`, `content-digest`, and
  `signing-binding` all pass after the fix.

The fixture uses artificial coordinates and timestamps and contains no real
location information.

## Scope

This change only corrects metadata hashing compatibility for JSON number
lexemes. It does not:

- validate whether a coordinate is geographically plausible;
- change or round location metadata;
- add location data to captures that do not contain it;
- change App Attest server verification;
- change asset hashing, depth analysis, or point-cloud behavior.
