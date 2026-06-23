#![allow(static_mut_refs)]

use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::slice;

static mut LAST_RESULT: Option<Vec<u8>> = None;

const CONTENT_BINDING_SCHEMA_ID: &str = "urn:tapnap:tapcam:content-binding:v2";
const MANIFEST_SCHEMA_ID: &str = "urn:tapnap:tapcam:depth-manifest:v1";
const MANIFEST_MEDIA_TYPE: &str = "application/vnd.tapnap.depth-manifest+json;version=1";
const MANIFEST_XMP_NAMESPACE_URI: &str = "urn:tapnap:tapcam:depth:1.0";
const MANIFEST_XMP_PREFIX: &str = "tapdepth";
const MANIFEST_XMP_PATH: &str = "tapdepth:Manifest";
const PROOF_TYPE: &str = "appAttestAssertion";
const PROOF_ALGORITHM: &str = "TAPCam.AppAttestCaptureSignature.v1";
const SIGNING_SCHEMA_ID: &str = "urn:tapnap:tapcam:app-attest-capture-signing:v1";
const SIGNING_OPERATION: &str = "tapcam.capture.sign";
const PROOF_PAYLOAD_BYTE_COUNT: usize = 60 * 1024;
const PROOF_HEADER_BYTE_COUNT: usize = 32;
const PROOF_MAGIC: &[u8] = b"TAPCAM-PROOF-SLOT-V1";
const BMFF_PROOF_UUID: &[u8] = b"TAPCAMPROOFSLOT1";

#[no_mangle]
pub extern "C" fn tapcam_verify_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn tapcam_verify_dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len));
    }
}

#[no_mangle]
pub unsafe extern "C" fn tapcam_verify_file(ptr: *const u8, len: usize) -> *const u8 {
    let bytes = slice::from_raw_parts(ptr, len);
    store_result(verify_capture_bytes(bytes))
}

#[no_mangle]
pub unsafe extern "C" fn tapcam_verify_file_with_rgb(
    file_ptr: *const u8,
    file_len: usize,
    _rgba_ptr: *const u8,
    _rgba_len: usize,
    _width: u32,
    _height: u32,
) -> *const u8 {
    let bytes = slice::from_raw_parts(file_ptr, file_len);
    store_result(verify_capture_bytes(bytes))
}

#[no_mangle]
pub unsafe extern "C" fn tapcam_verify_file_with_assets(
    file_ptr: *const u8,
    file_len: usize,
    _rgba_ptr: *const u8,
    _rgba_len: usize,
    _rgb_width: u32,
    _rgb_height: u32,
    _depth_ptr: *const u8,
    _depth_len: usize,
    _depth_width: u32,
    _depth_height: u32,
) -> *const u8 {
    let bytes = slice::from_raw_parts(file_ptr, file_len);
    store_result(verify_capture_bytes(bytes))
}

fn store_result(report: Value) -> *const u8 {
    let mut result = serde_json::to_vec(&report).unwrap_or_else(|error| {
        json!({
            "status": "invalid",
            "summary": format!("failed to serialize report: {error}"),
            "checks": []
        })
        .to_string()
        .into_bytes()
    });
    result.shrink_to_fit();
    let result_ptr = result.as_ptr();
    unsafe {
        LAST_RESULT = Some(result);
    }
    result_ptr
}

#[no_mangle]
pub unsafe extern "C" fn tapcam_verify_result_len() -> usize {
    LAST_RESULT.as_ref().map_or(0, Vec::len)
}

#[no_mangle]
pub unsafe extern "C" fn tapcam_verify_clear_result() {
    LAST_RESULT = None;
}

pub fn verify_heic_bytes(bytes: &[u8]) -> Value {
    verify_capture_bytes(bytes)
}

pub fn verify_capture_bytes(bytes: &[u8]) -> Value {
    match verify_capture_bytes_inner(bytes) {
        Ok(report) => report,
        Err(error) => json!({
            "status": "invalid",
            "summary": error,
            "captureId": null,
            "capturedAt": null,
            "serverRequest": null,
            "checks": [
                {
                    "id": "parse",
                    "label": "Parse TAP content binding",
                    "status": "fail",
                    "detail": error
                }
            ]
        }),
    }
}

fn verify_capture_bytes_inner(bytes: &[u8]) -> Result<Value, String> {
    let container = detect_container(bytes)?;
    let slot = locate_proof_slot(bytes, container)?;
    let proof_envelope = read_proof_envelope(bytes, &slot)?;
    let proof: Value = serde_json::from_slice(proof_envelope)
        .map_err(|error| format!("proof envelope is not valid JSON: {error}"))?;

    let manifest_json = extract_tap_manifest_json(bytes)?;
    let manifest: Value = serde_json::from_str(&manifest_json)
        .map_err(|error| format!("tapdepth:Manifest is not valid JSON: {error}"))?;
    let schema = field(&manifest, "schema")?;
    let payload = field(&manifest, "payload")?;
    let proofs = field(&manifest, "proofs")?
        .as_array()
        .ok_or("manifest.proofs is not an array")?;

    let manifest_capture_id = string_field(payload, "id")?;
    let manifest_captured_at = string_field(payload, "capturedAt")?;
    let proof_type = string_field(&proof, "type")?;
    let proof_algorithm = string_field(&proof, "algorithm")?;
    let proof_key_id = string_field(&proof, "keyID")?;
    let proof_created_at = string_field(&proof, "createdAt")?;
    let proof_value_encoded = string_field(&proof, "value")?;

    let proof_value_bytes = decode_base64url(proof_value_encoded)
        .map_err(|error| format!("proof.value is not valid base64url JSON: {error}"))?;
    let proof_value: Value = serde_json::from_slice(&proof_value_bytes)
        .map_err(|error| format!("decoded proof.value is not valid JSON: {error}"))?;
    let content_digest = field(&proof_value, "contentDigest")?;
    let signing_binding = field(&proof_value, "signingBinding")?;
    let assertion_object = string_field(&proof_value, "assertionObject")?;
    let proof_value_key_id = string_field(&proof_value, "keyId")?;

    let asset_hash_actual = sha256_base64url_excluding(bytes, slot.container_offset, slot.container_length)?;
    let payload_canonical = canonical_json_bytes(payload)?;
    let metadata_hash_actual = sha256_base64url(&payload_canonical);
    let recomputed_digest = recompute_content_digest(
        container,
        bytes.len(),
        &slot,
        manifest_capture_id,
        manifest_captured_at,
        &asset_hash_actual,
        &metadata_hash_actual,
    );
    let digest_canonical = canonical_json_bytes(&recomputed_digest)?;
    let body_sha_actual = sha256_base64url(&digest_canonical);
    let expected_signing_binding = json!({
        "bodySHA256": body_sha_actual,
        "captureID": manifest_capture_id,
        "operation": SIGNING_OPERATION,
        "schemaID": SIGNING_SCHEMA_ID
    });
    let signing_binding_sha256 = sha256_base64url(&canonical_json_bytes(signing_binding)?);

    let proof_content_capture_id = content_digest
        .get("captureID")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let proof_content_captured_at = content_digest
        .get("capturedAt")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let proof_asset_hash = content_digest
        .get("assetHash")
        .and_then(|asset| asset.get("value"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    let proof_metadata_hash = content_digest
        .get("metadataHash")
        .and_then(|metadata| metadata.get("value"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    let body_sha_expected = signing_binding
        .get("bodySHA256")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let signing_capture_id = signing_binding
        .get("captureID")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let checks = vec![
        check_pass(
            "proof-slot-present",
            "Locate TAP proof slot",
            &format!(
                "{} at offset {}, length {}.",
                slot.kind, slot.container_offset, slot.container_length
            ),
        ),
        check_pass(
            "proof-slot-envelope",
            "Read proof slot envelope",
            "Slot magic, version, envelope length, and zero padding are valid.",
        ),
        check_pass(
            "manifest-present",
            "Read XMP tapdepth:Manifest",
            "Manifest JSON was found in the uploaded photo.",
        ),
        schema_check(schema),
        manifest_proofs_empty_check(proofs.len()),
        capture_policy_check(container, payload.get("capture")),
        equality_check("proof-type", "Require appAttestAssertion proof", proof_type, PROOF_TYPE),
        equality_check(
            "proof-algorithm",
            "Require TAPCam signature algorithm",
            proof_algorithm,
            PROOF_ALGORITHM,
        ),
        non_empty_check("proof-key", "Require proof key id", proof_key_id),
        equality_check(
            "proof-key-binding",
            "Proof key id matches proof value key id",
            proof_key_id,
            proof_value_key_id,
        ),
        equality_check(
            "proof-created-at",
            "Proof timestamp matches capture digest",
            proof_created_at,
            manifest_captured_at,
        ),
        equality_check(
            "content-binding-schema",
            "Require content-binding v2 schema",
            content_digest
                .get("schemaID")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            CONTENT_BINDING_SCHEMA_ID,
        ),
        equality_check(
            "manifest-capture-id",
            "Manifest payload id matches content digest",
            manifest_capture_id,
            proof_content_capture_id,
        ),
        equality_check(
            "manifest-captured-at",
            "Manifest capturedAt matches content digest",
            manifest_captured_at,
            proof_content_captured_at,
        ),
        equality_check(
            "capture-id",
            "Capture id matches signing binding",
            manifest_capture_id,
            signing_capture_id,
        ),
        equality_check(
            "asset-hash",
            "Recompute asset hash excluding proof slot",
            &asset_hash_actual,
            proof_asset_hash,
        ),
        equality_check(
            "metadata-hash",
            "Recompute manifest payload metadata hash",
            &metadata_hash_actual,
            proof_metadata_hash,
        ),
        equality_check(
            "body-sha",
            "Recompute signingBinding.bodySHA256",
            &body_sha_actual,
            body_sha_expected,
        ),
        json_equality_check(
            "content-digest",
            "Rebuild canonical content digest",
            &recomputed_digest,
            content_digest,
        ),
        json_equality_check(
            "signing-binding",
            "Rebuild signing binding",
            &expected_signing_binding,
            signing_binding,
        ),
        non_empty_check(
            "assertion-object",
            "Require App Attest assertion object",
            assertion_object,
        ),
    ];

    let has_failed = checks.iter().any(|check| check["status"] == "fail");
    let status = if has_failed { "invalid" } else { "valid" };
    let summary = if has_failed {
        "The TAP content binding failed local self-checks."
    } else {
        "All local content binding checks passed."
    };
    let server_request = if has_failed {
        Value::Null
    } else {
        json!({
            "keyId": proof_value_key_id,
            "assertionObject": assertion_object,
            "signingBinding": signing_binding
        })
    };

    Ok(json!({
        "status": status,
        "summary": summary,
        "captureId": manifest_capture_id,
        "capturedAt": manifest_captured_at,
        "manifest": {
            "containerFormat": container.as_report_str(),
            "schemaId": schema.get("id").and_then(Value::as_str),
            "proofCount": proofs.len(),
            "capture": payload.get("capture")
        },
        "proofSlot": {
            "kind": slot.kind,
            "offset": slot.container_offset,
            "length": slot.container_length,
            "payloadOffset": slot.payload_offset,
            "payloadLength": slot.payload_length
        },
        "proof": {
            "type": proof_type,
            "algorithm": proof_algorithm,
            "keyId": proof_key_id,
            "createdAt": proof_created_at
        },
        "recomputed": {
            "assetSHA256": asset_hash_actual,
            "metadataSHA256": metadata_hash_actual,
            "bodySHA256": body_sha_actual,
            "signingBindingSHA256": signing_binding_sha256
        },
        "expected": {
            "assetSHA256": proof_asset_hash,
            "metadataSHA256": proof_metadata_hash,
            "bodySHA256": body_sha_expected,
            "contentDigest": content_digest
        },
        "serverRequest": server_request,
        "checks": checks
    }))
}

#[derive(Clone, Copy)]
enum Container {
    Heic,
    Jpeg,
}

impl Container {
    fn file_container(self) -> &'static str {
        match self {
            Container::Heic => "heic",
            Container::Jpeg => "jpeg",
        }
    }

    fn as_report_str(self) -> &'static str {
        match self {
            Container::Heic => "heif",
            Container::Jpeg => "jpeg",
        }
    }

    fn slot_kind(self) -> &'static str {
        match self {
            Container::Heic => "bmff-uuid-proof-slot",
            Container::Jpeg => "jpeg-app11-proof-slot",
        }
    }

    fn expected_codec(self) -> &'static str {
        match self {
            Container::Heic => "hvc1",
            Container::Jpeg => "jpeg",
        }
    }
}

struct ProofSlot {
    kind: &'static str,
    container_offset: usize,
    container_length: usize,
    payload_offset: usize,
    payload_length: usize,
}

fn recompute_content_digest(
    container: Container,
    byte_count: usize,
    slot: &ProofSlot,
    capture_id: &str,
    captured_at: &str,
    asset_hash: &str,
    metadata_hash: &str,
) -> Value {
    json!({
        "schemaID": CONTENT_BINDING_SCHEMA_ID,
        "manifestSchemaID": MANIFEST_SCHEMA_ID,
        "captureID": capture_id,
        "capturedAt": captured_at,
        "assetHash": {
            "kind": "c2pa-style-format-native-byte-ranges",
            "fileContainer": container.file_container(),
            "algorithm": "SHA-256",
            "byteCount": byte_count,
            "value": asset_hash,
            "excludedRanges": [
                {
                    "offset": slot.container_offset,
                    "length": slot.container_length,
                    "reason": "tap-proof-slot"
                }
            ]
        },
        "metadataHash": {
            "kind": "canonical-json",
            "mediaType": "application/vnd.tapnap.depth-manifest.payload+json;version=1",
            "algorithm": "SHA-256",
            "value": metadata_hash
        },
        "proofSlot": {
            "kind": slot.kind,
            "offset": slot.container_offset,
            "length": slot.container_length,
            "payloadOffset": slot.payload_offset,
            "payloadLength": slot.payload_length,
            "padding": "zero-filled-after-envelope"
        },
        "depthResource": {
            "presence": "required",
            "binding": "covered-by-assetHash",
            "interpretation": "not-part-of-base-signature",
            "platformPresenceCheck": "AVDepthData-readback"
        }
    })
}

fn detect_container(bytes: &[u8]) -> Result<Container, String> {
    if bytes.starts_with(&[0xff, 0xd8]) {
        return Ok(Container::Jpeg);
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        return Ok(Container::Heic);
    }
    Err("unsupported TAP photo container; expected HEIC/BMFF or JPEG".to_string())
}

fn locate_proof_slot(bytes: &[u8], container: Container) -> Result<ProofSlot, String> {
    match container {
        Container::Heic => locate_bmff_proof_slot(bytes),
        Container::Jpeg => locate_jpeg_proof_slot(bytes),
    }
}

fn locate_bmff_proof_slot(bytes: &[u8]) -> Result<ProofSlot, String> {
    let mut offset = 0usize;
    let mut matches = Vec::new();

    while offset + 8 <= bytes.len() {
        let box_start = offset;
        let size32 = read_u32_be(bytes, offset)? as usize;
        let type_offset = offset + 4;
        offset += 8;

        let box_size = if size32 == 1 {
            if offset + 8 > bytes.len() {
                break;
            }
            let large_size = read_u64_be(bytes, offset)?;
            if large_size > usize::MAX as u64 {
                break;
            }
            offset += 8;
            large_size as usize
        } else if size32 == 0 {
            bytes.len() - box_start
        } else {
            size32
        };

        let box_end = match box_start.checked_add(box_size) {
            Some(value) => value,
            None => break,
        };
        if box_size < offset - box_start || box_end > bytes.len() {
            break;
        }

        if &bytes[type_offset..type_offset + 4] == b"uuid"
            && offset + BMFF_PROOF_UUID.len() <= box_end
            && &bytes[offset..offset + BMFF_PROOF_UUID.len()] == BMFF_PROOF_UUID
        {
            let payload_offset = offset + BMFF_PROOF_UUID.len();
            matches.push(ProofSlot {
                kind: Container::Heic.slot_kind(),
                container_offset: box_start,
                container_length: box_size,
                payload_offset,
                payload_length: box_end - payload_offset,
            });
        }

        offset = box_end;
    }

    exactly_one_slot(matches)
}

fn locate_jpeg_proof_slot(bytes: &[u8]) -> Result<ProofSlot, String> {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return Err("missing proof slot".to_string());
    }

    let mut offset = 2usize;
    let mut matches = Vec::new();
    while offset + 4 <= bytes.len() {
        if bytes[offset] != 0xff {
            break;
        }
        let mut marker_offset = offset;
        while marker_offset < bytes.len() && bytes[marker_offset] == 0xff {
            marker_offset += 1;
        }
        if marker_offset >= bytes.len() {
            break;
        }

        let marker = bytes[marker_offset];
        offset = marker_offset + 1;
        if marker == 0xd9 || marker == 0xda {
            break;
        }
        if (0xd0..=0xd7).contains(&marker) || marker == 0x01 {
            continue;
        }
        if offset + 2 > bytes.len() {
            break;
        }

        let segment_length = read_u16_be(bytes, offset)? as usize;
        let segment_start = marker_offset - 1;
        let payload_offset = offset + 2;
        let segment_end = match offset.checked_add(segment_length) {
            Some(value) => value,
            None => break,
        };
        if segment_length < 2 || segment_end > bytes.len() {
            break;
        }

        if marker == 0xeb
            && segment_length == PROOF_PAYLOAD_BYTE_COUNT + 2
            && payload_offset + PROOF_MAGIC.len() <= segment_end
            && &bytes[payload_offset..payload_offset + PROOF_MAGIC.len()] == PROOF_MAGIC
        {
            matches.push(ProofSlot {
                kind: Container::Jpeg.slot_kind(),
                container_offset: segment_start,
                container_length: segment_end - segment_start,
                payload_offset,
                payload_length: segment_end - payload_offset,
            });
        }

        offset = segment_end;
    }

    exactly_one_slot(matches)
}

fn exactly_one_slot(matches: Vec<ProofSlot>) -> Result<ProofSlot, String> {
    if matches.len() != 1 {
        return Err(format!(
            "expected exactly one TAP proof slot; found {}",
            matches.len()
        ));
    }
    let slot = matches.into_iter().next().unwrap();
    if slot.payload_length != PROOF_PAYLOAD_BYTE_COUNT {
        return Err("unexpected proof slot length".to_string());
    }
    Ok(slot)
}

fn read_proof_envelope<'a>(bytes: &'a [u8], slot: &ProofSlot) -> Result<&'a [u8], String> {
    let payload_end = slot
        .payload_offset
        .checked_add(slot.payload_length)
        .ok_or("invalid proof slot range")?;
    if payload_end > bytes.len() {
        return Err("invalid proof slot range".to_string());
    }
    let payload = &bytes[slot.payload_offset..payload_end];
    if payload.len() != PROOF_PAYLOAD_BYTE_COUNT
        || payload.get(0..PROOF_MAGIC.len()) != Some(PROOF_MAGIC)
        || read_u32_be(payload, 24)? != 1
    {
        return Err("invalid proof slot header".to_string());
    }

    let envelope_len = read_u32_be(payload, 28)? as usize;
    let capacity = PROOF_PAYLOAD_BYTE_COUNT - PROOF_HEADER_BYTE_COUNT;
    if envelope_len == 0 {
        return Err("missing proof envelope".to_string());
    }
    if envelope_len > capacity {
        return Err("invalid proof envelope length".to_string());
    }

    let envelope_start = PROOF_HEADER_BYTE_COUNT;
    let envelope_end = envelope_start + envelope_len;
    if payload[envelope_end..].iter().any(|byte| *byte != 0) {
        return Err("proof slot padding is not zero-filled".to_string());
    }
    Ok(&payload[envelope_start..envelope_end])
}

fn sha256_base64url_excluding(bytes: &[u8], offset: usize, length: usize) -> Result<String, String> {
    let end = offset.checked_add(length).ok_or("invalid proof slot range")?;
    if end > bytes.len() {
        return Err("invalid proof slot range".to_string());
    }
    let mut hasher = Sha256::new();
    hasher.update(&bytes[..offset]);
    hasher.update(&bytes[end..]);
    Ok(URL_SAFE_NO_PAD.encode(hasher.finalize()))
}

fn extract_tap_manifest_json(bytes: &[u8]) -> Result<String, String> {
    let text = String::from_utf8_lossy(bytes);
    let open_marker = "<tapdepth:Manifest";
    let close_marker = "</tapdepth:Manifest>";
    let open_start = text
        .find(open_marker)
        .ok_or("XMP tapdepth:Manifest tag was not found")?;
    if text[open_start + open_marker.len()..].contains(open_marker) {
        return Err("expected exactly one XMP tapdepth:Manifest tag; found multiple".to_string());
    }
    let content_start = text[open_start..]
        .find('>')
        .map(|offset| open_start + offset + 1)
        .ok_or("XMP tapdepth:Manifest opening tag is incomplete")?;
    let close_start = text[content_start..]
        .find(close_marker)
        .map(|offset| content_start + offset)
        .ok_or("XMP tapdepth:Manifest closing tag was not found")?;
    if text[close_start + close_marker.len()..].contains(close_marker) {
        return Err("expected exactly one XMP tapdepth:Manifest tag; found multiple".to_string());
    }
    Ok(xml_unescape(text[content_start..close_start].trim()))
}

fn xml_unescape(input: &str) -> String {
    input
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn field<'a>(value: &'a Value, name: &str) -> Result<&'a Value, String> {
    value.get(name).ok_or_else(|| format!("{name} is missing"))
}

fn string_field<'a>(value: &'a Value, name: &str) -> Result<&'a str, String> {
    field(value, name)?
        .as_str()
        .ok_or_else(|| format!("{name} is not a string"))
}

fn canonical_json_bytes(value: &Value) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|error| format!("canonical JSON serialization failed: {error}"))
}

fn sha256_base64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(bytes))
}

fn decode_base64url(value: &str) -> Result<Vec<u8>, base64::DecodeError> {
    URL_SAFE_NO_PAD
        .decode(value)
        .or_else(|_| URL_SAFE.decode(value))
}

fn read_u16_be(bytes: &[u8], offset: usize) -> Result<u16, String> {
    if offset + 2 > bytes.len() {
        return Err("unexpected end of data while reading u16".to_string());
    }
    Ok(((bytes[offset] as u16) << 8) | bytes[offset + 1] as u16)
}

fn read_u32_be(bytes: &[u8], offset: usize) -> Result<u32, String> {
    if offset + 4 > bytes.len() {
        return Err("unexpected end of data while reading u32".to_string());
    }
    Ok(((bytes[offset] as u32) << 24)
        | ((bytes[offset + 1] as u32) << 16)
        | ((bytes[offset + 2] as u32) << 8)
        | bytes[offset + 3] as u32)
}

fn read_u64_be(bytes: &[u8], offset: usize) -> Result<u64, String> {
    if offset + 8 > bytes.len() {
        return Err("unexpected end of data while reading u64".to_string());
    }
    let mut value = 0u64;
    for byte in &bytes[offset..offset + 8] {
        value = (value << 8) | (*byte as u64);
    }
    Ok(value)
}

fn check_pass(id: &str, label: &str, detail: &str) -> Value {
    json!({
        "id": id,
        "label": label,
        "status": "pass",
        "detail": detail
    })
}

fn equality_check(id: &str, label: &str, actual: &str, expected: &str) -> Value {
    let status = if actual == expected { "pass" } else { "fail" };
    json!({
        "id": id,
        "label": label,
        "status": status,
        "detail": if status == "pass" {
            "Values match.".to_string()
        } else {
            format!("Expected {expected}, got {actual}.")
        },
        "actual": actual,
        "expected": expected
    })
}

fn non_empty_check(id: &str, label: &str, actual: &str) -> Value {
    let status = if actual.is_empty() { "fail" } else { "pass" };
    json!({
        "id": id,
        "label": label,
        "status": status,
        "detail": if status == "pass" {
            "Value is present.".to_string()
        } else {
            "Value is missing.".to_string()
        },
        "actual": actual
    })
}

fn json_equality_check(id: &str, label: &str, actual: &Value, expected: &Value) -> Value {
    let status = if actual == expected { "pass" } else { "fail" };
    json!({
        "id": id,
        "label": label,
        "status": status,
        "detail": if status == "pass" {
            "JSON values match.".to_string()
        } else {
            "JSON values differ.".to_string()
        },
        "actual": actual,
        "expected": expected
    })
}

fn manifest_proofs_empty_check(count: usize) -> Value {
    json!({
        "id": "manifest-proofs-empty",
        "label": "Require empty manifest proofs",
        "status": if count == 0 { "pass" } else { "fail" },
        "detail": if count == 0 {
            "Manifest carries no proof body; proof is stored in the fixed slot.".to_string()
        } else {
            format!("manifest.proofs must be empty, got {count}.")
        },
        "actual": count,
        "expected": 0
    })
}

fn schema_check(schema: &Value) -> Value {
    let expected = json!({
        "id": MANIFEST_SCHEMA_ID,
        "mediaType": MANIFEST_MEDIA_TYPE,
        "version": 1,
        "xmpManifestPath": MANIFEST_XMP_PATH,
        "xmpNamespaceURI": MANIFEST_XMP_NAMESPACE_URI,
        "xmpPrefix": MANIFEST_XMP_PREFIX
    });
    json_equality_check(
        "manifest-schema",
        "Require TAP depth manifest schema",
        schema,
        &expected,
    )
}

fn capture_policy_check(container: Container, capture: Option<&Value>) -> Value {
    let Some(capture) = capture else {
        return json!({
            "id": "release-profile-policy",
            "label": "Require Release capture profile policy",
            "status": "fail",
            "detail": "payload.capture is missing."
        });
    };

    let expected_codec = container.expected_codec();
    let mut violations = Vec::new();
    if capture.get("requestedCodec").and_then(Value::as_str) != Some(expected_codec) {
        violations.push(format!("requestedCodec must be {expected_codec}"));
    }
    if capture.get("depthDataDeliveryEnabled").and_then(Value::as_bool) != Some(true) {
        violations.push("depthDataDeliveryEnabled must be true".to_string());
    }
    if capture.get("embedsDepthDataInPhoto").and_then(Value::as_bool) != Some(true) {
        violations.push("embedsDepthDataInPhoto must be true".to_string());
    }
    if capture.get("depthDataFiltered").and_then(Value::as_bool) != Some(true) {
        violations.push("depthDataFiltered must be true".to_string());
    }
    if capture
        .get("photoQualityPrioritization")
        .and_then(Value::as_str)
        != Some("quality")
    {
        violations.push("photoQualityPrioritization must be quality".to_string());
    }

    json!({
        "id": "release-profile-policy",
        "label": "Require Release capture profile policy",
        "status": if violations.is_empty() { "pass" } else { "fail" },
        "detail": if violations.is_empty() {
            "Manifest capture fields match the reviewed Release profile.".to_string()
        } else {
            violations.join("; ")
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_uses_base64url_without_padding() {
        assert_eq!(
            sha256_base64url(b"abc"),
            "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0"
        );
    }

    #[test]
    fn canonical_json_sorts_object_keys() {
        let value: Value = serde_json::from_str(r#"{"z":1,"a":{"b":2,"a":1}}"#).unwrap();
        assert_eq!(
            String::from_utf8(canonical_json_bytes(&value).unwrap()).unwrap(),
            r#"{"a":{"a":1,"b":2},"z":1}"#
        );
    }

    #[test]
    fn decodes_base64url_with_or_without_padding() {
        assert_eq!(decode_base64url("YWJj").unwrap(), b"abc");
        assert_eq!(decode_base64url("YWJjZA==").unwrap(), b"abcd");
    }

    #[test]
    fn parses_embedded_manifest() {
        let bytes = br#"<x:xmpmeta><tapdepth:Manifest>{"payload":{"id":"a"},"proofs":[]}</tapdepth:Manifest></x:xmpmeta>"#;
        assert_eq!(
            extract_tap_manifest_json(bytes).unwrap(),
            r#"{"payload":{"id":"a"},"proofs":[]}"#
        );
    }

    #[test]
    fn rejects_multiple_embedded_manifests() {
        let bytes = br#"<tapdepth:Manifest>{}</tapdepth:Manifest><tapdepth:Manifest>{}</tapdepth:Manifest>"#;
        assert!(extract_tap_manifest_json(bytes)
            .unwrap_err()
            .contains("expected exactly one"));
    }

    #[test]
    fn locates_and_reads_bmff_proof_slot() {
        let payload = proof_slot_payload(br#"{"ok":true}"#);
        let slot_box = bmff_proof_box(&payload);
        let mut bytes = bmff_ftyp_box();
        bytes.extend(slot_box);
        let slot = locate_proof_slot(&bytes, Container::Heic).unwrap();
        assert_eq!(slot.kind, "bmff-uuid-proof-slot");
        assert_eq!(slot.payload_length, PROOF_PAYLOAD_BYTE_COUNT);
        assert_eq!(read_proof_envelope(&bytes, &slot).unwrap(), br#"{"ok":true}"#);
    }

    #[test]
    fn synthetic_content_binding_verifies() {
        let bytes = synthetic_signed_heic();
        let report = verify_heic_bytes(&bytes);
        assert_eq!(report["status"], "valid");
        assert!(report["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["id"] == "asset-hash" && check["status"] == "pass"));
        assert!(report["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["id"] == "content-digest" && check["status"] == "pass"));
    }

    #[test]
    fn local_fixture_verifies_when_available() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("test/tap-depth-photo.HEIC");

        if !fixture.exists() {
            return;
        }

        let bytes = std::fs::read(fixture).unwrap();
        let report = verify_heic_bytes(&bytes);
        assert_eq!(report["captureId"], "19EE1B2E-16FD-47B5-AD24-D559568CA4AD");
        assert_eq!(report["status"], "valid");
        assert_eq!(
            report["recomputed"]["assetSHA256"],
            "L3PxMfXci4kCCi_rQ_XV1wxb9f_oFX7lcwFkTVScY1Y"
        );
        assert_eq!(
            report["recomputed"]["metadataSHA256"],
            "pioecsnO2ixGdvZTmMUWGGXQ3uPZrZ4OgNymTvQbnIk"
        );
        assert_eq!(
            report["recomputed"]["bodySHA256"],
            "6ZIqezCAIVp2RtZyOAA_lW3vWTn5iuHLVrLGEw1jiv0"
        );
    }

    fn synthetic_signed_heic() -> Vec<u8> {
        let payload = json!({
            "alignmentStatus": "aligned",
            "capture": {
                "depthDataDeliveryEnabled": true,
                "depthDataFiltered": true,
                "embedsDepthDataInPhoto": true,
                "photoQualityPrioritization": "quality",
                "requestedCodec": "hvc1"
            },
            "capturedAt": "2026-06-22T00:00:00.000Z",
            "id": "capture"
        });
        let manifest = json!({
            "schema": {
                "id": MANIFEST_SCHEMA_ID,
                "mediaType": MANIFEST_MEDIA_TYPE,
                "version": 1,
                "xmpManifestPath": MANIFEST_XMP_PATH,
                "xmpNamespaceURI": MANIFEST_XMP_NAMESPACE_URI,
                "xmpPrefix": MANIFEST_XMP_PREFIX
            },
            "payload": payload,
            "proofs": []
        });
        let manifest_box = bmff_box(
            b"free",
            format!(
                "<x:xmpmeta><tapdepth:Manifest>{}</tapdepth:Manifest></x:xmpmeta>",
                String::from_utf8(canonical_json_bytes(&manifest).unwrap()).unwrap()
            )
            .as_bytes(),
        );

        let mut unsigned = bmff_ftyp_box();
        unsigned.extend(manifest_box);
        unsigned.extend(bmff_proof_box(&proof_slot_payload(&[])));
        let slot = locate_proof_slot(&unsigned, Container::Heic).unwrap();
        let asset_hash =
            sha256_base64url_excluding(&unsigned, slot.container_offset, slot.container_length)
                .unwrap();
        let metadata_hash = sha256_base64url(&canonical_json_bytes(&payload).unwrap());
        let digest = recompute_content_digest(
            Container::Heic,
            unsigned.len(),
            &slot,
            "capture",
            "2026-06-22T00:00:00.000Z",
            &asset_hash,
            &metadata_hash,
        );
        let body_sha = sha256_base64url(&canonical_json_bytes(&digest).unwrap());
        let signing_binding = json!({
            "bodySHA256": body_sha,
            "captureID": "capture",
            "operation": SIGNING_OPERATION,
            "schemaID": SIGNING_SCHEMA_ID
        });
        let proof_value = json!({
            "assertionObject": "assertion",
            "contentDigest": digest,
            "keyId": "key",
            "signingBinding": signing_binding
        });
        let proof = json!({
            "algorithm": PROOF_ALGORITHM,
            "createdAt": "2026-06-22T00:00:00.000Z",
            "keyID": "key",
            "type": PROOF_TYPE,
            "value": URL_SAFE_NO_PAD.encode(canonical_json_bytes(&proof_value).unwrap())
        });
        let envelope = canonical_json_bytes(&proof).unwrap();
        let signed_payload = proof_slot_payload(&envelope);
        let mut signed = unsigned;
        let payload_range = slot.payload_offset..slot.payload_offset + slot.payload_length;
        signed[payload_range].copy_from_slice(&signed_payload);
        signed
    }

    fn proof_slot_payload(envelope: &[u8]) -> Vec<u8> {
        let mut payload = vec![0u8; PROOF_PAYLOAD_BYTE_COUNT];
        assert!(envelope.len() <= PROOF_PAYLOAD_BYTE_COUNT - PROOF_HEADER_BYTE_COUNT);
        payload[..PROOF_MAGIC.len()].copy_from_slice(PROOF_MAGIC);
        payload[24..28].copy_from_slice(&1u32.to_be_bytes());
        payload[28..32].copy_from_slice(&(envelope.len() as u32).to_be_bytes());
        payload[PROOF_HEADER_BYTE_COUNT..PROOF_HEADER_BYTE_COUNT + envelope.len()]
            .copy_from_slice(envelope);
        payload
    }

    fn bmff_ftyp_box() -> Vec<u8> {
        bmff_box(b"ftyp", b"heic")
    }

    fn bmff_proof_box(payload: &[u8]) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend(BMFF_PROOF_UUID);
        data.extend(payload);
        bmff_box(b"uuid", &data)
    }

    fn bmff_box(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let size = 8 + payload.len();
        let mut data = Vec::with_capacity(size);
        data.extend((size as u32).to_be_bytes());
        data.extend(kind);
        data.extend(payload);
        data
    }
}
