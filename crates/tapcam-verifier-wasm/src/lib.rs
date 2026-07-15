#![allow(static_mut_refs)]

use base64::engine::general_purpose::{STANDARD, URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::slice;

static mut LAST_RESULT: Option<Vec<u8>> = None;

const CONTENT_BINDING_SCHEMA_ID: &str = "urn:tapnap:tapcam:content-binding:v2";
const LIVE_PHOTO_CONTENT_BINDING_SCHEMA_ID: &str = "urn:tapnap:tapcam:content-binding:v3";
const MANIFEST_SCHEMA_ID: &str = "urn:tapnap:tapcam:depth-manifest:v1";
const LIVE_PHOTO_MANIFEST_SCHEMA_ID: &str = "urn:tapnap:tapcam:depth-manifest:v2";
const MANIFEST_MEDIA_TYPE: &str = "application/vnd.tapnap.depth-manifest+json;version=1";
const LIVE_PHOTO_MANIFEST_MEDIA_TYPE: &str =
    "application/vnd.tapnap.depth-manifest+json;version=2";
const MANIFEST_PAYLOAD_MEDIA_TYPE_V1: &str =
    "application/vnd.tapnap.depth-manifest.payload+json;version=1";
const MANIFEST_PAYLOAD_MEDIA_TYPE_V2: &str =
    "application/vnd.tapnap.depth-manifest.payload+json;version=2";
const MANIFEST_XMP_NAMESPACE_URI: &str = "urn:tapnap:tapcam:depth:1.0";
const MANIFEST_XMP_PREFIX: &str = "tapdepth";
const MANIFEST_XMP_PATH: &str = "tapdepth:Manifest";
const LIVE_PHOTO_PAIRED_VIDEO_FILENAME: &str = "paired-video.mov";
const QUICKTIME_MOVIE_MEDIA_TYPE: &str = "com.apple.quicktime-movie";
const SCOPE_STILL_PHOTO: &str = "stillPhoto";
const SCOPE_FULL_LIVE_PHOTO: &str = "fullLivePhoto";
const SCOPE_LIVE_PHOTO_PRIMARY: &str = "primaryPhotoFromLivePhoto";
const PROOF_TYPE: &str = "appAttestAssertion";
const PROOF_ALGORITHM: &str = "TAPCam.AppAttestCaptureSignature.v1";
const SIGNING_SCHEMA_ID: &str = "urn:tapnap:tapcam:app-attest-capture-signing:v1";
const SIGNING_OPERATION: &str = "tapcam.capture.sign";
const PROOF_PAYLOAD_BYTE_COUNT: usize = 60 * 1024;
const PROOF_HEADER_BYTE_COUNT: usize = 32;
const PROOF_MAGIC: &[u8] = b"TAPCAM-PROOF-SLOT-V1";
const BMFF_PROOF_UUID: &[u8] = b"TAPCAMPROOFSLOT1";
const PIXEL_PROJECTION_TARGET_MAX_EDGE: u32 = 480;
const RISK_CLIPPED_LOW: u16 = 1 << 0;
const RISK_CLIPPED_HIGH: u16 = 1 << 1;
const RISK_NARROW_RANGE: u16 = 1 << 2;
const RISK_ISOLATED_OUTLIER: u16 = 1 << 3;
const RISK_DISCONTINUITY_EDGE: u16 = 1 << 4;
const RISK_ALIGNMENT_EDGE: u16 = 1 << 5;
const RISK_DISTORTION_UNCORRECTED_EDGE: u16 = 1 << 6;
const OUTLIER_MEDIUM_THRESHOLD: f64 = 0.20;
const DISCONTINUITY_MEDIUM_THRESHOLD: f64 = 0.25;

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
pub unsafe extern "C" fn tapcam_verify_file_with_paired_video(
    file_ptr: *const u8,
    file_len: usize,
    video_ptr: *const u8,
    video_len: usize,
) -> *const u8 {
    let bytes = slice::from_raw_parts(file_ptr, file_len);
    let paired_video = if video_ptr.is_null() || video_len == 0 {
        None
    } else {
        Some(slice::from_raw_parts(video_ptr, video_len))
    };
    store_result(verify_capture_package_bytes(bytes, paired_video))
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

#[no_mangle]
pub unsafe extern "C" fn tapcam_visualize_depth_u8(
    file_ptr: *const u8,
    file_len: usize,
    luma_ptr: *const u8,
    luma_len: usize,
    width: u32,
    height: u32,
    display_width: u32,
    display_height: u32,
) -> *const u8 {
    let file_bytes = slice::from_raw_parts(file_ptr, file_len);
    let luma = slice::from_raw_parts(luma_ptr, luma_len);
    let display_reference = if display_width > 0 && display_height > 0 {
        Some((display_width, display_height))
    } else {
        None
    };
    store_result(depth_visualization_result(visualize_depth_u8_inner(
        file_bytes,
        luma,
        width,
        height,
        display_reference,
    )))
}

#[no_mangle]
pub unsafe extern "C" fn tapcam_prepare_original_rgba(
    file_ptr: *const u8,
    file_len: usize,
    rgba_ptr: *const u8,
    rgba_len: usize,
    width: u32,
    height: u32,
    max_edge: u32,
) -> *const u8 {
    let file_bytes = slice::from_raw_parts(file_ptr, file_len);
    let rgba = slice::from_raw_parts(rgba_ptr, rgba_len);
    store_result(prepare_original_rgba(
        file_bytes, rgba, width, height, max_edge,
    ))
}

#[no_mangle]
pub unsafe extern "C" fn tapcam_project_depth_pixels(
    file_ptr: *const u8,
    file_len: usize,
    rgba_ptr: *const u8,
    rgba_len: usize,
    rgb_width: u32,
    rgb_height: u32,
    depth_ptr: *const u8,
    depth_len: usize,
    depth_width: u32,
    depth_height: u32,
    display_width: u32,
    display_height: u32,
) -> *const u8 {
    let file_bytes = slice::from_raw_parts(file_ptr, file_len);
    let rgba = slice::from_raw_parts(rgba_ptr, rgba_len);
    let depth = slice::from_raw_parts(depth_ptr, depth_len);
    let display_reference = if display_width > 0 && display_height > 0 {
        Some((display_width, display_height))
    } else {
        None
    };
    store_result(pixel_projection_result(project_depth_pixels_inner(
        file_bytes,
        rgba,
        rgb_width,
        rgb_height,
        depth,
        depth_width,
        depth_height,
        display_reference,
    )))
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
    verify_capture_package_bytes(bytes, None)
}

pub fn verify_capture_package_bytes(bytes: &[u8], paired_video: Option<&[u8]>) -> Value {
    match verify_capture_bytes_inner(bytes, paired_video) {
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

pub fn visualize_depth_u8(file_bytes: &[u8], luma: &[u8], width: u32, height: u32) -> Value {
    depth_visualization_result(visualize_depth_u8_inner(
        file_bytes, luma, width, height, None,
    ))
}

pub fn visualize_depth_u8_for_display(
    file_bytes: &[u8],
    luma: &[u8],
    width: u32,
    height: u32,
    display_width: u32,
    display_height: u32,
) -> Value {
    depth_visualization_result(visualize_depth_u8_inner(
        file_bytes,
        luma,
        width,
        height,
        Some((display_width, display_height)),
    ))
}

fn depth_visualization_result(result: Result<Value, String>) -> Value {
    match result {
        Ok(report) => report,
        Err(error) => json!({
            "status": "error",
            "message": error,
            "warnings": [error]
        }),
    }
}

pub fn prepare_original_rgba(
    file_bytes: &[u8],
    rgba: &[u8],
    width: u32,
    height: u32,
    max_edge: u32,
) -> Value {
    match prepare_original_rgba_inner(file_bytes, rgba, width, height, max_edge) {
        Ok(report) => report,
        Err(error) => json!({
            "status": "error",
            "message": error,
            "warnings": [error]
        }),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn project_depth_pixels(
    file_bytes: &[u8],
    rgba: &[u8],
    rgb_width: u32,
    rgb_height: u32,
    depth: &[u8],
    depth_width: u32,
    depth_height: u32,
    display_width: u32,
    display_height: u32,
) -> Value {
    pixel_projection_result(project_depth_pixels_inner(
        file_bytes,
        rgba,
        rgb_width,
        rgb_height,
        depth,
        depth_width,
        depth_height,
        Some((display_width, display_height)),
    ))
}

fn pixel_projection_result(result: Result<Value, String>) -> Value {
    match result {
        Ok(report) => report,
        Err(error) => json!({
            "status": "error",
            "message": error,
            "warnings": [error]
        }),
    }
}

fn verify_capture_bytes_inner(bytes: &[u8], paired_video: Option<&[u8]>) -> Result<Value, String> {
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
    let manifest_schema_id = schema.get("id").and_then(Value::as_str).unwrap_or_default();
    let content_schema_id = content_digest
        .get("schemaID")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let is_live_photo = manifest_schema_id == LIVE_PHOTO_MANIFEST_SCHEMA_ID
        || content_schema_id == LIVE_PHOTO_CONTENT_BINDING_SCHEMA_ID;

    let asset_hash_actual =
        sha256_base64url_excluding(bytes, slot.container_offset, slot.container_length)?;
    let payload_canonical = canonical_json_bytes(payload)?;
    let metadata_hash_actual = sha256_base64url(&payload_canonical);
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
    let mut recomputed_digest: Option<Value> = None;
    let body_sha_actual: Option<String>;
    let expected_signing_binding: Option<Value>;
    let mut paired_video_hash_actual: Option<String> = None;
    let mut live_photo_paired_status = None;

    if is_live_photo {
        let primary_resource = live_photo_primary_resource(
            container,
            bytes.len(),
            &slot,
            &asset_hash_actual,
        );
        let manifest_resource = live_photo_manifest_resource(
            payload_canonical.len(),
            &metadata_hash_actual,
        );
        let embedded_content_digest_body_sha = sha256_base64url(&canonical_json_bytes(content_digest)?);
        expected_signing_binding = Some(json!({
            "bodySHA256": embedded_content_digest_body_sha,
            "captureID": proof_content_capture_id,
            "operation": SIGNING_OPERATION,
            "schemaID": SIGNING_SCHEMA_ID
        }));
        body_sha_actual = Some(embedded_content_digest_body_sha);

        let mut live_photo_scope = SCOPE_LIVE_PHOTO_PRIMARY;
        if let Some(video_bytes) = paired_video {
            let video_hash = sha256_base64url(video_bytes);
            let video_resource = live_photo_paired_video_resource(video_bytes.len(), &video_hash);
            let digest = recompute_live_photo_content_digest(
                container,
                bytes.len(),
                &slot,
                manifest_capture_id,
                manifest_captured_at,
                &asset_hash_actual,
                &metadata_hash_actual,
                payload_canonical.len(),
                &video_hash,
                video_bytes.len(),
            );
            paired_video_hash_actual = Some(video_hash.clone());

            let expected_video_hash = signed_resource_by_role(content_digest, "pairedLivePhotoVideo")
                .and_then(|resource| resource.get("value"))
                .and_then(Value::as_str);
            if expected_video_hash == Some(video_hash.as_str())
                && signed_resource_by_role(content_digest, "pairedLivePhotoVideo")
                    == Some(&video_resource)
            {
                live_photo_scope = SCOPE_FULL_LIVE_PHOTO;
                live_photo_paired_status = Some("matched");
                recomputed_digest = Some(digest);
            } else {
                live_photo_paired_status = Some("mismatch");
            }
        } else {
            live_photo_paired_status = Some("missing");
        }

        let mut live_checks = Vec::new();
        live_checks.push(live_photo_payload_check(payload.get("livePhoto")));
        live_checks.push(optional_json_equality_check(
            "live-photo-primary-resource",
            "Recompute Live Photo primary photo resource",
            &primary_resource,
            signed_resource_by_role(content_digest, "primaryPhoto"),
        ));
        live_checks.push(optional_json_equality_check(
            "live-photo-manifest-resource",
            "Recompute Live Photo manifest payload resource",
            &manifest_resource,
            signed_resource_by_role(content_digest, "tapDepthManifestPayload"),
        ));
        let signed_video_resource = signed_resource_by_role(content_digest, "pairedLivePhotoVideo");
        live_checks.push(live_photo_paired_video_descriptor_check(signed_video_resource));
        if let Some(video_bytes) = paired_video {
            let video_hash = paired_video_hash_actual.as_deref().unwrap_or_default();
            let video_resource = live_photo_paired_video_resource(video_bytes.len(), video_hash);
            if live_photo_paired_status == Some("matched") {
                live_checks.push(optional_json_equality_check(
                    "live-photo-paired-video-resource",
                    "Recompute Live Photo paired MOV resource",
                    &video_resource,
                    signed_video_resource,
                ));
            } else {
                live_checks.push(live_photo_paired_video_scope_warning(
                    "mismatch",
                    Some(&video_resource),
                    signed_video_resource,
                ));
            }
        } else {
            live_checks.push(live_photo_paired_video_scope_warning(
                "missing",
                None,
                signed_video_resource,
            ));
        }

        let mut checks = common_verification_checks(
            &slot,
            schema,
            is_live_photo,
            proofs.len(),
            container,
            payload.get("capture"),
            proof_type,
            proof_algorithm,
            proof_key_id,
            proof_value_key_id,
            proof_created_at,
            manifest_captured_at,
            content_schema_id,
            manifest_capture_id,
            proof_content_capture_id,
            proof_content_captured_at,
            signing_capture_id,
            &asset_hash_actual,
            proof_asset_hash,
            &metadata_hash_actual,
            proof_metadata_hash,
        );
        checks.extend(live_checks);
        if let (Some(body_sha), Some(expected_binding)) =
            (body_sha_actual.as_deref(), expected_signing_binding.as_ref())
        {
            checks.push(equality_check(
                "body-sha",
                "Verify signingBinding.bodySHA256 over embedded content digest",
                body_sha,
                body_sha_expected,
            ));
            checks.push(json_equality_check(
                "signing-binding",
                "Verify signing binding over embedded content digest",
                expected_binding,
                signing_binding,
            ));
        }
        if let Some(digest) = recomputed_digest.as_ref() {
            checks.push(json_equality_check(
                "content-digest",
                "Rebuild canonical Live Photo content digest",
                digest,
                content_digest,
            ));
        }
        checks.push(non_empty_check(
            "assertion-object",
            "Require App Attest assertion object",
            assertion_object,
        ));

        return Ok(build_verification_report(
            is_live_photo,
            live_photo_scope,
            container,
            schema,
            proofs.len(),
            payload,
            manifest_capture_id,
            manifest_captured_at,
            &slot,
            proof_type,
            proof_algorithm,
            proof_key_id,
            proof_created_at,
            &asset_hash_actual,
            &metadata_hash_actual,
            body_sha_actual.as_deref(),
            &signing_binding_sha256,
            paired_video_hash_actual.as_deref(),
            proof_asset_hash,
            proof_metadata_hash,
            body_sha_expected,
            content_digest,
            proof_value_key_id,
            assertion_object,
            signing_binding,
            live_photo_paired_status,
            paired_video.map(|bytes| bytes.len()),
            checks,
        ));
    }

    let digest = recompute_content_digest(
        container,
        bytes.len(),
        &slot,
        manifest_capture_id,
        manifest_captured_at,
        &asset_hash_actual,
        &metadata_hash_actual,
    );
    let body_sha = sha256_base64url(&canonical_json_bytes(&digest)?);
    let signing_binding_expected = json!({
        "bodySHA256": body_sha,
        "captureID": manifest_capture_id,
        "operation": SIGNING_OPERATION,
        "schemaID": SIGNING_SCHEMA_ID
    });
    recomputed_digest = Some(digest);
    body_sha_actual = Some(body_sha);
    expected_signing_binding = Some(signing_binding_expected);

    let mut checks = common_verification_checks(
        &slot,
        schema,
        is_live_photo,
        proofs.len(),
        container,
        payload.get("capture"),
        proof_type,
        proof_algorithm,
        proof_key_id,
        proof_value_key_id,
        proof_created_at,
        manifest_captured_at,
        content_schema_id,
        manifest_capture_id,
        proof_content_capture_id,
        proof_content_captured_at,
        signing_capture_id,
        &asset_hash_actual,
        proof_asset_hash,
        &metadata_hash_actual,
        proof_metadata_hash,
    );
    checks.push(equality_check(
        "body-sha",
        "Recompute signingBinding.bodySHA256",
        body_sha_actual.as_deref().unwrap_or_default(),
        body_sha_expected,
    ));
    checks.push(json_equality_check(
        "content-digest",
        "Rebuild canonical content digest",
        recomputed_digest.as_ref().unwrap(),
        content_digest,
    ));
    checks.push(json_equality_check(
        "signing-binding",
        "Rebuild signing binding",
        expected_signing_binding.as_ref().unwrap(),
        signing_binding,
    ));
    checks.push(non_empty_check(
        "assertion-object",
        "Require App Attest assertion object",
        assertion_object,
    ));

    Ok(build_verification_report(
        is_live_photo,
        SCOPE_STILL_PHOTO,
        container,
        schema,
        proofs.len(),
        payload,
        manifest_capture_id,
        manifest_captured_at,
        &slot,
        proof_type,
        proof_algorithm,
        proof_key_id,
        proof_created_at,
        &asset_hash_actual,
        &metadata_hash_actual,
        body_sha_actual.as_deref(),
        &signing_binding_sha256,
        paired_video_hash_actual.as_deref(),
        proof_asset_hash,
        proof_metadata_hash,
        body_sha_expected,
        content_digest,
        proof_value_key_id,
        assertion_object,
        signing_binding,
        live_photo_paired_status,
        paired_video.map(|bytes| bytes.len()),
        checks,
    ))
}

fn visualize_depth_u8_inner(
    file_bytes: &[u8],
    luma: &[u8],
    width: u32,
    height: u32,
    display_reference: Option<(u32, u32)>,
) -> Result<Value, String> {
    if width == 0 || height == 0 {
        return Err("decoded depth plane has zero dimensions".to_string());
    }
    let width_usize = width as usize;
    let height_usize = height as usize;
    let expected_len = width_usize
        .checked_mul(height_usize)
        .ok_or("decoded depth plane dimensions overflow")?;
    if luma.len() < expected_len {
        return Err(format!(
            "decoded depth plane is too short: got {}, expected {}",
            luma.len(),
            expected_len
        ));
    }

    let manifest_json = extract_tap_manifest_json(file_bytes)?;
    let manifest: Value = serde_json::from_str(&manifest_json)
        .map_err(|error| format!("tapdepth:Manifest is not valid JSON: {error}"))?;
    let payload = field(&manifest, "payload")?;
    let depth = field(payload, "depth")?;
    let manifest_width = optional_u32(depth, "width");
    let manifest_height = optional_u32(depth, "height");
    let source_kind = depth
        .get("auxiliaryDataKind")
        .and_then(Value::as_str)
        .or_else(|| depth.get("pixelFormat").and_then(Value::as_str))
        .unwrap_or("unknown");
    let pixel_format = depth
        .get("pixelFormat")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let metric_unit = depth
        .get("metricUnit")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let orientation = depth
        .get("orientation")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let photo_orientation = payload
        .get("photo")
        .and_then(|photo| photo.get("orientation"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let is_front_camera = is_front_camera_capture(payload);

    let (display_width, display_height) = display_reference
        .map(|(width, height)| (Some(width), Some(height)))
        .unwrap_or((manifest_width, manifest_height));

    let transform = display_orientation_transform(
        width,
        height,
        display_width,
        display_height,
        Some(photo_orientation),
        is_front_camera,
    );
    let (output_width, output_height) = transform.output_dimensions(width, height);

    let raw_min = *luma[..expected_len]
        .iter()
        .min()
        .ok_or("decoded depth plane is empty")?;
    let raw_max = *luma[..expected_len]
        .iter()
        .max()
        .ok_or("decoded depth plane is empty")?;
    let apdi_min = extract_xml_number(file_bytes, "apdi:FloatMinValue");
    let apdi_max = extract_xml_number(file_bytes, "apdi:FloatMaxValue");
    let (min_value, max_value, value_range_kind) = match (apdi_min, apdi_max) {
        (Some(min), Some(max)) if max > min => (min, max, "apdi-float-range"),
        _ => (raw_min as f64, raw_max as f64, "decoded-luma-range"),
    };
    let value_unit =
        infer_depth_value_unit(source_kind, pixel_format, metric_unit, value_range_kind);

    let mut rgba = vec![0u8; output_width as usize * output_height as usize * 4];
    for y in 0..output_height as usize {
        for x in 0..output_width as usize {
            let (source_x, source_y) =
                inverse_orientation_transform(x as f64, y as f64, width, height, transform);
            let source_x = source_x.round().clamp(0.0, (width - 1) as f64) as usize;
            let source_y = source_y.round().clamp(0.0, (height - 1) as f64) as usize;
            let value = luma[source_y * width_usize + source_x];
            let normalized = normalize_u8(value, raw_min, raw_max);
            let (red, green, blue) = depth_color(normalized);
            let offset = (y * output_width as usize + x) * 4;
            rgba[offset] = red;
            rgba[offset + 1] = green;
            rgba[offset + 2] = blue;
            rgba[offset + 3] = 255;
        }
    }

    let mut warnings = Vec::new();
    if manifest_width != Some(output_width) || manifest_height != Some(output_height) {
        warnings.push(format!(
            "decoded depth preview is {}x{} but manifest depth is {}x{}",
            output_width,
            output_height,
            manifest_width
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string()),
            manifest_height
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        ));
    }

    Ok(json!({
        "status": "available",
        "sourceKind": source_kind,
        "width": output_width,
        "height": output_height,
        "inputWidth": width,
        "inputHeight": height,
        "minValue": min_value,
        "maxValue": max_value,
        "valueRangeKind": value_range_kind,
        "valueUnit": value_unit,
        "rawMin": raw_min,
        "rawMax": raw_max,
        "orientation": orientation,
        "photoOrientation": photo_orientation,
        "rotation": transform.as_report_str(),
        "previewRgbaBase64": STANDARD.encode(rgba),
        "warnings": warnings
    }))
}

fn prepare_original_rgba_inner(
    file_bytes: &[u8],
    rgba: &[u8],
    width: u32,
    height: u32,
    max_edge: u32,
) -> Result<Value, String> {
    if width == 0 || height == 0 {
        return Err("decoded original image has zero dimensions".to_string());
    }

    let width_usize = width as usize;
    let height_usize = height as usize;
    let expected_len = width_usize
        .checked_mul(height_usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or("decoded original image dimensions overflow")?;
    if rgba.len() < expected_len {
        return Err(format!(
            "decoded original RGBA is too short: got {}, expected {}",
            rgba.len(),
            expected_len
        ));
    }

    let photo_metadata = read_photo_metadata(file_bytes).unwrap_or_default();
    let transform = OrientationTransform::None;
    let (oriented_width, oriented_height) = transform.output_dimensions(width, height);
    let max_edge = if max_edge == 0 {
        oriented_width.max(oriented_height)
    } else {
        max_edge
    };
    let scale = (max_edge as f64 / oriented_width.max(oriented_height) as f64).min(1.0);
    let output_width = ((oriented_width as f64 * scale).round() as u32).max(1);
    let output_height = ((oriented_height as f64 * scale).round() as u32).max(1);

    let mut preview = vec![0u8; output_width as usize * output_height as usize * 4];
    resample_original_rgba(
        rgba,
        width,
        height,
        transform,
        oriented_width,
        oriented_height,
        output_width,
        output_height,
        &mut preview,
    );

    let mut warnings = Vec::new();
    if output_width != oriented_width || output_height != oriented_height {
        warnings.push(format!(
            "original preview was downscaled from {}x{} to {}x{}",
            oriented_width, oriented_height, output_width, output_height
        ));
    }
    Ok(json!({
        "status": "available",
        "sourceKind": "heif-primary-image",
        "width": output_width,
        "height": output_height,
        "inputWidth": width,
        "inputHeight": height,
        "orientedWidth": oriented_width,
        "orientedHeight": oriented_height,
        "photoOrientation": photo_metadata.orientation.unwrap_or_else(|| "unknown".to_string()),
        "rotation": transform.as_report_str(),
        "scale": scale,
        "previewRgbaBase64": STANDARD.encode(preview),
        "warnings": warnings
    }))
}

#[allow(clippy::too_many_arguments)]
fn project_depth_pixels_inner(
    file_bytes: &[u8],
    rgba: &[u8],
    rgb_width: u32,
    rgb_height: u32,
    depth_luma: &[u8],
    depth_width: u32,
    depth_height: u32,
    display_reference: Option<(u32, u32)>,
) -> Result<Value, String> {
    if rgb_width == 0 || rgb_height == 0 {
        return Err("decoded RGB image has zero dimensions".to_string());
    }
    if depth_width == 0 || depth_height == 0 {
        return Err("decoded depth plane has zero dimensions".to_string());
    }

    let expected_rgba_len = (rgb_width as usize)
        .checked_mul(rgb_height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or("decoded RGB image dimensions overflow")?;
    if rgba.len() < expected_rgba_len {
        return Err(format!(
            "decoded RGB RGBA is too short: got {}, expected {}",
            rgba.len(),
            expected_rgba_len
        ));
    }

    let expected_depth_len = (depth_width as usize)
        .checked_mul(depth_height as usize)
        .ok_or("decoded depth plane dimensions overflow")?;
    if depth_luma.len() < expected_depth_len {
        return Err(format!(
            "decoded depth plane is too short: got {}, expected {}",
            depth_luma.len(),
            expected_depth_len
        ));
    }

    let manifest_json = extract_tap_manifest_json(file_bytes)?;
    let manifest: Value = serde_json::from_str(&manifest_json)
        .map_err(|error| format!("tapdepth:Manifest is not valid JSON: {error}"))?;
    let payload = field(&manifest, "payload")?;
    let depth = field(payload, "depth")?;
    let manifest_width = optional_u32(depth, "width");
    let manifest_height = optional_u32(depth, "height");
    let source_kind = depth
        .get("auxiliaryDataKind")
        .and_then(Value::as_str)
        .or_else(|| depth.get("pixelFormat").and_then(Value::as_str))
        .unwrap_or("unknown");
    let pixel_format = depth
        .get("pixelFormat")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let metric_unit = depth
        .get("metricUnit")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let orientation = depth
        .get("orientation")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let photo_orientation = payload
        .get("photo")
        .and_then(|photo| photo.get("orientation"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let is_front_camera = is_front_camera_capture(payload);

    let (display_width, display_height) = display_reference
        .map(|(width, height)| (Some(width), Some(height)))
        .unwrap_or((manifest_width, manifest_height));
    let transform = display_orientation_transform(
        depth_width,
        depth_height,
        display_width,
        display_height,
        Some(photo_orientation),
        is_front_camera,
    );
    let (output_width, output_height) = transform.output_dimensions(depth_width, depth_height);

    let raw_min = *depth_luma[..expected_depth_len]
        .iter()
        .min()
        .ok_or("decoded depth plane is empty")?;
    let raw_max = *depth_luma[..expected_depth_len]
        .iter()
        .max()
        .ok_or("decoded depth plane is empty")?;
    let apdi_min = extract_xml_number(file_bytes, "apdi:FloatMinValue");
    let apdi_max = extract_xml_number(file_bytes, "apdi:FloatMaxValue");
    let (min_value, max_value, value_range_kind) = match (apdi_min, apdi_max) {
        (Some(min), Some(max)) if max > min => (min, max, "apdi-float-range"),
        _ => (raw_min as f64, raw_max as f64, "decoded-luma-range"),
    };
    let value_unit =
        infer_depth_value_unit(source_kind, pixel_format, metric_unit, value_range_kind);
    let relative_geometry = true;
    let camera = if is_front_camera {
        pinhole_camera_from_manifest(depth, depth_width, depth_height)
            .map(|camera| camera.display_oriented(transform))
    } else {
        pinhole_camera_from_manifest(depth, output_width, output_height)
    }
    .unwrap_or_else(|| virtual_pinhole_camera(output_width, output_height));
    let sample_step = output_width
        .max(output_height)
        .div_ceil(PIXEL_PROJECTION_TARGET_MAX_EDGE)
        .max(1);
    let display_depth = display_oriented_depth_grid(
        depth_luma,
        depth_width,
        depth_height,
        output_width,
        output_height,
        transform,
    );
    let quality = analyze_depth_quality(
        &display_depth,
        output_width,
        output_height,
        raw_min,
        raw_max,
        manifest_width,
        manifest_height,
        rgb_width,
        rgb_height,
        depth,
        camera,
    );
    let mut positions = Vec::new();
    let mut colors = Vec::new();
    let mut risk_flags = Vec::new();
    let mut outlier_scores = Vec::new();
    let mut discontinuity_scores = Vec::new();

    for y in (0..output_height).step_by(sample_step as usize) {
        for x in (0..output_width).step_by(sample_step as usize) {
            let display_index = (y as usize) * (output_width as usize) + x as usize;
            let raw_value = display_depth[display_index];
            let normalized = normalize_u8(raw_value, raw_min, raw_max) as f64;
            let display_value = depth_display_value(normalized, min_value, max_value);
            let relative_depth =
                relative_depth_from_value(display_value, min_value, max_value, value_unit);
            let (x_unit, y_unit, view_z) =
                back_project_pixel_to_view_space(x as f64, y as f64, relative_depth, camera);
            push_f32_le(&mut positions, x_unit as f32);
            push_f32_le(&mut positions, y_unit as f32);
            push_f32_le(&mut positions, view_z as f32);

            let rgb_x = scaled_coordinate(x, output_width, rgb_width);
            let rgb_y = scaled_coordinate(y, output_height, rgb_height);
            let rgb_offset = (rgb_y * rgb_width as usize + rgb_x) * 4;
            colors.push(rgba[rgb_offset]);
            colors.push(rgba[rgb_offset + 1]);
            colors.push(rgba[rgb_offset + 2]);
            push_u16_le(&mut risk_flags, quality.flags[display_index]);
            outlier_scores.push(quality.outlier_scores[display_index]);
            discontinuity_scores.push(quality.discontinuity_scores[display_index]);
        }
    }

    let mut warnings = Vec::new();
    if camera.model == "metadata-pinhole" {
        warnings.push(
            "relative geometry: using manifest camera calibration intrinsics without a stable world coordinate system"
                .to_string(),
        );
    } else {
        warnings.push(
            "relative geometry: camera calibration intrinsics are unavailable; using a virtual pinhole camera"
                .to_string(),
        );
    }
    if value_unit == "disparity" {
        warnings.push("disparity was converted to relative depth for inspection only".to_string());
    }
    if sample_step > 1 {
        warnings.push(format!(
            "point cloud was sampled every {} pixels for browser performance",
            sample_step
        ));
    }
    if manifest_width != Some(output_width) || manifest_height != Some(output_height) {
        warnings.push(format!(
            "projected depth is {}x{} but manifest depth is {}x{}",
            output_width,
            output_height,
            manifest_width
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string()),
            manifest_height
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        ));
    }
    if aspect_ratio_delta(output_width, output_height, rgb_width, rgb_height) > 0.05 {
        warnings.push(format!(
            "RGB aspect ratio {}x{} does not closely match projected depth {}x{}",
            rgb_width, rgb_height, output_width, output_height
        ));
    }

    Ok(json!({
        "status": "available",
        "geometryKind": "signed-depth-pixel-point-cloud",
        "viewMode": "capture-camera",
        "cameraModel": camera.model,
        "imageWidth": camera.image_width,
        "imageHeight": camera.image_height,
        "fx": camera.fx,
        "fy": camera.fy,
        "cx": camera.cx,
        "cy": camera.cy,
        "sourceKind": source_kind,
        "valueUnit": value_unit,
        "relativeGeometry": relative_geometry,
        "pointCount": positions.len() / 12,
        "sampleStep": sample_step,
        "width": output_width,
        "height": output_height,
        "inputDepthWidth": depth_width,
        "inputDepthHeight": depth_height,
        "rgbWidth": rgb_width,
        "rgbHeight": rgb_height,
        "orientation": orientation,
        "photoOrientation": photo_orientation,
        "rotation": transform.as_report_str(),
        "depthRange": {
            "min": min_value,
            "max": max_value,
            "kind": value_range_kind,
            "rawMin": raw_min,
            "rawMax": raw_max
        },
        "quality": quality.report,
        "positionsBase64": STANDARD.encode(positions),
        "colorsBase64": STANDARD.encode(colors),
        "riskFlagsBase64": STANDARD.encode(risk_flags),
        "outlierScoresBase64": STANDARD.encode(outlier_scores),
        "discontinuityScoresBase64": STANDARD.encode(discontinuity_scores),
        "warnings": warnings
    }))
}

struct DepthQualityAnalysis {
    report: Value,
    flags: Vec<u16>,
    outlier_scores: Vec<u8>,
    discontinuity_scores: Vec<u8>,
}

#[allow(clippy::too_many_arguments)]
fn analyze_depth_quality(
    display_depth: &[u8],
    width: u32,
    height: u32,
    raw_min: u8,
    raw_max: u8,
    manifest_width: Option<u32>,
    manifest_height: Option<u32>,
    rgb_width: u32,
    rgb_height: u32,
    depth_metadata: &Value,
    camera: PinholeCamera,
) -> DepthQualityAnalysis {
    let point_count = display_depth.len();
    let mut flags = vec![0u16; point_count];
    let mut warnings = Vec::<Value>::new();

    let clipped_low_count = mark_matching_flags(
        display_depth,
        &mut flags,
        |value| value <= 1,
        RISK_CLIPPED_LOW,
    );
    let clipped_high_count = mark_matching_flags(
        display_depth,
        &mut flags,
        |value| value >= 254,
        RISK_CLIPPED_HIGH,
    );
    let clipped_low_ratio = ratio(clipped_low_count, point_count);
    let clipped_high_ratio = ratio(clipped_high_count, point_count);

    let raw_range = raw_max.saturating_sub(raw_min) as f64;
    let (p01, p99) = depth_percentiles(display_depth);
    let robust_range = p99.saturating_sub(p01) as f64;
    let range_empty = raw_max == raw_min;
    let narrow_range =
        range_empty || robust_range < 8.0 || (raw_range > 0.0 && robust_range < raw_range * 0.03);
    if narrow_range {
        for flag in &mut flags {
            *flag |= RISK_NARROW_RANGE;
        }
    }

    if range_empty {
        warnings.push(quality_warning(
            "depth-range-empty",
            "high",
            true,
            Some(point_count),
            "Decoded depth has a constant value; relative geometry is not reliable.",
        ));
    } else if narrow_range {
        warnings.push(quality_warning(
            "depth-range-narrow",
            "warning",
            true,
            Some(point_count),
            "Decoded depth has an extremely narrow useful range; the point cloud may collapse visually.",
        ));
    }

    if clipped_low_ratio > 0.05 {
        warnings.push(quality_warning(
            "clipped-low-depth",
            if clipped_low_ratio > 0.20 {
                "high"
            } else {
                "warning"
            },
            true,
            Some(clipped_low_count),
            "Some depth samples are clipped near the low end of the decoded range.",
        ));
    }
    if clipped_high_ratio > 0.05 {
        warnings.push(quality_warning(
            "clipped-high-depth",
            if clipped_high_ratio > 0.20 {
                "high"
            } else {
                "warning"
            },
            true,
            Some(clipped_high_count),
            "Some depth samples are clipped near the high end of the decoded range.",
        ));
    }

    let mut outlier_scores = vec![0u8; point_count];
    let mut discontinuity_scores = vec![0u8; point_count];
    let denominator = robust_range.max(raw_range).max(1.0);
    let outlier_count = mark_isolated_outliers(
        display_depth,
        width,
        height,
        denominator,
        &mut flags,
        &mut outlier_scores,
    );
    let discontinuity_count = mark_discontinuities(
        display_depth,
        width,
        height,
        denominator,
        &mut flags,
        &mut discontinuity_scores,
    );
    let outlier_ratio = ratio(outlier_count, point_count);
    let discontinuity_ratio = ratio(discontinuity_count, point_count);

    if outlier_count > 0 {
        warnings.push(quality_warning(
            "isolated-depth-outliers",
            if outlier_ratio > 0.05 {
                "warning"
            } else {
                "notice"
            },
            true,
            Some(outlier_count),
            "Isolated depth samples differ sharply from their local neighborhood.",
        ));
    }
    if discontinuity_ratio > 0.05 {
        warnings.push(quality_warning(
            "depth-discontinuity-edges",
            if discontinuity_ratio > 0.20 { "warning" } else { "notice" },
            true,
            Some(discontinuity_count),
            "Abrupt depth jumps were found; these may be real object edges or unreliable depth boundaries.",
        ));
    }

    let manifest_mismatch = manifest_width != Some(width) || manifest_height != Some(height);
    if manifest_mismatch {
        warnings.push(quality_warning(
            "manifest-depth-size-mismatch",
            "warning",
            true,
            Some(point_count),
            "Projected depth dimensions differ from the signed manifest dimensions.",
        ));
        for flag in &mut flags {
            *flag |= RISK_ALIGNMENT_EDGE;
        }
    }

    let aspect_delta = aspect_ratio_delta(width, height, rgb_width, rgb_height);
    let alignment_risk = if manifest_mismatch || aspect_delta > 0.05 {
        "warning"
    } else if aspect_delta > 0.01 {
        "notice"
    } else {
        "ok"
    };
    if aspect_delta > 0.01 {
        warnings.push(quality_warning(
            "rgb-depth-aspect-mismatch",
            alignment_risk,
            true,
            if aspect_delta > 0.05 { Some(point_count) } else { None },
            "RGB and projected depth aspect ratios differ; color overlay alignment may be unreliable.",
        ));
        if aspect_delta > 0.05 {
            for flag in &mut flags {
                *flag |= RISK_ALIGNMENT_EDGE;
            }
        }
    }

    if camera.model == "metadata-pinhole" && has_distortion_lookup_metadata(depth_metadata) {
        let mut affected = 0usize;
        for y in 0..height {
            for x in 0..width {
                if is_projection_edge_pixel(x, y, width, height) {
                    flags[y as usize * width as usize + x as usize] |=
                        RISK_DISTORTION_UNCORRECTED_EDGE;
                    affected += 1;
                }
            }
        }
        warnings.push(quality_warning(
            "distortion-uncorrected-edge",
            "notice",
            true,
            Some(affected),
            "Manifest camera calibration indicates lens distortion data, but this relative point cloud uses pinhole intrinsics only.",
        ));
    }

    let global_risk = global_risk_from_warnings(&warnings, range_empty);
    DepthQualityAnalysis {
        report: json!({
            "globalRisk": global_risk,
            "metrics": {
                "clippedLowRatio": clipped_low_ratio,
                "clippedHighRatio": clipped_high_ratio,
                "robustRange": robust_range,
                "discontinuityRatio": discontinuity_ratio,
                "outlierRatio": outlier_ratio,
                "alignmentRisk": alignment_risk
            },
            "warnings": warnings
        }),
        flags,
        outlier_scores,
        discontinuity_scores,
    }
}

fn display_oriented_depth_grid(
    depth_luma: &[u8],
    depth_width: u32,
    depth_height: u32,
    output_width: u32,
    output_height: u32,
    transform: OrientationTransform,
) -> Vec<u8> {
    let mut output = Vec::with_capacity(output_width as usize * output_height as usize);
    let depth_width_usize = depth_width as usize;
    for y in 0..output_height {
        for x in 0..output_width {
            let (source_x, source_y) = inverse_orientation_transform(
                x as f64,
                y as f64,
                depth_width,
                depth_height,
                transform,
            );
            let source_x = source_x.round().clamp(0.0, (depth_width - 1) as f64) as usize;
            let source_y = source_y.round().clamp(0.0, (depth_height - 1) as f64) as usize;
            output.push(depth_luma[source_y * depth_width_usize + source_x]);
        }
    }
    output
}

fn mark_matching_flags(
    values: &[u8],
    flags: &mut [u16],
    predicate: impl Fn(u8) -> bool,
    flag: u16,
) -> usize {
    let mut count = 0usize;
    for (index, value) in values.iter().copied().enumerate() {
        if predicate(value) {
            flags[index] |= flag;
            count += 1;
        }
    }
    count
}

fn mark_isolated_outliers(
    values: &[u8],
    width: u32,
    height: u32,
    denominator: f64,
    flags: &mut [u16],
    scores: &mut [u8],
) -> usize {
    let mut count = 0usize;
    for y in 0..height {
        for x in 0..width {
            let index = y as usize * width as usize + x as usize;
            let neighbors = neighbor_values(values, width, height, x, y, true);
            if neighbors.len() < 5 {
                continue;
            }
            let median = median_u8(neighbors.clone()) as f64;
            let score = ((values[index] as f64 - median).abs() / denominator).clamp(0.0, 2.55);
            scores[index] = (score * 100.0).round().clamp(0.0, 255.0) as u8;
            let consistent_neighbors = neighbors
                .iter()
                .filter(|value| ((**value as f64) - median).abs() <= denominator * 0.10)
                .count();
            let required_neighbors = ((neighbors.len() * 2) + 2) / 3;
            if score >= OUTLIER_MEDIUM_THRESHOLD && consistent_neighbors >= required_neighbors {
                flags[index] |= RISK_ISOLATED_OUTLIER;
                count += 1;
            }
        }
    }
    count
}

fn mark_discontinuities(
    values: &[u8],
    width: u32,
    height: u32,
    denominator: f64,
    flags: &mut [u16],
    scores: &mut [u8],
) -> usize {
    let mut count = 0usize;
    for y in 0..height {
        for x in 0..width {
            let index = y as usize * width as usize + x as usize;
            let center = values[index] as f64;
            let max_delta = neighbor_values(values, width, height, x, y, false)
                .into_iter()
                .map(|value| (center - value as f64).abs())
                .fold(0.0, f64::max);
            let score = (max_delta / denominator).clamp(0.0, 2.55);
            scores[index] = (score * 100.0).round().clamp(0.0, 255.0) as u8;
            if score >= DISCONTINUITY_MEDIUM_THRESHOLD {
                flags[index] |= RISK_DISCONTINUITY_EDGE;
                count += 1;
            }
        }
    }
    count
}

fn neighbor_values(
    values: &[u8],
    width: u32,
    height: u32,
    x: u32,
    y: u32,
    diagonal: bool,
) -> Vec<u8> {
    let mut neighbors = Vec::with_capacity(if diagonal { 8 } else { 4 });
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            if !diagonal && dx.abs() + dy.abs() != 1 {
                continue;
            }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= width as i32 || ny >= height as i32 {
                continue;
            }
            neighbors.push(values[ny as usize * width as usize + nx as usize]);
        }
    }
    neighbors
}

fn median_u8(mut values: Vec<u8>) -> u8 {
    values.sort_unstable();
    values[values.len() / 2]
}

fn depth_percentiles(values: &[u8]) -> (u8, u8) {
    if values.is_empty() {
        return (0, 0);
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let last = sorted.len() - 1;
    let p01 = sorted[((last as f64) * 0.01).floor() as usize];
    let p99 = sorted[((last as f64) * 0.99).ceil().min(last as f64) as usize];
    (p01, p99)
}

fn has_distortion_lookup_metadata(depth_metadata: &Value) -> bool {
    depth_metadata
        .get("cameraCalibration")
        .is_some_and(|calibration| {
            calibration
                .get("lensDistortionLookupTablePresent")
                .and_then(Value::as_bool)
                == Some(true)
                || calibration
                    .get("inverseLensDistortionLookupTablePresent")
                    .and_then(Value::as_bool)
                    == Some(true)
        })
}

fn is_projection_edge_pixel(x: u32, y: u32, width: u32, height: u32) -> bool {
    let edge = ((width.min(height) as f64) * 0.10).ceil().max(1.0) as u32;
    x < edge || y < edge || x + edge >= width || y + edge >= height
}

fn quality_warning(
    id: &str,
    severity: &str,
    filterable: bool,
    affected_point_count: Option<usize>,
    message: &str,
) -> Value {
    json!({
        "id": id,
        "severity": severity,
        "filterable": filterable,
        "affectedPointCount": affected_point_count,
        "message": message
    })
}

fn global_risk_from_warnings(warnings: &[Value], range_empty: bool) -> &'static str {
    if range_empty {
        return "poor";
    }
    if warnings
        .iter()
        .any(|warning| warning.get("severity").and_then(Value::as_str) == Some("high"))
    {
        return "warning";
    }
    if warnings
        .iter()
        .any(|warning| warning.get("severity").and_then(Value::as_str) == Some("warning"))
    {
        return "warning";
    }
    if warnings
        .iter()
        .any(|warning| warning.get("severity").and_then(Value::as_str) == Some("notice"))
    {
        return "notice";
    }
    "ok"
}

fn ratio(count: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        count as f64 / total as f64
    }
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

    fn uniform_type_identifier(self) -> &'static str {
        match self {
            Container::Heic => "public.heic",
            Container::Jpeg => "public.jpeg",
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
        "assetHash": asset_hash_object(container, byte_count, slot, asset_hash),
        "metadataHash": metadata_hash_object(MANIFEST_PAYLOAD_MEDIA_TYPE_V1, metadata_hash),
        "proofSlot": proof_slot_object(slot),
        "depthResource": depth_resource_object()
    })
}

#[allow(clippy::too_many_arguments)]
fn recompute_live_photo_content_digest(
    container: Container,
    byte_count: usize,
    slot: &ProofSlot,
    capture_id: &str,
    captured_at: &str,
    asset_hash: &str,
    metadata_hash: &str,
    payload_byte_count: usize,
    paired_video_hash: &str,
    paired_video_byte_count: usize,
) -> Value {
    json!({
        "schemaID": LIVE_PHOTO_CONTENT_BINDING_SCHEMA_ID,
        "manifestSchemaID": LIVE_PHOTO_MANIFEST_SCHEMA_ID,
        "captureID": capture_id,
        "capturedAt": captured_at,
        "assetHash": asset_hash_object(container, byte_count, slot, asset_hash),
        "metadataHash": metadata_hash_object(MANIFEST_PAYLOAD_MEDIA_TYPE_V2, metadata_hash),
        "proofSlot": proof_slot_object(slot),
        "depthResource": depth_resource_object(),
        "signedResources": [
            live_photo_primary_resource(container, byte_count, slot, asset_hash),
            live_photo_manifest_resource(payload_byte_count, metadata_hash),
            live_photo_paired_video_resource(paired_video_byte_count, paired_video_hash)
        ]
    })
}

fn asset_hash_object(
    container: Container,
    byte_count: usize,
    slot: &ProofSlot,
    asset_hash: &str,
) -> Value {
    json!({
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
    })
}

fn metadata_hash_object(media_type: &str, metadata_hash: &str) -> Value {
    json!({
        "kind": "canonical-json",
        "mediaType": media_type,
        "algorithm": "SHA-256",
        "value": metadata_hash
    })
}

fn proof_slot_object(slot: &ProofSlot) -> Value {
    json!({
        "kind": slot.kind,
        "offset": slot.container_offset,
        "length": slot.container_length,
        "payloadOffset": slot.payload_offset,
        "payloadLength": slot.payload_length,
        "padding": "zero-filled-after-envelope"
    })
}

fn depth_resource_object() -> Value {
    json!({
        "presence": "required",
        "binding": "covered-by-assetHash",
        "interpretation": "not-part-of-base-signature",
        "platformPresenceCheck": "AVDepthData-readback"
    })
}

fn live_photo_primary_resource(
    container: Container,
    byte_count: usize,
    slot: &ProofSlot,
    asset_hash: &str,
) -> Value {
    let asset = asset_hash_object(container, byte_count, slot, asset_hash);
    json!({
        "role": "primaryPhoto",
        "kind": asset["kind"],
        "mediaType": container.uniform_type_identifier(),
        "algorithm": asset["algorithm"],
        "byteCount": asset["byteCount"],
        "value": asset["value"],
        "binding": "format-native-byte-ranges",
        "excludedRanges": asset["excludedRanges"]
    })
}

fn live_photo_manifest_resource(payload_byte_count: usize, metadata_hash: &str) -> Value {
    json!({
        "role": "tapDepthManifestPayload",
        "kind": "canonical-json",
        "mediaType": MANIFEST_PAYLOAD_MEDIA_TYPE_V2,
        "algorithm": "SHA-256",
        "byteCount": payload_byte_count,
        "value": metadata_hash,
        "binding": "canonical-json"
    })
}

fn live_photo_paired_video_resource(byte_count: usize, video_hash: &str) -> Value {
    json!({
        "role": "pairedLivePhotoVideo",
        "kind": "format-native-full-file",
        "mediaType": QUICKTIME_MOVIE_MEDIA_TYPE,
        "algorithm": "SHA-256",
        "byteCount": byte_count,
        "value": video_hash,
        "binding": "full-file"
    })
}

fn signed_resource_by_role<'a>(content_digest: &'a Value, role: &str) -> Option<&'a Value> {
    content_digest
        .get("signedResources")?
        .as_array()?
        .iter()
        .find(|resource| resource.get("role").and_then(Value::as_str) == Some(role))
}

#[allow(clippy::too_many_arguments)]
fn common_verification_checks(
    slot: &ProofSlot,
    schema: &Value,
    is_live_photo: bool,
    proof_count: usize,
    container: Container,
    capture: Option<&Value>,
    proof_type: &str,
    proof_algorithm: &str,
    proof_key_id: &str,
    proof_value_key_id: &str,
    proof_created_at: &str,
    manifest_captured_at: &str,
    content_schema_id: &str,
    manifest_capture_id: &str,
    proof_content_capture_id: &str,
    proof_content_captured_at: &str,
    signing_capture_id: &str,
    asset_hash_actual: &str,
    proof_asset_hash: &str,
    metadata_hash_actual: &str,
    proof_metadata_hash: &str,
) -> Vec<Value> {
    vec![
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
        schema_check(schema, is_live_photo),
        manifest_proofs_empty_check(proof_count),
        capture_policy_check(container, capture),
        equality_check(
            "proof-type",
            "Require appAttestAssertion proof",
            proof_type,
            PROOF_TYPE,
        ),
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
            if is_live_photo {
                "Require content-binding v3 schema"
            } else {
                "Require content-binding v2 schema"
            },
            content_schema_id,
            if is_live_photo {
                LIVE_PHOTO_CONTENT_BINDING_SCHEMA_ID
            } else {
                CONTENT_BINDING_SCHEMA_ID
            },
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
            asset_hash_actual,
            proof_asset_hash,
        ),
        equality_check(
            "metadata-hash",
            "Recompute manifest payload metadata hash",
            metadata_hash_actual,
            proof_metadata_hash,
        ),
    ]
}

#[allow(clippy::too_many_arguments)]
fn build_verification_report(
    is_live_photo: bool,
    verification_scope: &str,
    container: Container,
    schema: &Value,
    proof_count: usize,
    payload: &Value,
    manifest_capture_id: &str,
    manifest_captured_at: &str,
    slot: &ProofSlot,
    proof_type: &str,
    proof_algorithm: &str,
    proof_key_id: &str,
    proof_created_at: &str,
    asset_hash_actual: &str,
    metadata_hash_actual: &str,
    body_sha_actual: Option<&str>,
    signing_binding_sha256: &str,
    paired_video_hash_actual: Option<&str>,
    proof_asset_hash: &str,
    proof_metadata_hash: &str,
    body_sha_expected: &str,
    content_digest: &Value,
    proof_value_key_id: &str,
    assertion_object: &str,
    signing_binding: &Value,
    live_photo_paired_status: Option<&str>,
    paired_video_byte_count: Option<usize>,
    checks: Vec<Value>,
) -> Value {
    let has_failed = checks.iter().any(|check| check["status"] == "fail");
    let status = if has_failed { "invalid" } else { "valid" };
    let summary = if has_failed && is_live_photo {
        "The TAP Live Photo primary photo scope failed local self-checks."
    } else if has_failed {
        "The TAP content binding failed local self-checks."
    } else if verification_scope == SCOPE_FULL_LIVE_PHOTO {
        "Full TAP Live Photo content binding checks passed locally."
    } else if verification_scope == SCOPE_LIVE_PHOTO_PRIMARY {
        "TAP Live Photo primary photo checks passed locally; paired video was not verified."
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
    let expected_video_hash = signed_resource_by_role(content_digest, "pairedLivePhotoVideo")
        .and_then(|resource| resource.get("value"))
        .and_then(Value::as_str);
    let paired_status = live_photo_paired_status.unwrap_or("unknown");
    let full_live_photo_verified = !has_failed && is_live_photo && paired_status == "matched";
    let primary_photo_verified = !has_failed && is_live_photo;
    let warnings = live_photo_scope_warnings(is_live_photo, paired_status);

    json!({
        "status": status,
        "summary": summary,
        "mediaKind": if is_live_photo { "livePhoto" } else { "stillPhoto" },
        "verificationScope": verification_scope,
        "claims": {
            "primaryPhotoVerified": if is_live_photo { primary_photo_verified } else { !has_failed },
            "manifestVerified": !has_failed,
            "pairedVideoVerified": full_live_photo_verified,
            "fullLivePhotoVerified": full_live_photo_verified
        },
        "warnings": warnings,
        "captureId": manifest_capture_id,
        "capturedAt": manifest_captured_at,
        "manifest": {
            "containerFormat": container.as_report_str(),
            "schemaId": schema.get("id").and_then(Value::as_str),
            "proofCount": proof_count,
            "capture": payload.get("capture"),
            "livePhoto": payload.get("livePhoto")
        },
        "livePhoto": if is_live_photo {
            json!({
                "pairedVideoFilename": payload
                    .get("livePhoto")
                    .and_then(|live_photo| live_photo.get("pairedVideoFilename"))
                    .and_then(Value::as_str)
                    .unwrap_or(LIVE_PHOTO_PAIRED_VIDEO_FILENAME),
                "pairedVideo": {
                    "status": paired_status,
                    "byteCount": paired_video_byte_count,
                    "actualSHA256": paired_video_hash_actual,
                    "expectedSHA256": expected_video_hash
                }
            })
        } else {
            Value::Null
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
            "signingBindingSHA256": signing_binding_sha256,
            "pairedVideoSHA256": paired_video_hash_actual
        },
        "expected": {
            "assetSHA256": proof_asset_hash,
            "metadataSHA256": proof_metadata_hash,
            "bodySHA256": body_sha_expected,
            "pairedVideoSHA256": expected_video_hash,
            "contentDigest": content_digest
        },
        "serverRequest": server_request,
        "checks": checks
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

fn sha256_base64url_excluding(
    bytes: &[u8],
    offset: usize,
    length: usize,
) -> Result<String, String> {
    let end = offset
        .checked_add(length)
        .ok_or("invalid proof slot range")?;
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
    let mut matches = Vec::new();

    matches.extend(extract_tap_manifest_element_values(&text)?);
    matches.extend(extract_tap_manifest_attribute_values(&text)?);

    match matches.len() {
        0 => Err("XMP tapdepth:Manifest tag was not found".to_string()),
        1 => Ok(matches.remove(0)),
        _ => Err("expected exactly one XMP tapdepth:Manifest tag; found multiple".to_string()),
    }
}

fn extract_tap_manifest_element_values(text: &str) -> Result<Vec<String>, String> {
    let open_marker = "<tapdepth:Manifest";
    let close_marker = "</tapdepth:Manifest>";
    let mut values = Vec::new();
    let mut search_start = 0;

    while let Some(relative_open_start) = text[search_start..].find(open_marker) {
        let open_start = search_start + relative_open_start;
        let content_start = text[open_start..]
            .find('>')
            .map(|offset| open_start + offset + 1)
            .ok_or("XMP tapdepth:Manifest opening tag is incomplete")?;
        let close_start = text[content_start..]
            .find(close_marker)
            .map(|offset| content_start + offset)
            .ok_or("XMP tapdepth:Manifest closing tag was not found")?;
        values.push(xml_unescape(text[content_start..close_start].trim()));
        search_start = close_start + close_marker.len();
    }

    Ok(values)
}

fn extract_tap_manifest_attribute_values(text: &str) -> Result<Vec<String>, String> {
    let mut values = Vec::new();
    let mut search_start = 0;

    while let Some(relative_name_start) = text[search_start..].find(MANIFEST_XMP_PATH) {
        let name_start = search_start + relative_name_start;
        let Some(tag_start) = text[..name_start].rfind('<') else {
            search_start = name_start + MANIFEST_XMP_PATH.len();
            continue;
        };
        if text[..name_start]
            .rfind('>')
            .is_some_and(|close| close > tag_start)
        {
            search_start = name_start + MANIFEST_XMP_PATH.len();
            continue;
        }
        let Some(tag_end) = text[name_start..]
            .find('>')
            .map(|offset| name_start + offset)
        else {
            break;
        };
        let tag = &text[tag_start + 1..tag_end];
        values.extend(extract_tap_manifest_attributes_from_tag(tag)?);
        search_start = tag_end + 1;
    }

    Ok(values)
}

fn extract_tap_manifest_attributes_from_tag(tag: &str) -> Result<Vec<String>, String> {
    let bytes = tag.as_bytes();
    let mut values = Vec::new();
    let mut index = 0;

    while index < bytes.len() && !bytes[index].is_ascii_whitespace() {
        index += 1;
    }

    while index < bytes.len() {
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= bytes.len() || bytes[index] == b'/' {
            break;
        }

        let name_start = index;
        while index < bytes.len()
            && !bytes[index].is_ascii_whitespace()
            && bytes[index] != b'='
            && bytes[index] != b'/'
        {
            index += 1;
        }
        let name = &tag[name_start..index];

        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= bytes.len() || bytes[index] != b'=' {
            continue;
        }
        index += 1;

        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= bytes.len() || (bytes[index] != b'"' && bytes[index] != b'\'') {
            if name == MANIFEST_XMP_PATH {
                return Err("XMP tapdepth:Manifest attribute is incomplete".to_string());
            }
            continue;
        }

        let quote = bytes[index];
        index += 1;
        let value_start = index;
        while index < bytes.len() && bytes[index] != quote {
            index += 1;
        }
        if index >= bytes.len() {
            if name == MANIFEST_XMP_PATH {
                return Err("XMP tapdepth:Manifest attribute is incomplete".to_string());
            }
            break;
        }
        if name == MANIFEST_XMP_PATH {
            values.push(xml_unescape(tag[value_start..index].trim()));
        }
        index += 1;
    }

    Ok(values)
}

fn extract_xml_number(bytes: &[u8], tag_name: &str) -> Option<f64> {
    let text = String::from_utf8_lossy(bytes);
    let open_marker = format!("<{tag_name}>");
    let close_marker = format!("</{tag_name}>");
    let start = text.find(&open_marker)? + open_marker.len();
    let end = text[start..].find(&close_marker)? + start;
    text[start..end].trim().parse::<f64>().ok()
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

fn optional_u32(value: &Value, name: &str) -> Option<u32> {
    value.get(name)?.as_u64()?.try_into().ok()
}

fn canonical_json_bytes(value: &Value) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value)
        .map_err(|error| format!("canonical JSON serialization failed: {error}"))
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

fn display_orientation_transform(
    width: u32,
    height: u32,
    display_width: Option<u32>,
    display_height: Option<u32>,
    photo_orientation: Option<&str>,
    is_front_camera: bool,
) -> OrientationTransform {
    if !is_front_camera {
        return legacy_display_orientation_transform(
            width,
            height,
            display_width,
            display_height,
            photo_orientation,
        );
    }

    let Some(display_width) = display_width else {
        return OrientationTransform::None;
    };
    let Some(display_height) = display_height else {
        return OrientationTransform::None;
    };

    let source_axis_matches_display =
        same_display_axis(width, height, display_width, display_height);
    if let Some(photo_transform) =
        photo_orientation.and_then(OrientationTransform::from_photo_orientation_str)
    {
        let (photo_width, photo_height) = photo_transform.output_dimensions(width, height);
        let photo_axis_matches_display =
            same_display_axis(photo_width, photo_height, display_width, display_height);

        if !source_axis_matches_display && photo_axis_matches_display {
            return photo_transform;
        }

        if source_axis_matches_display {
            if photo_transform.is_mirrored() && !photo_transform.swaps_axes() {
                return photo_transform;
            }

            // For mirrored 90-degree orientations, libheif can return the auxiliary
            // plane with the axis swap already applied. Preserve the remaining mirror
            // in display space without swapping the dimensions a second time.
            return photo_transform
                .mirror_component_in_display_space()
                .unwrap_or(OrientationTransform::None);
        }
    }

    if source_axis_matches_display {
        return OrientationTransform::None;
    }

    for transform in [
        OrientationTransform::Clockwise90,
        OrientationTransform::CounterClockwise90,
        OrientationTransform::Rotate180,
    ] {
        let (output_width, output_height) = transform.output_dimensions(width, height);
        if same_display_axis(output_width, output_height, display_width, display_height) {
            return transform;
        }
    }

    OrientationTransform::None
}

fn legacy_display_orientation_transform(
    width: u32,
    height: u32,
    display_width: Option<u32>,
    display_height: Option<u32>,
    photo_orientation: Option<&str>,
) -> OrientationTransform {
    let Some(display_width) = display_width else {
        return OrientationTransform::None;
    };
    let Some(display_height) = display_height else {
        return OrientationTransform::None;
    };

    let photo_transform = photo_orientation
        .and_then(OrientationTransform::from_photo_orientation_str)
        .filter(|transform| !transform.is_mirrored())
        .unwrap_or(OrientationTransform::None);
    let candidates = [
        OrientationTransform::None,
        photo_transform,
        OrientationTransform::Clockwise90,
        OrientationTransform::CounterClockwise90,
        OrientationTransform::Rotate180,
    ];

    for transform in candidates {
        let (output_width, output_height) = transform.output_dimensions(width, height);
        if output_width == display_width && output_height == display_height {
            return transform;
        }
    }

    if same_display_axis(width, height, display_width, display_height) {
        return OrientationTransform::None;
    }

    let (photo_width, photo_height) = photo_transform.output_dimensions(width, height);
    if same_display_axis(photo_width, photo_height, display_width, display_height) {
        return photo_transform;
    }

    for transform in [
        OrientationTransform::Clockwise90,
        OrientationTransform::CounterClockwise90,
        OrientationTransform::Rotate180,
    ] {
        let (output_width, output_height) = transform.output_dimensions(width, height);
        if same_display_axis(output_width, output_height, display_width, display_height) {
            return transform;
        }
    }

    OrientationTransform::None
}

fn is_front_camera_capture(payload: &Value) -> bool {
    payload
        .get("photoLens")
        .and_then(|photo_lens| photo_lens.get("position"))
        .and_then(Value::as_str)
        == Some("front")
}

fn same_display_axis(width: u32, height: u32, display_width: u32, display_height: u32) -> bool {
    width.cmp(&height) == display_width.cmp(&display_height)
}

fn infer_depth_value_unit(
    source_kind: &str,
    pixel_format: &str,
    metric_unit: &str,
    value_range_kind: &str,
) -> &'static str {
    if value_range_kind == "decoded-luma-range" {
        return "luma";
    }

    if source_kind.eq_ignore_ascii_case("disparity")
        || pixel_format.eq_ignore_ascii_case("hdis")
        || metric_unit.to_ascii_lowercase().contains("disparity")
    {
        return "disparity";
    }

    let metric_unit_lower = metric_unit.to_ascii_lowercase();
    if source_kind.to_ascii_lowercase().contains("depth")
        || metric_unit_lower.contains("meter")
        || metric_unit_lower.contains("metre")
    {
        return "m";
    }

    "value"
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OrientationTransform {
    None,
    UpMirrored,
    Rotate180,
    DownMirrored,
    LeftMirrored,
    Clockwise90,
    RightMirrored,
    CounterClockwise90,
}

impl OrientationTransform {
    fn from_photo_orientation_str(orientation: &str) -> Option<Self> {
        match orientation {
            value if value.ends_with(":1") || value == "1" => Some(Self::None),
            value if value.ends_with(":2") || value == "2" => Some(Self::UpMirrored),
            value if value.ends_with(":3") || value == "3" => Some(Self::Rotate180),
            value if value.ends_with(":4") || value == "4" => Some(Self::DownMirrored),
            value if value.ends_with(":5") || value == "5" => Some(Self::LeftMirrored),
            value if value.ends_with(":6") || value == "6" => Some(Self::Clockwise90),
            value if value.ends_with(":7") || value == "7" => Some(Self::RightMirrored),
            value if value.ends_with(":8") || value == "8" => Some(Self::CounterClockwise90),
            _ => None,
        }
    }

    fn mirror_component_in_display_space(self) -> Option<Self> {
        match self {
            Self::UpMirrored | Self::DownMirrored => Some(Self::UpMirrored),
            Self::LeftMirrored | Self::RightMirrored => Some(Self::DownMirrored),
            _ => None,
        }
    }

    fn is_mirrored(self) -> bool {
        matches!(
            self,
            Self::UpMirrored | Self::DownMirrored | Self::LeftMirrored | Self::RightMirrored
        )
    }

    fn swaps_axes(self) -> bool {
        matches!(
            self,
            Self::LeftMirrored | Self::Clockwise90 | Self::RightMirrored | Self::CounterClockwise90
        )
    }

    fn output_dimensions(self, width: u32, height: u32) -> (u32, u32) {
        if self.swaps_axes() {
            (height, width)
        } else {
            (width, height)
        }
    }

    fn as_report_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::UpMirrored => "upMirrored",
            Self::Rotate180 => "rotate180",
            Self::DownMirrored => "downMirrored",
            Self::LeftMirrored => "leftMirrored",
            Self::Clockwise90 => "clockwise90",
            Self::RightMirrored => "rightMirrored",
            Self::CounterClockwise90 => "counterClockwise90",
        }
    }
}

#[derive(Default)]
struct PhotoMetadata {
    orientation: Option<String>,
}

fn read_photo_metadata(file_bytes: &[u8]) -> Result<PhotoMetadata, String> {
    let manifest_json = extract_tap_manifest_json(file_bytes)?;
    let manifest: Value = serde_json::from_str(&manifest_json)
        .map_err(|error| format!("tapdepth:Manifest is not valid JSON: {error}"))?;
    let photo = manifest
        .get("payload")
        .and_then(|payload| payload.get("photo"));

    Ok(PhotoMetadata {
        orientation: photo
            .and_then(|value| value.get("orientation"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
    })
}

#[allow(clippy::too_many_arguments)]
fn resample_original_rgba(
    source: &[u8],
    source_width: u32,
    source_height: u32,
    transform: OrientationTransform,
    oriented_width: u32,
    oriented_height: u32,
    output_width: u32,
    output_height: u32,
    output: &mut [u8],
) {
    let x_scale = oriented_width as f64 / output_width as f64;
    let y_scale = oriented_height as f64 / output_height as f64;

    for y in 0..output_height as usize {
        for x in 0..output_width as usize {
            let oriented_x =
                ((x as f64 + 0.5) * x_scale - 0.5).clamp(0.0, (oriented_width - 1) as f64);
            let oriented_y =
                ((y as f64 + 0.5) * y_scale - 0.5).clamp(0.0, (oriented_height - 1) as f64);
            let (source_x, source_y) = inverse_orientation_transform(
                oriented_x,
                oriented_y,
                source_width,
                source_height,
                transform,
            );
            let offset = (y * output_width as usize + x) * 4;
            sample_bilinear_rgba(
                source,
                source_width,
                source_height,
                source_x,
                source_y,
                output,
                offset,
            );
        }
    }
}

fn inverse_orientation_transform(
    x: f64,
    y: f64,
    source_width: u32,
    source_height: u32,
    transform: OrientationTransform,
) -> (f64, f64) {
    match transform {
        OrientationTransform::None => (x, y),
        OrientationTransform::UpMirrored => ((source_width - 1) as f64 - x, y),
        OrientationTransform::Rotate180 => (
            (source_width - 1) as f64 - x,
            (source_height - 1) as f64 - y,
        ),
        OrientationTransform::DownMirrored => (x, (source_height - 1) as f64 - y),
        OrientationTransform::LeftMirrored => (y, x),
        OrientationTransform::Clockwise90 => (y, (source_height - 1) as f64 - x),
        OrientationTransform::RightMirrored => (
            (source_width - 1) as f64 - y,
            (source_height - 1) as f64 - x,
        ),
        OrientationTransform::CounterClockwise90 => ((source_width - 1) as f64 - y, x),
    }
}

#[allow(clippy::too_many_arguments)]
fn sample_bilinear_rgba(
    source: &[u8],
    width: u32,
    height: u32,
    x: f64,
    y: f64,
    output: &mut [u8],
    output_offset: usize,
) {
    let x0 = x.floor().clamp(0.0, (width - 1) as f64) as usize;
    let y0 = y.floor().clamp(0.0, (height - 1) as f64) as usize;
    let x1 = (x0 + 1).min(width as usize - 1);
    let y1 = (y0 + 1).min(height as usize - 1);
    let wx = x - x0 as f64;
    let wy = y - y0 as f64;

    let top_left = (y0 * width as usize + x0) * 4;
    let top_right = (y0 * width as usize + x1) * 4;
    let bottom_left = (y1 * width as usize + x0) * 4;
    let bottom_right = (y1 * width as usize + x1) * 4;

    for channel in 0..4 {
        let top = source[top_left + channel] as f64 * (1.0 - wx)
            + source[top_right + channel] as f64 * wx;
        let bottom = source[bottom_left + channel] as f64 * (1.0 - wx)
            + source[bottom_right + channel] as f64 * wx;
        output[output_offset + channel] = (top * (1.0 - wy) + bottom * wy).round() as u8;
    }
}

fn scaled_coordinate(pixel: u32, source_extent: u32, target_extent: u32) -> usize {
    if target_extent <= 1 || source_extent <= 1 {
        return 0;
    }
    ((pixel as f64 / (source_extent - 1) as f64) * (target_extent - 1) as f64)
        .round()
        .clamp(0.0, (target_extent - 1) as f64) as usize
}

fn depth_display_value(normalized: f64, min_value: f64, max_value: f64) -> f64 {
    if max_value <= min_value {
        return min_value;
    }
    min_value + normalized.clamp(0.0, 1.0) * (max_value - min_value)
}

fn relative_depth_from_value(value: f64, min_value: f64, max_value: f64, value_unit: &str) -> f64 {
    if max_value <= min_value {
        return 1.0;
    }

    let normalized = if value_unit == "disparity" {
        let safe_min = min_value.max(0.000_001);
        let safe_max = max_value.max(0.000_001);
        let near_depth = 1.0 / safe_max;
        let far_depth = 1.0 / safe_min;
        let current_depth = 1.0 / value.max(0.000_001);
        if far_depth <= near_depth {
            0.5
        } else {
            ((current_depth - near_depth) / (far_depth - near_depth)).clamp(0.0, 1.0)
        }
    } else {
        ((value - min_value) / (max_value - min_value)).clamp(0.0, 1.0)
    };

    0.25 + normalized * 1.75
}

#[derive(Clone, Copy)]
struct PinholeCamera {
    model: &'static str,
    image_width: u32,
    image_height: u32,
    fx: f64,
    fy: f64,
    cx: f64,
    cy: f64,
}

impl PinholeCamera {
    fn display_oriented(self, transform: OrientationTransform) -> Self {
        let max_x = self.image_width.saturating_sub(1) as f64;
        let max_y = self.image_height.saturating_sub(1) as f64;

        match transform {
            OrientationTransform::None => self,
            OrientationTransform::UpMirrored => Self {
                cx: max_x - self.cx,
                ..self
            },
            OrientationTransform::Rotate180 => Self {
                cx: max_x - self.cx,
                cy: max_y - self.cy,
                ..self
            },
            OrientationTransform::DownMirrored => Self {
                cy: max_y - self.cy,
                ..self
            },
            OrientationTransform::LeftMirrored => Self {
                fx: self.fy,
                fy: self.fx,
                cx: self.cy,
                cy: self.cx,
                image_width: self.image_height,
                image_height: self.image_width,
                ..self
            },
            OrientationTransform::Clockwise90 => Self {
                fx: self.fy,
                fy: self.fx,
                cx: max_y - self.cy,
                cy: self.cx,
                image_width: self.image_height,
                image_height: self.image_width,
                ..self
            },
            OrientationTransform::RightMirrored => Self {
                fx: self.fy,
                fy: self.fx,
                cx: max_y - self.cy,
                cy: max_x - self.cx,
                image_width: self.image_height,
                image_height: self.image_width,
                ..self
            },
            OrientationTransform::CounterClockwise90 => Self {
                fx: self.fy,
                fy: self.fx,
                cx: self.cy,
                cy: max_x - self.cx,
                image_width: self.image_height,
                image_height: self.image_width,
                ..self
            },
        }
    }
}

fn virtual_pinhole_camera(width: u32, height: u32) -> PinholeCamera {
    let focal = 0.9 * width.max(height) as f64;
    PinholeCamera {
        model: "virtual-pinhole",
        image_width: width,
        image_height: height,
        fx: focal,
        fy: focal,
        cx: width as f64 / 2.0,
        cy: height as f64 / 2.0,
    }
}

fn pinhole_camera_from_manifest(depth: &Value, width: u32, height: u32) -> Option<PinholeCamera> {
    let calibration = depth.get("cameraCalibration")?;
    let pixel_size = calibration.get("pixelSizeMillimeters")?.as_f64()?;
    let lens_center_x = calibration.get("lensDistortionCenterX")?.as_f64()?;
    let lens_center_y = calibration.get("lensDistortionCenterY")?.as_f64()?;
    if !pixel_size.is_finite() || !lens_center_x.is_finite() || !lens_center_y.is_finite() {
        return None;
    }

    let extrinsic = calibration.get("extrinsicMatrix")?.as_array()?;
    if extrinsic.len() != 12
        || !extrinsic
            .iter()
            .all(|value| value.as_f64().is_some_and(f64::is_finite))
    {
        return None;
    }

    let reference_width = calibration.get("intrinsicMatrixReferenceWidth")?.as_f64()?;
    let reference_height = calibration
        .get("intrinsicMatrixReferenceHeight")?
        .as_f64()?;
    if !reference_width.is_finite()
        || !reference_height.is_finite()
        || reference_width <= 0.0
        || reference_height <= 0.0
    {
        return None;
    }

    let intrinsic = calibration.get("intrinsicMatrix")?.as_array()?;
    if intrinsic.len() != 9 {
        return None;
    }
    let matrix: Vec<f64> = intrinsic
        .iter()
        .map(Value::as_f64)
        .collect::<Option<Vec<_>>>()?;
    if !matrix.iter().all(|value| value.is_finite()) {
        return None;
    }

    let fx = matrix[0] * width as f64 / reference_width;
    let fy = matrix[4] * height as f64 / reference_height;
    let cx = matrix[6] * width as f64 / reference_width;
    let cy = matrix[7] * height as f64 / reference_height;
    if !fx.is_finite()
        || !fy.is_finite()
        || !cx.is_finite()
        || !cy.is_finite()
        || fx.abs() <= 0.000_001
        || fy.abs() <= 0.000_001
    {
        return None;
    }

    Some(PinholeCamera {
        model: "metadata-pinhole",
        image_width: width,
        image_height: height,
        fx,
        fy,
        cx,
        cy,
    })
}

fn back_project_pixel_to_view_space(
    pixel_x: f64,
    pixel_y: f64,
    relative_depth: f64,
    camera: PinholeCamera,
) -> (f64, f64, f64) {
    let depth = relative_depth.max(0.000_001);
    let x = (pixel_x - camera.cx) / camera.fx * depth;
    let y = -(pixel_y - camera.cy) / camera.fy * depth;
    (x, y, -depth)
}

#[cfg(test)]
fn reproject_view_space_to_pixel(
    x: f64,
    y: f64,
    z: f64,
    camera: PinholeCamera,
) -> Option<(f64, f64)> {
    let depth = -z;
    if depth <= 0.0 {
        return None;
    }
    Some((
        camera.fx * x / depth + camera.cx,
        camera.cy - camera.fy * y / depth,
    ))
}

fn aspect_ratio_delta(width: u32, height: u32, other_width: u32, other_height: u32) -> f64 {
    if height == 0 || other_height == 0 {
        return 1.0;
    }
    let ratio = width as f64 / height as f64;
    let other_ratio = other_width as f64 / other_height as f64;
    ((ratio - other_ratio) / ratio.max(other_ratio)).abs()
}

fn push_f32_le(output: &mut Vec<u8>, value: f32) {
    output.extend_from_slice(&value.to_le_bytes());
}

fn push_u16_le(output: &mut Vec<u8>, value: u16) {
    output.extend_from_slice(&value.to_le_bytes());
}

fn normalize_u8(value: u8, min: u8, max: u8) -> f32 {
    if max <= min {
        return 0.0;
    }
    (value.saturating_sub(min)) as f32 / (max - min) as f32
}

fn depth_color(value: f32) -> (u8, u8, u8) {
    let value = value.clamp(0.0, 1.0);
    let red = (255.0 * smoothstep(0.35, 0.95, value)) as u8;
    let green = (255.0 * (1.0 - (value - 0.5).abs() * 1.7).clamp(0.0, 1.0)) as u8;
    let blue = (255.0 * (1.0 - smoothstep(0.05, 0.65, value))) as u8;
    (red, green, blue)
}

fn smoothstep(edge0: f32, edge1: f32, value: f32) -> f32 {
    if edge1 <= edge0 {
        return if value >= edge1 { 1.0 } else { 0.0 };
    }
    let t = ((value - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
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

fn optional_json_equality_check(
    id: &str,
    label: &str,
    actual: &Value,
    expected: Option<&Value>,
) -> Value {
    match expected {
        Some(expected) => json_equality_check(id, label, actual, expected),
        None => json!({
            "id": id,
            "label": label,
            "status": "fail",
            "detail": "Expected signed resource descriptor is missing.",
            "actual": actual,
            "expected": Value::Null
        }),
    }
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

fn schema_check(schema: &Value, is_live_photo: bool) -> Value {
    let expected = json!({
        "id": if is_live_photo { LIVE_PHOTO_MANIFEST_SCHEMA_ID } else { MANIFEST_SCHEMA_ID },
        "mediaType": if is_live_photo { LIVE_PHOTO_MANIFEST_MEDIA_TYPE } else { MANIFEST_MEDIA_TYPE },
        "version": if is_live_photo { 2 } else { 1 },
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

fn live_photo_payload_check(live_photo: Option<&Value>) -> Value {
    let Some(live_photo) = live_photo else {
        return json!({
            "id": "live-photo-payload",
            "label": "Require Live Photo manifest payload",
            "status": "fail",
            "detail": "manifest.payload.livePhoto is missing."
        });
    };

    let mut violations = Vec::new();
    if live_photo.get("presence").and_then(Value::as_str) != Some("paired-video") {
        violations.push("presence must be paired-video");
    }
    if live_photo
        .get("pairedVideoFilename")
        .and_then(Value::as_str)
        != Some(LIVE_PHOTO_PAIRED_VIDEO_FILENAME)
    {
        violations.push("pairedVideoFilename must be paired-video.mov");
    }

    json!({
        "id": "live-photo-payload",
        "label": "Require Live Photo manifest payload",
        "status": if violations.is_empty() { "pass" } else { "fail" },
        "detail": if violations.is_empty() {
            "manifest.payload.livePhoto declares the paired MOV resource.".to_string()
        } else {
            violations.join("; ")
        },
        "actual": live_photo
    })
}

fn live_photo_paired_video_descriptor_check(resource: Option<&Value>) -> Value {
    let Some(resource) = resource else {
        return json!({
            "id": "live-photo-paired-video-descriptor",
            "label": "Require Live Photo paired MOV signed resource descriptor",
            "status": "fail",
            "detail": "The v3 content digest does not declare a pairedLivePhotoVideo signed resource."
        });
    };

    let mut violations = Vec::new();
    if resource.get("role").and_then(Value::as_str) != Some("pairedLivePhotoVideo") {
        violations.push("role must be pairedLivePhotoVideo");
    }
    if resource.get("kind").and_then(Value::as_str) != Some("format-native-full-file") {
        violations.push("kind must be format-native-full-file");
    }
    if resource.get("mediaType").and_then(Value::as_str) != Some(QUICKTIME_MOVIE_MEDIA_TYPE) {
        violations.push("mediaType must be com.apple.quicktime-movie");
    }
    if resource.get("algorithm").and_then(Value::as_str) != Some("SHA-256") {
        violations.push("algorithm must be SHA-256");
    }
    if resource.get("binding").and_then(Value::as_str) != Some("full-file") {
        violations.push("binding must be full-file");
    }
    if resource.get("byteCount").and_then(Value::as_u64).is_none() {
        violations.push("byteCount must be present");
    }
    if resource
        .get("value")
        .and_then(Value::as_str)
        .map_or(true, str::is_empty)
    {
        violations.push("value must be present");
    }

    json!({
        "id": "live-photo-paired-video-descriptor",
        "label": "Require Live Photo paired MOV signed resource descriptor",
        "status": if violations.is_empty() { "pass" } else { "fail" },
        "detail": if violations.is_empty() {
            "The v3 content digest declares the paired MOV signed resource.".to_string()
        } else {
            violations.join("; ")
        },
        "actual": resource
    })
}

fn live_photo_paired_video_scope_warning(
    status: &str,
    actual: Option<&Value>,
    expected: Option<&Value>,
) -> Value {
    json!({
        "id": "live-photo-paired-video-resource",
        "label": "Verify Live Photo paired MOV resource scope",
        "status": "warning",
        "detail": match status {
            "missing" => "No paired-video.mov bytes were supplied; full Live Photo video verification was skipped, but the primary photo scope can still be verified.".to_string(),
            "mismatch" => "The supplied paired-video.mov does not match the signed resource descriptor; full Live Photo verification failed, but the primary photo scope can still be verified.".to_string(),
            _ => "The paired MOV resource was not verified in the full Live Photo scope.".to_string(),
        },
        "actual": actual.unwrap_or(&Value::Null),
        "expected": expected.unwrap_or(&Value::Null)
    })
}

fn live_photo_scope_warnings(is_live_photo: bool, paired_status: &str) -> Vec<Value> {
    if !is_live_photo {
        return Vec::new();
    }

    match paired_status {
        "missing" => vec![json!({
            "id": "paired-video-not-supplied",
            "severity": "warning",
            "message": "paired-video.mov was not supplied. The verifier checked the signed Live Photo primary photo and manifest, but did not verify motion/video bytes."
        })],
        "mismatch" => vec![json!({
            "id": "paired-video-mismatch",
            "severity": "warning",
            "message": "The supplied paired-video.mov does not match the signed Live Photo resource. The verifier can only trust the primary photo scope."
        })],
        _ => Vec::new(),
    }
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
    if capture
        .get("depthDataDeliveryEnabled")
        .and_then(Value::as_bool)
        != Some(true)
    {
        violations.push("depthDataDeliveryEnabled must be true".to_string());
    }
    if capture
        .get("embedsDepthDataInPhoto")
        .and_then(Value::as_bool)
        != Some(true)
    {
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
    fn parses_imageio_rdf_manifest_attribute() {
        let bytes = br#"<x:xmpmeta><rdf:RDF><rdf:Description xmlns:tapdepth="urn:tapnap:tapcam:depth:1.0" tapdepth:Manifest="{&quot;payload&quot;:{&quot;id&quot;:&quot;jpeg&quot;},&quot;proofs&quot;:[],&quot;schema&quot;:{&quot;xmpManifestPath&quot;:&quot;tapdepth:Manifest&quot;}}"></rdf:Description></rdf:RDF></x:xmpmeta>"#;
        assert_eq!(
            extract_tap_manifest_json(bytes).unwrap(),
            r#"{"payload":{"id":"jpeg"},"proofs":[],"schema":{"xmpManifestPath":"tapdepth:Manifest"}}"#
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
    fn depth_visualization_uses_apdi_range() {
        let bytes = depth_manifest_fixture(2, 2, "cgImagePropertyOrientation:1", "")
            .replace(
                "<x:xmpmeta>",
                "<x:xmpmeta><apdi:FloatMinValue>3.5</apdi:FloatMinValue><apdi:FloatMaxValue>12.25</apdi:FloatMaxValue>",
            );
        let report = visualize_depth_u8(bytes.as_bytes(), &[4, 8, 12, 16], 2, 2);
        assert_eq!(report["status"], "available");
        assert_eq!(report["minValue"], 3.5);
        assert_eq!(report["maxValue"], 12.25);
        assert_eq!(report["valueRangeKind"], "apdi-float-range");
        assert_eq!(report["valueUnit"], "disparity");
        assert_eq!(report["rawMin"], 4);
        assert_eq!(report["rawMax"], 16);
    }

    #[test]
    fn depth_visualization_rotates_to_manifest_dimensions() {
        let bytes = depth_manifest_fixture(3, 2, "cgImagePropertyOrientation:6", "");
        let report = visualize_depth_u8(bytes.as_bytes(), &[0, 10, 20, 30, 40, 50], 2, 3);
        assert_eq!(report["status"], "available");
        assert_eq!(report["width"], 3);
        assert_eq!(report["height"], 2);
        assert_eq!(report["rotation"], "clockwise90");
        assert_eq!(report["valueUnit"], "luma");

        let preview = STANDARD
            .decode(report["previewRgbaBase64"].as_str().unwrap())
            .unwrap();
        let expected_first_pixel = depth_color(normalize_u8(40, 0, 50));
        assert_eq!(
            &preview[0..4],
            &[
                expected_first_pixel.0,
                expected_first_pixel.1,
                expected_first_pixel.2,
                255
            ]
        );
    }

    #[test]
    fn depth_visualization_uses_manifest_display_direction() {
        let bytes = depth_manifest_fixture(3, 2, "cgImagePropertyOrientation:1", "");
        let report = visualize_depth_u8(bytes.as_bytes(), &[0, 10, 20, 30, 40, 50], 2, 3);

        assert_eq!(report["status"], "available");
        assert_eq!(report["width"], 3);
        assert_eq!(report["height"], 2);
        assert_eq!(report["rotation"], "clockwise90");
    }

    #[test]
    fn depth_visualization_supports_counter_clockwise_display_orientation() {
        let bytes = depth_manifest_fixture(3, 2, "cgImagePropertyOrientation:8", "");
        let report = visualize_depth_u8(bytes.as_bytes(), &[0, 10, 20, 30, 40, 50], 2, 3);

        assert_eq!(report["status"], "available");
        assert_eq!(report["width"], 3);
        assert_eq!(report["height"], 2);
        assert_eq!(report["rotation"], "counterClockwise90");

        let preview = STANDARD
            .decode(report["previewRgbaBase64"].as_str().unwrap())
            .unwrap();
        let expected_first_pixel = depth_color(normalize_u8(10, 0, 50));
        assert_eq!(
            &preview[0..4],
            &[
                expected_first_pixel.0,
                expected_first_pixel.1,
                expected_first_pixel.2,
                255
            ]
        );
    }

    #[test]
    fn orientation_transform_parses_all_exif_directions() {
        let cases = [
            ("cgImagePropertyOrientation:1", OrientationTransform::None),
            (
                "cgImagePropertyOrientation:2",
                OrientationTransform::UpMirrored,
            ),
            (
                "cgImagePropertyOrientation:3",
                OrientationTransform::Rotate180,
            ),
            (
                "cgImagePropertyOrientation:4",
                OrientationTransform::DownMirrored,
            ),
            (
                "cgImagePropertyOrientation:5",
                OrientationTransform::LeftMirrored,
            ),
            (
                "cgImagePropertyOrientation:6",
                OrientationTransform::Clockwise90,
            ),
            (
                "cgImagePropertyOrientation:7",
                OrientationTransform::RightMirrored,
            ),
            (
                "cgImagePropertyOrientation:8",
                OrientationTransform::CounterClockwise90,
            ),
        ];

        for (raw_value, expected) in cases {
            assert_eq!(
                OrientationTransform::from_photo_orientation_str(raw_value),
                Some(expected)
            );
        }
        assert_eq!(
            OrientationTransform::from_photo_orientation_str("unspecified"),
            None
        );
    }

    #[test]
    fn display_oriented_depth_grid_matches_all_exif_corner_mappings() {
        let source = [1, 2, 3, 4, 5, 6];
        let cases: &[(OrientationTransform, u32, u32, &[u8])] = &[
            (OrientationTransform::None, 3, 2, &[1, 2, 3, 4, 5, 6]),
            (OrientationTransform::UpMirrored, 3, 2, &[3, 2, 1, 6, 5, 4]),
            (OrientationTransform::Rotate180, 3, 2, &[6, 5, 4, 3, 2, 1]),
            (
                OrientationTransform::DownMirrored,
                3,
                2,
                &[4, 5, 6, 1, 2, 3],
            ),
            (
                OrientationTransform::LeftMirrored,
                2,
                3,
                &[1, 4, 2, 5, 3, 6],
            ),
            (OrientationTransform::Clockwise90, 2, 3, &[4, 1, 5, 2, 6, 3]),
            (
                OrientationTransform::RightMirrored,
                2,
                3,
                &[6, 3, 5, 2, 4, 1],
            ),
            (
                OrientationTransform::CounterClockwise90,
                2,
                3,
                &[3, 6, 2, 5, 1, 4],
            ),
        ];

        for &(transform, output_width, output_height, expected) in cases {
            assert_eq!(
                display_oriented_depth_grid(&source, 3, 2, output_width, output_height, transform,),
                expected,
                "unexpected mapping for {}",
                transform.as_report_str()
            );
        }
    }

    #[test]
    fn display_orientation_prefers_front_camera_mirrored_rotation() {
        assert_eq!(
            display_orientation_transform(
                3,
                2,
                Some(2),
                Some(3),
                Some("cgImagePropertyOrientation:5"),
                true,
            ),
            OrientationTransform::LeftMirrored
        );
        assert_eq!(
            display_orientation_transform(
                3,
                2,
                Some(2),
                Some(3),
                Some("cgImagePropertyOrientation:7"),
                true,
            ),
            OrientationTransform::RightMirrored
        );
    }

    #[test]
    fn display_orientation_keeps_mirror_when_depth_rotation_is_already_applied() {
        for orientation in [
            "cgImagePropertyOrientation:5",
            "cgImagePropertyOrientation:7",
        ] {
            assert_eq!(
                display_orientation_transform(2, 3, Some(2), Some(3), Some(orientation), true),
                OrientationTransform::DownMirrored
            );
        }
    }

    #[test]
    fn front_camera_landscape_down_mirrored_uses_full_vertical_flip() {
        assert_eq!(
            display_orientation_transform(
                640,
                480,
                Some(4032),
                Some(3024),
                Some("cgImagePropertyOrientation:4"),
                true,
            ),
            OrientationTransform::DownMirrored
        );
    }

    #[test]
    fn non_front_capture_keeps_legacy_mirrored_orientation_behavior() {
        assert_eq!(
            display_orientation_transform(
                640,
                480,
                Some(4032),
                Some(3024),
                Some("cgImagePropertyOrientation:4"),
                false,
            ),
            OrientationTransform::None
        );
    }

    #[test]
    fn front_camera_detection_requires_signed_photo_lens_position() {
        assert!(is_front_camera_capture(&json!({
            "photoLens": { "position": "front" }
        })));
        assert!(!is_front_camera_capture(&json!({
            "photoLens": { "position": "back" },
            "depth": { "source": { "captureDeviceName": "Front TrueDepth Camera" } }
        })));
        assert!(!is_front_camera_capture(&json!({
            "depth": { "source": { "captureDeviceName": "Front TrueDepth Camera" } }
        })));
    }

    #[test]
    fn original_preview_preserves_decoded_portrait_display_direction() {
        let bytes = depth_manifest_fixture(2, 3, "cgImagePropertyOrientation:6", "").replace(
            r#""photo":{"orientation":"cgImagePropertyOrientation:6"}"#,
            r#""photo":{"height":2,"orientation":"cgImagePropertyOrientation:6","width":3}"#,
        );
        let rgba = [
            10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255, 50, 0, 0, 255, 60, 0, 0,
            255,
        ];
        let report = prepare_original_rgba(bytes.as_bytes(), &rgba, 2, 3, 100);

        assert_eq!(report["status"], "available");
        assert_eq!(report["width"], 2);
        assert_eq!(report["height"], 3);
        assert_eq!(report["rotation"], "none");

        let preview = STANDARD
            .decode(report["previewRgbaBase64"].as_str().unwrap())
            .unwrap();
        assert_eq!(&preview[0..4], &[10, 0, 0, 255]);
    }

    #[test]
    fn original_preview_downscales_for_browser_display() {
        let rgba = vec![128u8; 4 * 2 * 4];
        let report = prepare_original_rgba(b"not a manifest", &rgba, 4, 2, 2);

        assert_eq!(report["status"], "available");
        assert_eq!(report["width"], 2);
        assert_eq!(report["height"], 1);
        assert_eq!(report["rotation"], "none");
        assert!(report["warnings"][0]
            .as_str()
            .unwrap()
            .contains("downscaled"));
    }

    #[test]
    fn pixel_projection_builds_stable_cloud_from_depth_and_rgb() {
        let bytes = depth_manifest_fixture(4, 2, "cgImagePropertyOrientation:1", "")
            .replace(
                "<x:xmpmeta>",
                "<x:xmpmeta><apdi:FloatMinValue>3.5</apdi:FloatMinValue><apdi:FloatMaxValue>12.25</apdi:FloatMaxValue>",
            );
        let rgba = [
            10, 20, 30, 255, 20, 30, 40, 255, 30, 40, 50, 255, 40, 50, 60, 255, 50, 60, 70, 255,
            60, 70, 80, 255, 70, 80, 90, 255, 80, 90, 100, 255,
        ];
        let depth = [4, 8, 12, 16, 20, 24, 28, 32];

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 4, 2, &depth, 4, 2, 4, 2);

        assert_eq!(report["status"], "available");
        assert_eq!(report["geometryKind"], "signed-depth-pixel-point-cloud");
        assert_eq!(report["pointCount"], 8);
        assert_eq!(report["sampleStep"], 1);
        assert_eq!(report["valueUnit"], "disparity");
        assert_eq!(report["relativeGeometry"], true);
        assert_eq!(report["viewMode"], "capture-camera");
        assert_eq!(report["cameraModel"], "virtual-pinhole");
        assert_eq!(report["imageWidth"], 4);
        assert_eq!(report["imageHeight"], 2);
        let positions = STANDARD
            .decode(report["positionsBase64"].as_str().unwrap())
            .unwrap();
        let colors = STANDARD
            .decode(report["colorsBase64"].as_str().unwrap())
            .unwrap();
        assert_eq!(positions.len(), 8 * 3 * 4);
        assert_eq!(colors.len(), 8 * 3);
        assert_eq!(&colors[0..3], &[10, 20, 30]);
    }

    #[test]
    fn pixel_projection_reports_poor_quality_for_constant_depth() {
        let bytes = depth_manifest_fixture(3, 3, "cgImagePropertyOrientation:1", "");
        let rgba = vec![128u8; 3 * 3 * 4];
        let depth = vec![64u8; 3 * 3];

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 3, 3, &depth, 3, 3, 3, 3);

        assert_eq!(report["status"], "available");
        assert_eq!(report["quality"]["globalRisk"], "poor");
        assert!(quality_has_warning(&report, "depth-range-empty"));
        assert!(risk_flags(&report)
            .iter()
            .all(|flag| flag & RISK_NARROW_RANGE != 0));
    }

    #[test]
    fn pixel_projection_flags_clipped_low_and_high_depth() {
        let bytes = depth_manifest_fixture(4, 1, "cgImagePropertyOrientation:1", "");
        let rgba = vec![128u8; 4 * 4];
        let depth = [0, 0, 255, 255];

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 4, 1, &depth, 4, 1, 4, 1);
        let flags = risk_flags(&report);

        assert_eq!(report["quality"]["metrics"]["clippedLowRatio"], 0.5);
        assert_eq!(report["quality"]["metrics"]["clippedHighRatio"], 0.5);
        assert!(flags[0] & RISK_CLIPPED_LOW != 0);
        assert!(flags[3] & RISK_CLIPPED_HIGH != 0);
        assert!(quality_has_warning(&report, "clipped-low-depth"));
        assert!(quality_has_warning(&report, "clipped-high-depth"));
    }

    #[test]
    fn pixel_projection_flags_isolated_outlier() {
        let bytes = depth_manifest_fixture(5, 5, "cgImagePropertyOrientation:1", "");
        let rgba = vec![128u8; 5 * 5 * 4];
        let mut depth = vec![20u8; 5 * 5];
        depth[12] = 220;

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 5, 5, &depth, 5, 5, 5, 5);
        let flags = risk_flags(&report);

        assert!(flags[12] & RISK_ISOLATED_OUTLIER != 0);
        assert!(quality_has_warning(&report, "isolated-depth-outliers"));
    }

    #[test]
    fn pixel_projection_flags_depth_discontinuity_edges() {
        let bytes = depth_manifest_fixture(4, 4, "cgImagePropertyOrientation:1", "");
        let rgba = vec![128u8; 4 * 4 * 4];
        let mut depth = Vec::new();
        for _ in 0..4 {
            depth.extend([20, 20, 220, 220]);
        }

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 4, 4, &depth, 4, 4, 4, 4);
        let flags = risk_flags(&report);

        assert!(flags.iter().any(|flag| flag & RISK_DISCONTINUITY_EDGE != 0));
        assert!(quality_has_warning(&report, "depth-discontinuity-edges"));
    }

    #[test]
    fn pixel_projection_reports_alignment_and_distortion_risk() {
        let calibration = r#""cameraCalibration":{
            "intrinsicMatrixReferenceWidth": 8,
            "intrinsicMatrixReferenceHeight": 2,
            "pixelSizeMillimeters": 0.001,
            "lensDistortionLookupTablePresent": true,
            "inverseLensDistortionLookupTablePresent": true,
            "lensDistortionCenterX": 4,
            "lensDistortionCenterY": 1,
            "intrinsicMatrix": [80,0,0,0,40,0,4,1,1],
            "extrinsicMatrix": [1,0,0,0,1,0,0,0,1,0,0,0]
        }"#;
        let bytes = depth_manifest_fixture(8, 2, "cgImagePropertyOrientation:1", "")
            .replace(r#""width":8}"#, &format!(r#""width":8,{calibration}}}"#));
        let rgba = vec![128u8; 4 * 4 * 4];
        let depth = vec![20u8; 8 * 2];

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 4, 4, &depth, 8, 2, 8, 2);
        let flags = risk_flags(&report);

        assert_eq!(report["quality"]["metrics"]["alignmentRisk"], "warning");
        assert!(quality_has_warning(&report, "rgb-depth-aspect-mismatch"));
        assert!(quality_has_warning(&report, "distortion-uncorrected-edge"));
        assert!(flags.iter().all(|flag| flag & RISK_ALIGNMENT_EDGE != 0));
        assert!(flags
            .iter()
            .any(|flag| flag & RISK_DISTORTION_UNCORRECTED_EDGE != 0));
    }

    #[test]
    fn pixel_projection_uses_manifest_camera_calibration_intrinsics() {
        let calibration = r#""cameraCalibration":{
            "intrinsicMatrixReferenceWidth": 8,
            "intrinsicMatrixReferenceHeight": 4,
            "pixelSizeMillimeters": 0.001,
            "lensDistortionLookupTablePresent": true,
            "inverseLensDistortionLookupTablePresent": true,
            "lensDistortionCenterX": 2,
            "lensDistortionCenterY": 1,
            "intrinsicMatrix": [80,0,0,0,40,0,4,2,1],
            "extrinsicMatrix": [1,0,0,0,1,0,0,0,1,0,0,0]
        }"#;
        let bytes = depth_manifest_fixture(4, 2, "cgImagePropertyOrientation:1", "")
            .replace(r#""width":4}"#, &format!(r#""width":4,{calibration}}}"#));
        let rgba = vec![128u8; 4 * 2 * 4];
        let depth = [4, 8, 12, 16, 20, 24, 28, 32];

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 4, 2, &depth, 4, 2, 4, 2);

        assert_eq!(report["status"], "available");
        assert_eq!(report["cameraModel"], "metadata-pinhole");
        assert_eq!(report["fx"], 40.0);
        assert_eq!(report["fy"], 20.0);
        assert_eq!(report["cx"], 2.0);
        assert_eq!(report["cy"], 1.0);
    }

    #[test]
    fn pinhole_camera_follows_mirrored_rotated_display_orientation() {
        let camera = PinholeCamera {
            model: "metadata-pinhole",
            image_width: 4,
            image_height: 3,
            fx: 40.0,
            fy: 30.0,
            cx: 0.5,
            cy: 1.25,
        };

        let left_mirrored = camera.display_oriented(OrientationTransform::LeftMirrored);
        assert_eq!(left_mirrored.image_width, 3);
        assert_eq!(left_mirrored.image_height, 4);
        assert_eq!(left_mirrored.fx, 30.0);
        assert_eq!(left_mirrored.fy, 40.0);
        assert_eq!(left_mirrored.cx, 1.25);
        assert_eq!(left_mirrored.cy, 0.5);

        let right_mirrored = camera.display_oriented(OrientationTransform::RightMirrored);
        assert_eq!(right_mirrored.image_width, 3);
        assert_eq!(right_mirrored.image_height, 4);
        assert_eq!(right_mirrored.fx, 30.0);
        assert_eq!(right_mirrored.fy, 40.0);
        assert_eq!(right_mirrored.cx, 0.75);
        assert_eq!(right_mirrored.cy, 2.5);
    }

    #[test]
    fn pixel_projection_reprojects_with_pinhole_intrinsics_to_source_pixel() {
        let camera = PinholeCamera {
            model: "metadata-pinhole",
            image_width: 4,
            image_height: 2,
            fx: 40.0,
            fy: 20.0,
            cx: 2.0,
            cy: 1.0,
        };
        let pixel_x = 3.0;
        let pixel_y = 1.0;
        let depth = 1.25;

        let (x, y, z) = back_project_pixel_to_view_space(pixel_x, pixel_y, depth, camera);
        let (projected_x, projected_y) =
            reproject_view_space_to_pixel(x, y, z, camera).expect("point should reproject");

        assert!((projected_x - pixel_x).abs() < 0.000_001);
        assert!((projected_y - pixel_y).abs() < 0.000_001);
    }

    #[test]
    fn pixel_projection_places_near_disparity_closer_to_viewer() {
        let bytes = depth_manifest_fixture(2, 1, "cgImagePropertyOrientation:1", "")
            .replace(
                "<x:xmpmeta>",
                "<x:xmpmeta><apdi:FloatMinValue>4</apdi:FloatMinValue><apdi:FloatMaxValue>16</apdi:FloatMaxValue>",
            );
        let rgba = [10, 20, 30, 255, 80, 90, 100, 255];
        let depth = [4, 16];

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 2, 1, &depth, 2, 1, 2, 1);

        assert_eq!(report["status"], "available");
        assert_eq!(report["valueUnit"], "disparity");
        let positions = STANDARD
            .decode(report["positionsBase64"].as_str().unwrap())
            .unwrap();
        let far_z = read_f32_le(&positions, 2);
        let near_z = read_f32_le(&positions, 5);
        assert!(
            near_z > far_z,
            "near disparity sample should have a view-space Z closer to the +Z camera"
        );
    }

    #[test]
    fn pixel_projection_uses_display_orientation() {
        let bytes = depth_manifest_fixture(3, 2, "cgImagePropertyOrientation:6", "");
        let rgba = vec![128u8; 3 * 2 * 4];
        let depth = [0, 10, 20, 30, 40, 50];

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 3, 2, &depth, 2, 3, 3, 2);

        assert_eq!(report["status"], "available");
        assert_eq!(report["width"], 3);
        assert_eq!(report["height"], 2);
        assert_eq!(report["rotation"], "clockwise90");
    }

    #[test]
    fn pixel_projection_aligns_front_camera_mirrored_depth_with_display_rgb() {
        let bytes = depth_manifest_fixture(
            3,
            2,
            "cgImagePropertyOrientation:5",
            r#""photoLens":{"position":"front"}"#,
        );
        let rgba = [
            11, 1, 1, 255, 22, 2, 2, 255, 33, 3, 3, 255, 44, 4, 4, 255, 55, 5, 5, 255, 66, 6, 6,
            255,
        ];
        let depth = [10, 20, 30, 40, 50, 60];

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 2, 3, &depth, 3, 2, 2, 3);

        assert_eq!(report["status"], "available");
        assert_eq!(report["width"], 2);
        assert_eq!(report["height"], 3);
        assert_eq!(report["rotation"], "leftMirrored");

        let colors = STANDARD
            .decode(report["colorsBase64"].as_str().unwrap())
            .unwrap();
        assert_eq!(
            colors
                .chunks_exact(3)
                .map(|color| color[0])
                .collect::<Vec<_>>(),
            vec![11, 22, 33, 44, 55, 66]
        );

        let positions = STANDARD
            .decode(report["positionsBase64"].as_str().unwrap())
            .unwrap();
        let z_values = (0..6)
            .map(|index| read_f32_le(&positions, index * 3 + 2))
            .collect::<Vec<_>>();
        let expected = [-0.25, -1.30, -0.60, -1.65, -0.95, -2.0];
        for (actual, expected) in z_values.iter().zip(expected) {
            assert!((actual - expected).abs() < 0.000_1);
        }
    }

    #[test]
    fn pixel_projection_samples_large_planes_for_browser_budget() {
        let bytes = depth_manifest_fixture(800, 1, "cgImagePropertyOrientation:1", "");
        let rgba = vec![128u8; 800 * 4];
        let depth = vec![64u8; 800];

        let report = project_depth_pixels(bytes.as_bytes(), &rgba, 800, 1, &depth, 800, 1, 800, 1);

        assert_eq!(report["status"], "available");
        assert!(report["sampleStep"].as_u64().unwrap() > 1);
        assert!(report["pointCount"].as_u64().unwrap() <= PIXEL_PROJECTION_TARGET_MAX_EDGE as u64);
        assert_eq!(
            risk_flags(&report).len(),
            report["pointCount"].as_u64().unwrap() as usize
        );
        assert_eq!(
            risk_scores(&report, "outlierScoresBase64").len(),
            report["pointCount"].as_u64().unwrap() as usize
        );
        assert_eq!(
            risk_scores(&report, "discontinuityScoresBase64").len(),
            report["pointCount"].as_u64().unwrap() as usize
        );
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
        assert_eq!(
            read_proof_envelope(&bytes, &slot).unwrap(),
            br#"{"ok":true}"#
        );
    }

    #[test]
    fn locates_and_reads_jpeg_app11_proof_slot() {
        let payload = proof_slot_payload(br#"{"ok":true}"#);
        let mut bytes = vec![0xff, 0xd8, 0xff, 0xeb];
        bytes.extend(((payload.len() + 2) as u16).to_be_bytes());
        bytes.extend(payload);
        bytes.extend([0xff, 0xd9]);

        let slot = locate_proof_slot(&bytes, Container::Jpeg).unwrap();
        assert_eq!(slot.kind, "jpeg-app11-proof-slot");
        assert_eq!(slot.container_offset, 2);
        assert_eq!(slot.container_length, PROOF_PAYLOAD_BYTE_COUNT + 4);
        assert_eq!(slot.payload_offset, 6);
        assert_eq!(slot.payload_length, PROOF_PAYLOAD_BYTE_COUNT);
        assert_eq!(
            read_proof_envelope(&bytes, &slot).unwrap(),
            br#"{"ok":true}"#
        );
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
    fn synthetic_live_photo_content_binding_verifies_with_paired_video() {
        let paired_video = b"synthetic mov bytes";
        let bytes = synthetic_signed_live_photo(paired_video);
        let report = verify_capture_package_bytes(&bytes, Some(paired_video));

        assert_eq!(report["status"], "valid");
        assert_eq!(report["mediaKind"], "livePhoto");
        assert_eq!(report["verificationScope"], SCOPE_FULL_LIVE_PHOTO);
        assert_eq!(report["claims"]["fullLivePhotoVerified"], true);
        assert_eq!(report["claims"]["pairedVideoVerified"], true);
        assert_eq!(report["manifest"]["schemaId"], LIVE_PHOTO_MANIFEST_SCHEMA_ID);
        assert_eq!(report["livePhoto"]["pairedVideo"]["status"], "matched");
        assert!(report["serverRequest"].is_object());
        assert!(report["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["id"] == "live-photo-paired-video-resource"
                && check["status"] == "pass"));
        assert!(report["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["id"] == "content-digest" && check["status"] == "pass"));
    }

    #[test]
    fn synthetic_live_photo_reports_missing_paired_video_without_reclassifying_still_photo() {
        let paired_video = b"synthetic mov bytes";
        let bytes = synthetic_signed_live_photo(paired_video);
        let report = verify_capture_bytes(&bytes);

        assert_eq!(report["status"], "valid");
        assert_eq!(report["mediaKind"], "livePhoto");
        assert_eq!(report["verificationScope"], SCOPE_LIVE_PHOTO_PRIMARY);
        assert_eq!(report["claims"]["primaryPhotoVerified"], true);
        assert_eq!(report["claims"]["fullLivePhotoVerified"], false);
        assert_eq!(report["claims"]["pairedVideoVerified"], false);
        assert_eq!(report["livePhoto"]["pairedVideo"]["status"], "missing");
        assert!(report["serverRequest"].is_object());
        assert_eq!(report["warnings"][0]["id"], "paired-video-not-supplied");
        assert!(report["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["id"] == "asset-hash" && check["status"] == "pass"));
        assert!(report["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["id"] == "live-photo-paired-video-resource"
                && check["status"] == "warning"));
    }

    #[test]
    fn synthetic_live_photo_reports_mismatched_paired_video() {
        let paired_video = b"synthetic mov bytes";
        let bytes = synthetic_signed_live_photo(paired_video);
        let report = verify_capture_package_bytes(&bytes, Some(b"wrong mov bytes"));

        assert_eq!(report["status"], "valid");
        assert_eq!(report["mediaKind"], "livePhoto");
        assert_eq!(report["verificationScope"], SCOPE_LIVE_PHOTO_PRIMARY);
        assert_eq!(report["claims"]["primaryPhotoVerified"], true);
        assert_eq!(report["claims"]["fullLivePhotoVerified"], false);
        assert_eq!(report["livePhoto"]["pairedVideo"]["status"], "mismatch");
        assert!(report["serverRequest"].is_object());
        assert_eq!(report["warnings"][0]["id"], "paired-video-mismatch");
        assert!(report["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["id"] == "live-photo-paired-video-resource"
                && check["status"] == "warning"));
    }

    #[test]
    fn local_front_camera_fixture_uses_down_mirrored_depth_orientation_when_available() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("test/tapcam-original-photo.jpg");

        if !fixture.exists() {
            return;
        }

        let bytes = std::fs::read(fixture).unwrap();
        let manifest_json = extract_tap_manifest_json(&bytes).unwrap();
        let manifest: Value = serde_json::from_str(&manifest_json).unwrap();
        let payload = field(&manifest, "payload").unwrap();
        let depth = field(payload, "depth").unwrap();
        let photo = field(payload, "photo").unwrap();

        assert!(is_front_camera_capture(payload));
        assert_eq!(
            photo.get("orientation").and_then(Value::as_str),
            Some("cgImagePropertyOrientation:4")
        );
        assert_eq!(optional_u32(depth, "width"), Some(640));
        assert_eq!(optional_u32(depth, "height"), Some(480));
        assert_eq!(optional_u32(photo, "width"), Some(4032));
        assert_eq!(optional_u32(photo, "height"), Some(3024));
        assert_eq!(
            display_orientation_transform(
                640,
                480,
                Some(4032),
                Some(3024),
                Some("cgImagePropertyOrientation:4"),
                true,
            ),
            OrientationTransform::DownMirrored
        );
    }

    #[test]
    fn local_heic_fixture_verifies_when_available() {
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

    #[test]
    fn local_jpeg_fixture_verifies_when_available() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("test/tap-depth-photo.JPG");

        if !fixture.exists() {
            return;
        }

        let bytes = std::fs::read(fixture).unwrap();
        let report = verify_capture_bytes(&bytes);
        assert_eq!(report["captureId"], "A2138B25-4872-480A-9979-F6473AC568B1");
        assert_eq!(report["status"], "valid");
        assert_eq!(report["manifest"]["containerFormat"], "jpeg");
        assert_eq!(report["proofSlot"]["kind"], "jpeg-app11-proof-slot");
        assert_eq!(report["proofSlot"]["offset"], 2);
        assert_eq!(
            report["recomputed"]["assetSHA256"],
            "j4lzDl_Fcm-FUWnaq_Rii17wj_9acpFqxVdjITjSoXw"
        );
        assert_eq!(
            report["recomputed"]["metadataSHA256"],
            "zMmSu2lpJNhS7sfxrqoS7_Puh8qYc8hJ6NGf0mywjWI"
        );
        assert_eq!(
            report["recomputed"]["bodySHA256"],
            "oNMDNVvLGW9q9olKhJp3l9XdtdPXJkRHJ2qrc1QXTC0"
        );
    }

    #[test]
    fn local_fixture_depth_metadata_visualizes_when_available() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("test/tap-depth-photo.HEIC");

        if !fixture.exists() {
            return;
        }

        let bytes = std::fs::read(fixture).unwrap();
        let luma = vec![64u8; 576 * 768];
        let report = visualize_depth_u8(&bytes, &luma, 576, 768);
        assert_eq!(report["status"], "available");
        assert_eq!(report["sourceKind"], "disparity");
        assert_eq!(report["width"], 768);
        assert_eq!(report["height"], 576);
        assert_eq!(report["rotation"], "clockwise90");
        assert_eq!(report["minValue"], 3.917969);
        assert_eq!(report["maxValue"], 12.304688);
        assert_eq!(report["valueUnit"], "disparity");
    }

    #[test]
    fn local_fixture_depth_aligns_to_original_display_when_available() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("test/tap-depth-photo.HEIC");

        if !fixture.exists() {
            return;
        }

        let bytes = std::fs::read(fixture).unwrap();
        let luma = vec![64u8; 576 * 768];
        let report = visualize_depth_u8_for_display(&bytes, &luma, 576, 768, 3024, 4032);
        assert_eq!(report["status"], "available");
        assert_eq!(report["width"], 576);
        assert_eq!(report["height"], 768);
        assert_eq!(report["rotation"], "none");
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

    fn synthetic_signed_live_photo(paired_video: &[u8]) -> Vec<u8> {
        let payload = json!({
            "alignmentStatus": "sameCapturePipeline",
            "capture": {
                "depthDataDeliveryEnabled": true,
                "depthDataFiltered": true,
                "embedsDepthDataInPhoto": true,
                "photoQualityPrioritization": "quality",
                "requestedCodec": "hvc1"
            },
            "capturedAt": "2026-07-02T00:00:00.000Z",
            "id": "live-capture",
            "livePhoto": {
                "audio": "not-captured",
                "durationSeconds": 2.5,
                "height": 1080,
                "pairedVideoFilename": LIVE_PHOTO_PAIRED_VIDEO_FILENAME,
                "photoDisplayTimeSeconds": 1.0,
                "presence": "paired-video",
                "videoCodec": "hvc1",
                "width": 1920
            }
        });
        let manifest = json!({
            "schema": {
                "id": LIVE_PHOTO_MANIFEST_SCHEMA_ID,
                "mediaType": LIVE_PHOTO_MANIFEST_MEDIA_TYPE,
                "version": 2,
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
        let payload_canonical = canonical_json_bytes(&payload).unwrap();
        let metadata_hash = sha256_base64url(&payload_canonical);
        let paired_video_hash = sha256_base64url(paired_video);
        let digest = recompute_live_photo_content_digest(
            Container::Heic,
            unsigned.len(),
            &slot,
            "live-capture",
            "2026-07-02T00:00:00.000Z",
            &asset_hash,
            &metadata_hash,
            payload_canonical.len(),
            &paired_video_hash,
            paired_video.len(),
        );
        let body_sha = sha256_base64url(&canonical_json_bytes(&digest).unwrap());
        let signing_binding = json!({
            "bodySHA256": body_sha,
            "captureID": "live-capture",
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
            "createdAt": "2026-07-02T00:00:00.000Z",
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

    fn depth_manifest_fixture(
        depth_width: u32,
        depth_height: u32,
        photo_orientation: &str,
        extra_payload_json: &str,
    ) -> String {
        let extra = if extra_payload_json.is_empty() {
            "".to_string()
        } else {
            format!(",{extra_payload_json}")
        };
        format!(
            r#"<x:xmpmeta><tapdepth:Manifest>{{"payload":{{"depth":{{"auxiliaryDataKind":"disparity","height":{depth_height},"orientation":"appleAuxiliaryDepthNative","pixelFormat":"hdis","width":{depth_width}}},"photo":{{"orientation":"{photo_orientation}"}}{extra}}},"proofs":[]}}</tapdepth:Manifest></x:xmpmeta>"#
        )
    }

    fn read_f32_le(bytes: &[u8], index: usize) -> f32 {
        let offset = index * 4;
        f32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
    }

    fn risk_flags(report: &Value) -> Vec<u16> {
        let bytes = STANDARD
            .decode(report["riskFlagsBase64"].as_str().unwrap())
            .unwrap();
        bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes(chunk.try_into().unwrap()))
            .collect()
    }

    fn risk_scores(report: &Value, field: &str) -> Vec<u8> {
        STANDARD.decode(report[field].as_str().unwrap()).unwrap()
    }

    fn quality_has_warning(report: &Value, id: &str) -> bool {
        report["quality"]["warnings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|warning| warning["id"] == id)
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
