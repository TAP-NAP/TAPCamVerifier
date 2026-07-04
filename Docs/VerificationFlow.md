# Verification Flow

The verifier follows TAPCamDemo still-photo `content-binding:v2` and Live Photo
`content-binding:v3`. Still photos bind the native HEIC/JPG file bytes excluding
the fixed proof slot plus canonical TAP manifest payload JSON. Live Photos keep
that primary-photo binding and add the complete `paired-video.mov` bytes as a
signed resource. The browser does not decode RGB pixels, video frames, or metric
depth Float32 values for the base signature.

## Hash Flow

```mermaid
flowchart TD
    A["Upload signed HEIC/JPG or Live Photo ZIP"] --> B["Rust/WASM reads primary photo bytes"]
    A --> Z["ZIP reader preserves primary-photo.* and paired-video.mov bytes"]
    Z --> B
    Z --> Y["Hash paired-video.mov full file for Live Photo v3"]
    B --> C["Detect HEIC/BMFF or JPEG container"]
    B --> D["Locate exactly one TAP proof slot"]
    D --> E["Validate slot magic, version, envelope length, zero padding"]
    E --> F["Parse proof envelope JSON"]
    F --> G["Decode proof.value base64url JSON"]
    B --> H["Read XMP tapdepth:Manifest"]
    H --> I["Require schema and empty manifest.proofs"]
    I --> J["Validate Release profile policy"]
    B --> K["SHA-256 native file bytes excluding proof slot container range"]
    I --> L["Canonicalize manifest.payload JSON"]
    L --> M["SHA-256 metadata payload JSON"]
    D --> N["Rebuild proofSlot object"]
    K --> O["Rebuild CaptureContentBinding"]
    M --> O
    Y --> O
    N --> O
    O --> P["Compare with proofValue.contentDigest"]
    O --> Q["Canonical contentDigest JSON"]
    Q --> R["SHA-256 signingBinding.bodySHA256"]
    R --> S["Rebuild CaptureSigningBinding"]
    S --> T["Compare with proofValue.signingBinding"]
    T --> U["Local valid only if every hard-binding check passes"]
    U --> V["POST keyId + assertionObject + signingBinding to server"]
    V --> W["Server verifies App Attest assertion"]
    W --> X["Final valid only if local and server checks pass"]
```

## Implemented Checks

- HEIC/BMFF and JPEG container detection.
- BMFF `uuid` proof slot and JPEG APP11 proof slot location.
- Proof slot magic `TAPCAM-PROOF-SLOT-V1`, version `1`, envelope length, and
  zero-filled padding.
- Proof envelope JSON parse.
- `proof.value` base64url decode and JSON parse.
- XMP `tapdepth:Manifest` extraction, including element-style XMP and
  ImageIO/RDF attribute-style XMP.
- Exact TAP depth manifest schema check.
- Empty `manifest.proofs`; proof bodies must live in the fixed proof slot.
- Release capture profile policy:
  - HEIC uses requested codec `hvc1`;
  - JPEG uses requested codec `jpeg`;
  - depth delivery is enabled;
  - depth is embedded in the photo;
  - depth is filtered;
  - photo quality prioritization is `quality`.
- `assetHash`: SHA-256 over uploaded bytes excluding the proof slot container
  range.
- `metadataHash`: SHA-256 over canonical `manifest.payload` JSON.
- Rebuilt `CaptureContentBinding` equality.
- Live Photo `signedResources` checks for:
  - `primaryPhoto`;
  - `tapDepthManifestPayload`;
  - `pairedLivePhotoVideo`.
- Rebuilt `CaptureSigningBinding` equality.
- `signingBindingSHA256` as a browser-recomputed diagnostic hash of the exact
  `signingBinding` sent to the server. If the server echoes the same field, the
  UI compares it to catch integration drift; this is not a server-side native
  file hash check.

## Strict Verifier Rule

The verifier does not degrade. Unsupported containers, missing slots, malformed
padding, non-empty manifest proofs, profile drift, or any hash mismatch produce
`invalid`. For Live Photo v2/v3 captures, a single HEIC/JPG without
`paired-video.mov` is reported as a Live Photo with a missing video resource,
not as a complete still-photo proof. There is no `blocked` state for RGB/depth
decoding in the base signature path because decoded pixels are not signature
inputs.

## Server Boundary

The browser never uploads the original HEIC/JPG. After local hard-binding checks
pass, the page posts to:

```text
https://www.tapnap.net/tapcam/capture-signatures/verify
```

The request body is:

```json
{
  "keyId": "...",
  "assertionObject": "...",
  "signingBinding": {
    "bodySHA256": "...",
    "captureID": "...",
    "operation": "tapcam.capture.sign",
    "schemaID": "urn:tapnap:tapcam:app-attest-capture-signing:v1"
  }
}
```

The production page origin is `https://verifier.tapnap.net`. Local development
origins such as `http://127.0.0.1:4174` are expected to fail server verification
unless the server CORS allowlist includes them.
