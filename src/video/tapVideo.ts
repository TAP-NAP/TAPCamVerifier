import { ZSTDDecoder } from "three/examples/jsm/libs/zstddec.module.js";
import { MAX_CAPTURE_INPUT_BYTES } from "../input/captureInput";
import type { LocalVerificationReport, VerificationCheck } from "../verifier/types";
import { decodeLzfseFrame } from "../wasm/tapcamVerifier";

const MANIFEST_UUID = "TAPCAMVIDEOMANF1";
const PROOF_UUID = "TAPCAMPROOFSLOT1";
const PROOF_MAGIC = "TAPCAM-PROOF-SLOT-V1";
const PROOF_PAYLOAD_BYTES = 60 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_BOX_COUNT = 4096;
const MAX_DEPTH_SAMPLES = 180 * 60;
const MAX_DEPTH_FRAME_BYTES = 32 * 1024 * 1024;
const MAX_KLV_FRAME_BYTES = MAX_DEPTH_FRAME_BYTES + 4096;
const MAX_INLINE_CALIBRATION_BYTES = 3072;
const TAP_DEPTH_METADATA_KEY = "com.tapnap.depth.klv";
const VIDEO_MANIFEST_ID = "urn:tapnap:tapcam:video-manifest:v1";
const VIDEO_MANIFEST_PAYLOAD_MEDIA_TYPE = "application/vnd.tapnap.video-manifest.payload+json;version=1";

export interface TapVideoDepthFormat {
  kind: "depth" | "disparity" | string;
  pixelFormat: "hdep" | "fdep" | "hdis" | "fdis" | string;
  width: number;
  height: number;
  packedRowStride: number;
  bytesPerSample: number;
  byteOrder: string;
  uncompressedFrameByteCount: number;
}

export interface TapVideoManifest {
  schema: {
    id: string;
    version?: unknown;
    mediaType?: unknown;
  };
  payload: {
    id: string;
    packageID: string;
    capturedAt: string;
    container?: Record<string, unknown>;
    rgbTrack?: {
      transform?: string | null;
      [key: string]: unknown;
    };
    audioTrack?: Record<string, unknown>;
    depthCoverage: {
      trackID: number | null;
      trackCodec: string | null;
      sampleCount: number;
      format: TapVideoDepthFormat | null;
      [key: string]: unknown;
    };
    spatialRegistration?: Record<string, unknown>;
    synchronization?: Record<string, unknown>;
    [key: string]: unknown;
  };
  proofs: unknown[];
}

export interface TapVideoDepthFrame {
  frameIndex: number;
  presentationTimeSeconds: number;
  compression: "raw" | "zstd1" | "lzfse";
  uncompressedByteCount: number;
  calibrationIndex: number | null;
  inlineCalibration: Record<string, unknown> | null;
  payload: Uint8Array;
}

export interface TapVideoInspection {
  manifest: TapVideoManifest;
  depthFrames: TapVideoDepthFrame[];
}

export type TapVideoDisplayOrientation =
  | "up"
  | "upMirrored"
  | "down"
  | "downMirrored"
  | "leftMirrored"
  | "right"
  | "rightMirrored"
  | "left";

export interface TapDepthPixels {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface OrientedTapDepthPixels extends TapDepthPixels {
  orientation: TapVideoDisplayOrientation;
}

export interface TapVideoRegistrationDescriptor {
  alignedRGBCodedDimensions: { width: number; height: number };
  encodedRGBCodedDimensions: { width: number; height: number };
  depthDimensions: { width: number; height: number };
  depthToAlignedRGBPixelCenterAffine: number[];
  connectionTransform: string;
  isEncodedHorizontallyMirrored: boolean;
  rgbCleanAperture: { x: number; y: number; width: number; height: number };
}

interface Box {
  type: string;
  start: number;
  size: number;
  headerSize: number;
  payloadStart: number;
  payloadEnd: number;
  userType?: string;
}

interface ProofEnvelope {
  type?: unknown;
  algorithm?: unknown;
  keyID?: unknown;
  createdAt?: unknown;
  value?: unknown;
}

interface ProofValue {
  contentDigest?: unknown;
  keyId?: unknown;
  assertionObject?: unknown;
  signingBinding?: unknown;
}

interface VideoContentDigest extends Record<string, unknown> {
  assetHash: { value: string } & Record<string, unknown>;
  metadataHash: { value: string } & Record<string, unknown>;
}

interface ManifestDocument {
  manifest: TapVideoManifest;
  payloadBytes: Uint8Array;
}

interface JSONDocument {
  value: unknown;
  memberRanges: Map<string, { start: number; end: number }>;
}

interface TrackSample {
  bytes: Uint8Array;
  sampleDescriptionIndex: number;
}

interface ParsedDepthFrame extends TapVideoDepthFrame {
  localKeyID: number;
}

export async function verifyTapVideoLocally(bytes: Uint8Array): Promise<LocalVerificationReport> {
  const checks: VerificationCheck[] = [];
  let manifest: TapVideoManifest | undefined;
  let failureStage = { id: "video-container", label: "TAP Video container" };
  try {
    if (bytes.byteLength > MAX_CAPTURE_INPUT_BYTES) {
      throw new Error("TAP Video exceeds the 512 MiB browser verification limit.");
    }
    const topLevel = parseBoxes(bytes, 0, bytes.byteLength);
    if (!topLevel.some((box) => box.type === "uuid" && (box.userType === MANIFEST_UUID || box.userType === PROOF_UUID))) {
      failureStage = { id: "video-signature-missing", label: "TAP Video signature" };
    }
    const manifestBox = requireUniqueUUIDBox(topLevel, MANIFEST_UUID, "TAP video manifest");
    const proofBox = requireUniqueUUIDBox(topLevel, PROOF_UUID, "TAP proof slot");
    failureStage = { id: "video-manifest", label: "TAP Video manifest" };
    const manifestDocument = parseManifest(bytes.subarray(manifestBox.payloadStart, manifestBox.payloadEnd));
    manifest = manifestDocument.manifest;
    checks.push(pass("video-container", "TAP Video container", "Found one v1 video manifest and one fixed proof slot."));

    failureStage = { id: "video-proof", label: "TAP Video proof envelope" };
    const proof = parseProofEnvelope(bytes, proofBox);
    const proofValue = parseProofValue(proof);
    checks.push(pass("video-proof", "TAP Video proof envelope", "The App Attest proof envelope and fixed-slot padding are structurally valid."));

    failureStage = { id: "video-content-binding", label: "TAP Video v1 content binding" };
    // Descriptors are signed metadata; only covered bytes and binding identity
    // are reconstructed here. Media decoding belongs to the depth/player path.
    const suppliedDigest = requireObject(proofValue.contentDigest, "TAP Video content digest");
    const recomputedDigest = await buildContentDigest(bytes, proofBox, manifest, manifestDocument.payloadBytes, suppliedDigest.depthResource);
    const digestMatches = canonicalJSON(suppliedDigest) === canonicalJSON(recomputedDigest);
    checks.push(check(
      "video-content-binding",
      "TAP Video v1 content binding",
      digestMatches,
      digestMatches
        ? "MP4 bytes outside the proof slot and raw manifest payload bytes match the signed v1 binding."
        : "Signed TAP Video content binding does not match the supplied MP4 bytes."
    ));

    failureStage = { id: "video-signing-binding", label: "TAP Video signing binding" };
    const expectedSigningBinding = {
      bodySHA256: await sha256Base64Url(utf8(canonicalJSON(recomputedDigest))),
      captureID: manifest.payload.id,
      operation: "tapcam.capture.sign" as const,
      schemaID: "urn:tapnap:tapcam:app-attest-capture-signing:v1" as const
    };
    const signingBindingMatches = canonicalJSON(proofValue.signingBinding) === canonicalJSON(expectedSigningBinding);
    checks.push(check(
      "video-signing-binding",
      "TAP Video signing binding",
      signingBindingMatches,
      signingBindingMatches
        ? "Signing binding matches the recomputed video content digest."
        : "Signing binding does not match the recomputed video content digest."
    ));

    const keyMatches = typeof proof.keyID === "string" && proof.keyID.length > 0 && proof.keyID === proofValue.keyId;
    const proofFieldsValid =
      proof.type === "appAttestAssertion" &&
      proof.algorithm === "TAPCam.AppAttestCaptureSignature.v1" &&
      keyMatches &&
      typeof proofValue.assertionObject === "string" &&
      proofValue.assertionObject.length > 0;
    checks.push(check(
      "video-proof-fields",
      "TAP Video proof fields",
      proofFieldsValid,
      proofFieldsValid ? "Proof identity and assertion fields are consistent." : "Proof identity or assertion fields are inconsistent."
    ));

    const localBindingMatches = proofFieldsValid && signingBindingMatches && digestMatches;
    const serverRequest = localBindingMatches
      ? {
          keyId: proofValue.keyId as string,
          assertionObject: proofValue.assertionObject as string,
          signingBinding: expectedSigningBinding
        }
      : null;
    const valid = checks.every((item) => item.status !== "fail") && serverRequest !== null;
    return {
      status: valid ? "valid" : "invalid",
      summary: valid
        ? "TAP Video bytes match the embedded binding; server signature verification is still required."
        : "TAP Video local hard-binding checks failed.",
      mediaKind: "video",
      verificationScope: "fullVideo",
      claims: {
        manifestVerified: digestMatches
      },
      captureId: manifest.payload.id,
      capturedAt: manifest.payload.capturedAt,
      manifest: {
        containerFormat: "mp4",
        schemaId: manifest.schema.id,
        proofCount: 1,
        capture: manifest.payload,
        livePhoto: null
      },
      recomputed: {
        assetSHA256: recomputedDigest.assetHash.value,
        metadataSHA256: recomputedDigest.metadataHash.value,
        bodySHA256: expectedSigningBinding.bodySHA256,
        signingBindingSHA256: await sha256Base64Url(utf8(canonicalJSON(expectedSigningBinding)))
      },
      expected: {
        assetSHA256: getNestedString(suppliedDigest, "assetHash", "value"),
        metadataSHA256: getNestedString(suppliedDigest, "metadataHash", "value"),
        bodySHA256: getNestedString(proofValue.signingBinding, "bodySHA256"),
        contentDigest: suppliedDigest
      },
      serverRequest,
      checks
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedCheck: VerificationCheck = {
      ...failureStage,
      status: "fail",
      detail: message
    };
    return {
      status: "invalid",
      summary: message,
      mediaKind: "video",
      verificationScope: "fullVideo",
      captureId: manifest?.payload.id ?? null,
      capturedAt: manifest?.payload.capturedAt ?? null,
      manifest: {
        containerFormat: "mp4",
        schemaId: manifest?.schema.id,
        capture: manifest?.payload
      },
      serverRequest: null,
      checks: [...checks, failedCheck]
    };
  }
}

export function inspectTapVideoDepth(bytes: Uint8Array): TapVideoInspection {
  if (bytes.byteLength > MAX_CAPTURE_INPUT_BYTES) throw new Error("TAP Video exceeds the 512 MiB browser input limit.");
  const topLevel = parseBoxes(bytes, 0, bytes.byteLength);
  const manifestBox = requireUniqueUUIDBox(topLevel, MANIFEST_UUID, "TAP video manifest");
  const manifest = parseManifest(bytes.subarray(manifestBox.payloadStart, manifestBox.payloadEnd)).manifest;
  const coverage = manifest.payload.depthCoverage;
  if (!coverage?.format || coverage.trackID == null) {
    return { manifest, depthFrames: [] };
  }
  const moov = topLevel.find((box) => box.type === "moov");
  if (!moov) {
    throw new Error("TAP Video has no moov box.");
  }
  const tracks = children(bytes, moov).filter((box) => box.type === "trak");
  const depthTrack = tracks.find((track) => readTrackID(bytes, track) === coverage.trackID);
  if (!depthTrack) {
    throw new Error("Manifest depth track is missing from the MP4 sample table.");
  }
  const samples = readTrackSamples(bytes, depthTrack);
  const keyMappings = readMebxKeyMappings(bytes, depthTrack);
  const depthFrames = samples.map((sample) => {
    const frame = decodeMebxDepthSample(sample.bytes);
    requireTapDepthKeyMapping(keyMappings, sample.sampleDescriptionIndex, frame.localKeyID);
    return frame;
  });
  return { manifest, depthFrames };
}

let zstdDecoderPromise: Promise<ZSTDDecoder> | null = null;

export async function decodeTapDepthFrame(frame: TapVideoDepthFrame): Promise<Uint8Array> {
  if (!Number.isSafeInteger(frame.uncompressedByteCount) || frame.uncompressedByteCount <= 0 ||
      frame.uncompressedByteCount > MAX_DEPTH_FRAME_BYTES || frame.payload.byteLength > MAX_DEPTH_FRAME_BYTES) {
    throw new Error("Depth frame exceeds the bounded encoded or decoded size.");
  }
  let decoded: Uint8Array;
  if (frame.compression === "raw") {
    decoded = frame.payload;
  } else if (frame.compression === "zstd1") {
    const decoder = await getZstdDecoder();
    decoded = decoder.decode(frame.payload, frame.uncompressedByteCount);
  } else if (frame.compression === "lzfse") {
    decoded = await decodeLzfseFrame(frame.payload, frame.uncompressedByteCount);
  } else {
    throw new Error("Unsupported TAP depth frame compression.");
  }
  if (decoded.byteLength !== frame.uncompressedByteCount) {
    throw new Error("Decoded depth frame byte count does not match ULEN.");
  }
  return decoded;
}

export function renderTapDepthFrame(
  bytes: Uint8Array,
  format: TapVideoDepthFormat,
  canvas: HTMLCanvasElement,
  transform?: string | null,
  registration?: TapVideoManifest["payload"]["spatialRegistration"]
): { min: number; max: number } {
  const { width, height, bytesPerSample, packedRowStride, pixelFormat } = format;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > 16_777_216) {
    throw new Error("Invalid TAP depth frame dimensions.");
  }
  const expectedSampleBytes = { hdep: 2, hdis: 2, fdep: 4, fdis: 4 }[pixelFormat];
  if (format.byteOrder !== "little-endian" || expectedSampleBytes !== bytesPerSample ||
      !Number.isSafeInteger(packedRowStride) || packedRowStride < width * bytesPerSample ||
      packedRowStride * height > MAX_DEPTH_FRAME_BYTES || packedRowStride * height !== bytes.byteLength) {
    throw new Error("Invalid TAP depth frame layout.");
  }
  const values = new Float32Array(width * height);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * packedRowStride + x * bytesPerSample;
      const value = bytesPerSample === 2
        ? float16ToNumber(view.getUint16(offset, true))
        : view.getFloat32(offset, true);
      const index = y * width + x;
      values[index] = value;
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 0;
  }
  const span = Math.max(max - min, Number.EPSILON);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const isDisparity = pixelFormat.endsWith("dis") || format.kind === "disparity";
  for (let index = 0; index < values.length; index += 1) {
    const raw = Number.isFinite(values[index]) ? (values[index] - min) / span : 0;
    const normalized = isDisparity ? raw : 1 - raw;
    const [r, g, b] = depthColor(normalized);
    const offset = index * 4;
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = 255;
  }
  const oriented = registration?.status === "registered"
    ? registerTapDepthPixels(rgba, width, height, registration.descriptor as TapVideoRegistrationDescriptor)
    : orientTapDepthPixels(rgba, width, height, transform);
  canvas.width = oriented.width;
  canvas.height = oriented.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Depth canvas 2D context is unavailable.");
  }
  const image = new ImageData(oriented.width, oriented.height);
  image.data.set(oriented.rgba);
  context.putImageData(image, 0, 0);
  return { min, max };
}

/** Maps registered depth into the encoded RGB aperture. Unlike the legacy
 * display transform, its horizontal mirror follows the connection rotation. */
export function registerTapDepthPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  descriptor: TapVideoRegistrationDescriptor
): TapDepthPixels {
  const aligned = descriptor.alignedRGBCodedDimensions;
  const encoded = descriptor.encodedRGBCodedDimensions;
  const crop = descriptor.rgbCleanAperture;
  const affine = descriptor.depthToAlignedRGBPixelCenterAffine;
  const match = /^rotation:(0|90|180|270);(mirrored|not-mirrored)$/.exec(descriptor.connectionTransform);
  if (!match || descriptor.isEncodedHorizontallyMirrored !== (match[2] === "mirrored") ||
      descriptor.depthDimensions.width !== width || descriptor.depthDimensions.height !== height ||
      ![width, height, aligned.width, aligned.height, encoded.width, encoded.height].every((value) => Number.isSafeInteger(value) && value > 0) ||
      rgba.length !== width * height * 4 || affine.length !== 6 || !affine.every(Number.isFinite) ||
      ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
      crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 ||
      crop.x + crop.width > encoded.width || crop.y + crop.height > encoded.height) {
    throw new Error("Invalid TAP Video depth registration geometry.");
  }
  const rotation = Number(match[1]);
  const swapsAxes = rotation === 90 || rotation === 270;
  if (encoded.width !== (swapsAxes ? aligned.height : aligned.width) ||
      encoded.height !== (swapsAxes ? aligned.width : aligned.height)) {
    throw new Error("TAP Video registration rotation does not match encoded RGB dimensions.");
  }
  const [a, b, tx, c, d, ty] = affine;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < Number.EPSILON) {
    throw new Error("TAP Video depth registration affine is not invertible.");
  }

  // Keep the original depth pixel density instead of upsampling to RGB size.
  const scale = Math.min(1, width / aligned.width, height / aligned.height);
  const outputWidth = Math.max(1, Math.round(crop.width * scale));
  const outputHeight = Math.max(1, Math.round(crop.height * scale));
  if (outputWidth * outputHeight > 16_777_216) {
    throw new Error("TAP Video registered depth preview exceeds the pixel limit.");
  }
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  const inverseRotation = tapVideoDisplayOrientation(`rotation:${(360 - rotation) % 360}`);
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      let encodedX = crop.x + (x + 0.5) * crop.width / outputWidth - 0.5;
      const encodedY = crop.y + (y + 0.5) * crop.height / outputHeight - 0.5;
      if (descriptor.isEncodedHorizontallyMirrored) encodedX = encoded.width - 1 - encodedX;
      const [alignedX, alignedY] = orientedCoordinate(encodedX, encodedY, encoded.width, encoded.height, inverseRotation);
      const sourceX = Math.round((d * (alignedX - tx) - b * (alignedY - ty)) / determinant);
      const sourceY = Math.round((a * (alignedY - ty) - c * (alignedX - tx)) / determinant);
      if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) continue;
      const sourceOffset = (sourceY * width + sourceX) * 4;
      output.set(rgba.subarray(sourceOffset, sourceOffset + 4), (y * outputWidth + x) * 4);
    }
  }
  return { width: outputWidth, height: outputHeight, rgba: output };
}

/** Applies the signed RGB-track transform to the raw depth grid. */
export function orientTapDepthPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  transform?: string | null
): OrientedTapDepthPixels {
  if (width <= 0 || height <= 0 || rgba.length !== width * height * 4) {
    throw new Error("Invalid TAP depth pixel buffer for display orientation.");
  }
  const orientation = tapVideoDisplayOrientation(transform);
  const swapsAxes = orientation === "leftMirrored" || orientation === "right" ||
    orientation === "rightMirrored" || orientation === "left";
  const outputWidth = swapsAxes ? height : width;
  const outputHeight = swapsAxes ? width : height;
  const output = new Uint8ClampedArray(rgba.length);

  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    for (let sourceX = 0; sourceX < width; sourceX += 1) {
      const [displayX, displayY] = orientedCoordinate(sourceX, sourceY, width, height, orientation);
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const displayOffset = (displayY * outputWidth + displayX) * 4;
      output.set(rgba.subarray(sourceOffset, sourceOffset + 4), displayOffset);
    }
  }
  return { width: outputWidth, height: outputHeight, rgba: output, orientation };
}

export function tapVideoDisplayOrientation(transform?: string | null): TapVideoDisplayOrientation {
  if (!transform || transform === "identity") return "up";
  const orientations: Record<string, TapVideoDisplayOrientation> = {
    "rotation:0": "up",
    "rotation:0;mirrored": "upMirrored",
    "rotation:90": "right",
    "rotation:90;mirrored": "rightMirrored",
    "rotation:180": "down",
    "rotation:180;mirrored": "downMirrored",
    "rotation:270": "left",
    "rotation:270;mirrored": "leftMirrored"
  };
  const orientation = orientations[transform];
  if (!orientation) {
    throw new Error("Unsupported TAP Video RGB display transform.");
  }
  return orientation;
}

function orientedCoordinate(
  x: number,
  y: number,
  width: number,
  height: number,
  orientation: TapVideoDisplayOrientation
): [number, number] {
  switch (orientation) {
    case "up": return [x, y];
    case "upMirrored": return [width - 1 - x, y];
    case "down": return [width - 1 - x, height - 1 - y];
    case "downMirrored": return [x, height - 1 - y];
    case "leftMirrored": return [y, x];
    case "right": return [height - 1 - y, x];
    case "rightMirrored": return [height - 1 - y, width - 1 - x];
    case "left": return [y, width - 1 - x];
  }
}

function getZstdDecoder(): Promise<ZSTDDecoder> {
  if (!zstdDecoderPromise) {
    zstdDecoderPromise = (async () => {
      const decoder = new ZSTDDecoder();
      await decoder.init();
      return decoder;
    })();
  }
  return zstdDecoderPromise;
}

function parseManifest(bytes: Uint8Array): ManifestDocument {
  if (bytes.byteLength > MAX_MANIFEST_BYTES) throw new Error("TAP video manifest exceeds the bounded payload limit.");
  const text = decodeUTF8(bytes, "TAP Video manifest");
  const document = parseJSONDocument(text, "TAP Video manifest");
  const value = document.value;
  if (!isRecord(value) || !isRecord(value.schema) || !isRecord(value.payload)) {
    throw new Error("Invalid TAP Video manifest JSON.");
  }
  if (value.schema.id !== VIDEO_MANIFEST_ID) {
    throw new Error("Unsupported TAP Video manifest binding family.");
  }
  requireNonEmptyString(value.payload.id, "payload.id");
  requireString(value.payload.capturedAt, "payload.capturedAt");
  const range = document.memberRanges.get("payload");
  if (!range) {
    throw new Error("TAP Video manifest payload raw bytes are unavailable.");
  }
  return {
    manifest: value as unknown as TapVideoManifest,
    payloadBytes: utf8(text.slice(range.start, range.end))
  };
}

function parseJSONDocument(text: string, label: string): JSONDocument {
  let offset = 0;
  const memberRanges = new Map<string, { start: number; end: number }>();

  const skipWhitespace = (): void => { while (/^[ \t\r\n]$/.test(text[offset] ?? "")) offset += 1; };

  const parseValue = (path: string[]): unknown => {
    if (path.length > 128) throw new Error(`${label} exceeds the JSON nesting limit.`);
    skipWhitespace();
    const character = text[offset];
    if (character === "{") return parseObject(path);
    if (character === "[") return parseArray(path);
    if (character === '"') return parseString();
    if (text.startsWith("true", offset)) { offset += 4; return true; }
    if (text.startsWith("false", offset)) { offset += 5; return false; }
    if (text.startsWith("null", offset)) { offset += 4; return null; }
    const match = text.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) throw new Error(`${label} is not valid JSON.`);
    const token = match[0];
    const number = Number(token);
    offset += token.length;
    return number;
  };

  const parseObject = (path: string[]): Record<string, unknown> => {
    offset += 1;
    const result: Record<string, unknown> = Object.create(null);
    skipWhitespace();
    if (text[offset] === "}") { offset += 1; return result; }
    while (true) {
      skipWhitespace();
      if (text[offset] !== '"') throw new Error(`${label} contains an invalid object member.`);
      const key = parseString();
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        throw new Error(`${label} contains a duplicate object member.`);
      }
      skipWhitespace();
      if (text[offset] !== ":") throw new Error(`${label} contains a missing colon.`);
      offset += 1;
      skipWhitespace();
      const valueStart = offset;
      result[key] = parseValue([...path, key]);
      if (path.length === 0) memberRanges.set(key, { start: valueStart, end: offset });
      skipWhitespace();
      if (text[offset] === "}") { offset += 1; return result; }
      if (text[offset] !== ",") throw new Error(`${label} contains an invalid object separator.`);
      offset += 1;
    }
  };

  const parseArray = (path: string[]): unknown[] => {
    offset += 1;
    const result: unknown[] = [];
    skipWhitespace();
    if (text[offset] === "]") { offset += 1; return result; }
    while (true) {
      result.push(parseValue([...path, String(result.length)]));
      skipWhitespace();
      if (text[offset] === "]") { offset += 1; return result; }
      if (text[offset] !== ",") throw new Error(`${label} contains an invalid array separator.`);
      offset += 1;
    }
  };

  const parseString = (): string => {
    const start = offset;
    offset += 1;
    let escaped = false;
    while (offset < text.length) {
      const code = text.charCodeAt(offset);
      if (!escaped && code === 0x22) {
        offset += 1;
        const token = text.slice(start, offset);
        let value: string;
        try {
          value = JSON.parse(token) as string;
        } catch {
          throw new Error(`${label} contains an invalid JSON string.`);
        }
        if (!hasOnlyUnicodeScalars(value)) throw new Error(`${label} contains an invalid Unicode string.`);
        return value;
      }
      if (!escaped && code < 0x20) throw new Error(`${label} contains an unescaped control character.`);
      if (!escaped && code === 0x5c) {
        escaped = true;
      } else {
        escaped = false;
      }
      offset += 1;
    }
    throw new Error(`${label} contains an unterminated JSON string.`);
  };

  const value = parseValue([]);
  skipWhitespace();
  if (offset !== text.length) throw new Error(`${label} contains trailing bytes.`);
  return { value, memberRanges };
}

function validateCalibration(value: unknown, label: string): void {
  const calibration = requireObject(value, label);
  requireAllowedKeys(calibration, [
    "extrinsicMatrix", "intrinsicMatrix", "intrinsicMatrixReferenceDimensions", "inverseLensDistortionLookupTable",
    "lensDistortionCenter", "lensDistortionLookupTable", "pixelSizeMillimeters"
  ], ["extrinsicMatrix", "intrinsicMatrix", "intrinsicMatrixReferenceDimensions", "lensDistortionCenter", "pixelSizeMillimeters"], label);
  requireNumberArray(calibration.intrinsicMatrix, 9, `${label}.intrinsicMatrix`);
  requireNumberArray(calibration.extrinsicMatrix, 12, `${label}.extrinsicMatrix`);
  validateDimensions(calibration.intrinsicMatrixReferenceDimensions, `${label}.intrinsicMatrixReferenceDimensions`);
  requireFiniteNumber(calibration.pixelSizeMillimeters, `${label}.pixelSizeMillimeters`);
  validatePoint(calibration.lensDistortionCenter, `${label}.lensDistortionCenter`);
  for (const key of ["lensDistortionLookupTable", "inverseLensDistortionLookupTable"]) {
    if (calibration[key] !== undefined && calibration[key] !== null) requireBase64(calibration[key], `${label}.${key}`);
  }
}

function decodeInlineCalibration(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.byteLength > MAX_INLINE_CALIBRATION_BYTES) throw new Error("TAP depth CALD exceeds 3072 bytes.");
  const document = parseJSONDocument(decodeUTF8(bytes, "TAP depth CALD"), "TAP depth CALD");
  const value = requireObject(document.value, "TAP depth CALD");
  requireExactKeys(value, ["calibration", "schemaVersion"], "TAP depth CALD");
  if (value.schemaVersion !== 1) throw new Error("Unsupported TAP depth CALD schema.");
  validateCalibration(value.calibration, "CALD.calibration");
  return value.calibration as Record<string, unknown>;
}

function validateDimensions(value: unknown, label: string): void {
  const dimensions = requireObject(value, label);
  requireExactKeys(dimensions, ["height", "width"], label);
  requireFiniteNumber(dimensions.width, `${label}.width`);
  requireFiniteNumber(dimensions.height, `${label}.height`);
}

function validatePoint(value: unknown, label: string): void {
  const point = requireObject(value, label);
  requireExactKeys(point, ["x", "y"], label);
  requireFiniteNumber(point.x, `${label}.x`);
  requireFiniteNumber(point.y, `${label}.y`);
}

function requireNumberArray(value: unknown, length: number, label: string): void {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} must contain exactly ${length} numbers.`);
  value.forEach((item, index) => requireFiniteNumber(item, `${label}[${index}]`));
}

function requireBase64(value: unknown, label: string): void {
  requireString(value, label);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value as string) || btoa(atob(value as string)) !== value) {
    throw new Error(`${label} is not canonical base64.`);
  }
}

function readSampleDescriptions(bytes: Uint8Array, stbl: Box): Box[] {
  const stsd = requireUniqueChild(bytes, stbl, "stsd");
  if (stsd.payloadStart + 8 > stsd.payloadEnd) throw new Error("Truncated MP4 sample-description table.");
  const entryCount = readU32(bytes, stsd.payloadStart + 4);
  if (entryCount === 0 || entryCount > 32) throw new Error("Invalid MP4 sample-description count.");
  const entries = parseBoxes(bytes, stsd.payloadStart + 8, stsd.payloadEnd);
  if (entries.length !== entryCount) throw new Error("MP4 sample-description count does not match its table.");
  return entries;
}

function readMebxKeyMappings(bytes: Uint8Array, track: Box): Map<number, Map<number, string>> {
  const mdia = requireUniqueChild(bytes, track, "mdia");
  const minf = requireUniqueChild(bytes, mdia, "minf");
  const stbl = requireUniqueChild(bytes, minf, "stbl");
  const descriptions = readSampleDescriptions(bytes, stbl);
  const result = new Map<number, Map<number, string>>();
  descriptions.forEach((description, index) => {
    if (description.type !== "mebx" || description.payloadStart + 8 > description.payloadEnd) {
      throw new Error("TAP depth sample description must use mebx.");
    }
    const childBoxes = parseBoxes(bytes, description.payloadStart + 8, description.payloadEnd);
    const keyTables = childBoxes.filter((box) => box.type === "keys");
    if (keyTables.length !== 1) throw new Error("TAP depth mebx description has a missing or ambiguous metadata key table.");
    const mappings = new Map<number, string>();
    for (const keyAtom of children(bytes, keyTables[0])) {
      const localKeyID = readU32(bytes, keyAtom.start + 4);
      if (localKeyID === 0 || localKeyID === 0xffffffff || mappings.has(localKeyID)) throw new Error("Invalid or duplicate mebx local key identifier.");
      const declarations = children(bytes, keyAtom).filter((box) => box.type === "keyd");
      if (declarations.length !== 1 || declarations[0].payloadStart + 4 > declarations[0].payloadEnd) throw new Error("Invalid mebx metadata key declaration.");
      const declaration = declarations[0];
      const namespace = asciiFourCC(bytes, declaration.payloadStart);
      const key = decodeUTF8(bytes.subarray(declaration.payloadStart + 4, declaration.payloadEnd), "mebx metadata key");
      mappings.set(localKeyID, `${namespace}/${key}`);
    }
    result.set(index + 1, mappings);
  });
  return result;
}

function requireTapDepthKeyMapping(mappings: Map<number, Map<number, string>>, descriptionIndex: number, localKeyID: number): void {
  const description = mappings.get(descriptionIndex);
  const expected = `mdta/${TAP_DEPTH_METADATA_KEY}`;
  if (!description || description.get(localKeyID) !== expected || [...description.values()].filter((value) => value === expected).length !== 1) {
    throw new Error("mebx local key does not uniquely resolve to mdta/com.tapnap.depth.klv.");
  }
}

function parseProofEnvelope(bytes: Uint8Array, box: Box): ProofEnvelope {
  if (box.payloadEnd - box.payloadStart !== PROOF_PAYLOAD_BYTES) {
    throw new Error("Unexpected TAP proof-slot payload length.");
  }
  const payload = bytes.subarray(box.payloadStart, box.payloadEnd);
  if (ascii(payload, 0, PROOF_MAGIC.length) !== PROOF_MAGIC || readU32(payload, 24) !== 1) {
    throw new Error("Invalid TAP proof-slot header.");
  }
  const envelopeLength = readU32(payload, 28);
  if (envelopeLength <= 0 || envelopeLength > payload.length - 32) {
    throw new Error("Invalid TAP proof-envelope length.");
  }
  if (payload.subarray(32 + envelopeLength).some((value) => value !== 0)) {
    throw new Error("TAP proof-slot padding is not zero-filled.");
  }
  const envelopeText = decodeUTF8(payload.subarray(32, 32 + envelopeLength), "TAP proof envelope");
  const value = parseJSONDocument(envelopeText, "TAP proof envelope").value;
  if (!isRecord(value)) {
    throw new Error("Invalid TAP proof envelope.");
  }
  return value;
}

function parseProofValue(proof: ProofEnvelope): ProofValue {
  if (typeof proof.value !== "string" || !proof.value) {
    throw new Error("TAP proof value is missing.");
  }
  const proofValueText = decodeUTF8(base64UrlDecode(proof.value), "TAP proof value");
  const value = parseJSONDocument(proofValueText, "TAP proof value").value;
  if (!isRecord(value)) {
    throw new Error("Invalid TAP proof value.");
  }
  return value;
}

async function buildContentDigest(
  bytes: Uint8Array,
  proofBox: Box,
  manifest: TapVideoManifest,
  payloadBytes: Uint8Array,
  depthResource: unknown
): Promise<VideoContentDigest> {
  const signedBytes = new Uint8Array(bytes.byteLength - proofBox.size);
  signedBytes.set(bytes.subarray(0, proofBox.start), 0);
  signedBytes.set(bytes.subarray(proofBox.start + proofBox.size), proofBox.start);
  const assetHash = await sha256Base64Url(signedBytes);
  const metadataHash = await sha256Base64Url(payloadBytes);
  return {
    assetHash: {
      algorithm: "SHA-256",
      byteCount: bytes.byteLength,
      excludedRanges: [{ length: proofBox.size, offset: proofBox.start, reason: "tap-proof-slot" }],
      fileContainer: "mp4",
      kind: "c2pa-style-format-native-byte-ranges",
      value: assetHash
    },
    captureID: manifest.payload.id,
    capturedAt: manifest.payload.capturedAt,
    depthResource,
    manifestSchemaID: manifest.schema.id,
    metadataHash: {
      algorithm: "SHA-256",
      kind: "canonical-json",
      mediaType: VIDEO_MANIFEST_PAYLOAD_MEDIA_TYPE,
      value: metadataHash
    },
    proofSlot: {
      kind: "bmff-uuid-proof-slot",
      length: proofBox.size,
      offset: proofBox.start,
      padding: "zero-filled-after-envelope",
      payloadLength: proofBox.payloadEnd - proofBox.payloadStart,
      payloadOffset: proofBox.payloadStart
    },
    schemaID: "urn:tapnap:tapcam:video-content-binding:v1"
  };
}

function decodeMebxDepthSample(sample: Uint8Array): ParsedDepthFrame {
  if (sample.byteLength < 8 || sample.byteLength > MAX_KLV_FRAME_BYTES + 8 || readU32(sample, 0) !== sample.byteLength) {
    throw new Error("Invalid mebx timed-metadata sample wrapper.");
  }
  const localKeyID = readU32(sample, 4);
  if (localKeyID === 0 || localKeyID === 0xffffffff) {
    throw new Error("Invalid mebx timed-metadata local key identifier.");
  }
  const records = new Map<string, Uint8Array>();
  let offset = 8;
  while (offset < sample.byteLength) {
    if (offset + 8 > sample.byteLength || records.size >= 32) {
      throw new Error("Truncated or oversized TAP depth KLV record set.");
    }
    const key = asciiFourCC(sample, offset);
    const length = readU32(sample, offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const paddedEnd = payloadEnd + ((4 - (length % 4)) % 4);
    if (paddedEnd > sample.byteLength || sample.subarray(payloadEnd, paddedEnd).some((value) => value !== 0)) {
      throw new Error("Invalid TAP depth KLV payload or padding.");
    }
    if (records.has(key)) {
      throw new Error(`Duplicate TAP depth KLV record ${key}.`);
    }
    records.set(key, sample.subarray(payloadStart, payloadEnd));
    offset = paddedEnd;
  }
  const version = requireRecord(records, "TVER", 4);
  const frame = requireRecord(records, "FRAM", 4);
  const pts = requireRecord(records, "PTS ", 12);
  const compressionBytes = requireRecord(records, "COMP");
  const uncompressed = requireRecord(records, "ULEN", 4);
  const payload = requireRecord(records, "DPTH");
  if (readU32(version, 0) !== 1) {
    throw new Error("Unsupported TAP depth KLV schema.");
  }
  const compression = ascii(compressionBytes, 0, compressionBytes.length);
  if (compression !== "raw" && compression !== "zstd1" && compression !== "lzfse") {
    throw new Error("Unsupported TAP depth compression codec.");
  }
  const timescale = readI32(pts, 8);
  if (timescale <= 0) {
    throw new Error("Invalid TAP depth presentation timescale.");
  }
  const calibration = records.get("CALI");
  const inlineCalibration = records.get("CALD");
  if (calibration && inlineCalibration) throw new Error("TAP depth CALI and CALD are mutually exclusive.");
  return {
    frameIndex: readU32(frame, 0),
    presentationTimeSeconds: Number(readI64(pts, 0)) / timescale,
    compression,
    uncompressedByteCount: readU32(uncompressed, 0),
    calibrationIndex: calibration ? readU32(requireRecord(records, "CALI", 4), 0) : null,
    inlineCalibration: inlineCalibration ? decodeInlineCalibration(inlineCalibration) : null,
    payload,
    localKeyID
  };
}

function readTrackSamples(bytes: Uint8Array, track: Box): TrackSample[] {
  const mdia = requireChild(bytes, track, "mdia");
  const minf = requireChild(bytes, mdia, "minf");
  const stbl = requireChild(bytes, minf, "stbl");
  const stsz = requireChild(bytes, stbl, "stsz");
  const stsc = requireChild(bytes, stbl, "stsc");
  const stco = children(bytes, stbl).find((box) => box.type === "stco" || box.type === "co64");
  if (!stco) {
    throw new Error("Depth track has no chunk offset table.");
  }
  const sampleSize = readU32(bytes, stsz.payloadStart + 4);
  const sampleCount = readU32(bytes, stsz.payloadStart + 8);
  if (sampleCount > MAX_DEPTH_SAMPLES) {
    throw new Error("Depth track exceeds the bounded sample count.");
  }
  if (sampleSize === 0 && stsz.payloadStart + 12 + sampleCount * 4 > stsz.payloadEnd) {
    throw new Error("Depth sample-size table is truncated.");
  }
  const sizes: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    sizes.push(sampleSize || readU32(bytes, stsz.payloadStart + 12 + index * 4));
  }
  const stscCount = readU32(bytes, stsc.payloadStart + 4);
  if (stscCount === 0 || stsc.payloadStart + 8 + stscCount * 12 > stsc.payloadEnd) {
    throw new Error("Invalid depth sample-to-chunk table.");
  }
  const mappings: Array<{ firstChunk: number; samplesPerChunk: number; sampleDescriptionIndex: number }> = [];
  for (let index = 0; index < stscCount; index += 1) {
    const offset = stsc.payloadStart + 8 + index * 12;
    const mapping = {
      firstChunk: readU32(bytes, offset),
      samplesPerChunk: readU32(bytes, offset + 4),
      sampleDescriptionIndex: readU32(bytes, offset + 8)
    };
    if (mapping.firstChunk === 0 || mapping.samplesPerChunk === 0 || mapping.sampleDescriptionIndex === 0 ||
        (index > 0 && mapping.firstChunk <= mappings[index - 1].firstChunk)) {
      throw new Error("Invalid depth sample-to-chunk mapping.");
    }
    mappings.push(mapping);
  }
  const chunkCount = readU32(bytes, stco.payloadStart + 4);
  const chunkEntryBytes = stco.type === "co64" ? 8 : 4;
  if (stco.payloadStart + 8 + chunkCount * chunkEntryBytes > stco.payloadEnd) {
    throw new Error("Depth chunk-offset table is truncated.");
  }
  const chunks: number[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const offset = stco.payloadStart + 8 + index * (stco.type === "co64" ? 8 : 4);
    const value = stco.type === "co64" ? Number(readU64(bytes, offset)) : readU32(bytes, offset);
    chunks.push(value);
  }
  if (mappings[mappings.length - 1].firstChunk > chunkCount) throw new Error("Depth sample-to-chunk mapping references a missing chunk.");
  const samples: TrackSample[] = [];
  const mediaDataRanges = parseBoxes(bytes, 0, bytes.byteLength).filter((box) => box.type === "mdat");
  let sampleIndex = 0;
  let mappingIndex = 0;
  let usedChunkCount = 0;
  for (let chunkIndex = 0; chunkIndex < chunks.length && sampleIndex < sizes.length; chunkIndex += 1) {
    const oneBasedChunk = chunkIndex + 1;
    while (mappingIndex + 1 < mappings.length && mappings[mappingIndex + 1].firstChunk <= oneBasedChunk) {
      mappingIndex += 1;
    }
    const mapping = mappings[mappingIndex];
    if (!mapping || mapping.firstChunk > oneBasedChunk) {
      throw new Error("Invalid depth stsc mapping.");
    }
    let offset = chunks[chunkIndex];
    for (let count = 0; count < mapping.samplesPerChunk; count += 1) {
      if (sampleIndex >= sizes.length) throw new Error("Depth sample-to-chunk table overstates its samples.");
      const size = sizes[sampleIndex];
      if (size <= 0 || offset + size > bytes.byteLength ||
          !mediaDataRanges.some((range) => offset >= range.payloadStart && offset + size <= range.payloadEnd)) {
        throw new Error("Depth sample range exceeds the MP4 file.");
      }
      samples.push({
        bytes: bytes.subarray(offset, offset + size),
        sampleDescriptionIndex: mapping.sampleDescriptionIndex
      });
      offset += size;
      sampleIndex += 1;
    }
    usedChunkCount += 1;
  }
  if (sampleIndex !== sizes.length || usedChunkCount !== chunks.length) {
    throw new Error("Depth sample table does not resolve every sample.");
  }
  return samples;
}

function readTrackID(bytes: Uint8Array, track: Box): number {
  const tkhd = requireUniqueChild(bytes, track, "tkhd");
  const version = bytes[tkhd.payloadStart];
  if (version !== 0 && version !== 1) throw new Error("Unsupported MP4 track header version.");
  return readU32(bytes, tkhd.payloadStart + (version === 1 ? 20 : 12));
}

function children(bytes: Uint8Array, parent: Box): Box[] {
  return parseBoxes(bytes, parent.payloadStart, parent.payloadEnd);
}

function requireChild(bytes: Uint8Array, parent: Box, type: string): Box {
  const child = children(bytes, parent).find((box) => box.type === type);
  if (!child) {
    throw new Error(`MP4 ${parent.type} box is missing ${type}.`);
  }
  return child;
}

function requireUniqueChild(bytes: Uint8Array, parent: Box, type: string): Box {
  const matches = children(bytes, parent).filter((box) => box.type === type);
  if (matches.length !== 1) throw new Error(`MP4 ${parent.type} box must contain exactly one ${type}.`);
  return matches[0];
}

function parseBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end) {
    if (boxes.length >= MAX_BOX_COUNT || offset + 8 > end) {
      throw new Error("Invalid or excessive BMFF box structure.");
    }
    const size32 = readU32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) throw new Error("Truncated BMFF large-size box.");
      size = Number(readU64(bytes, offset + 8));
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end) {
      throw new Error("Invalid BMFF box length.");
    }
    let payloadStart = offset + headerSize;
    let userType: string | undefined;
    if (type === "uuid") {
      if (payloadStart + 16 > offset + size) throw new Error("Truncated BMFF uuid box.");
      userType = ascii(bytes, payloadStart, 16);
      payloadStart += 16;
    }
    boxes.push({ type, start: offset, size, headerSize, payloadStart, payloadEnd: offset + size, userType });
    offset += size;
  }
  return boxes;
}

function requireUniqueUUIDBox(boxes: Box[], userType: string, label: string): Box {
  const matches = boxes.filter((box) => box.type === "uuid" && box.userType === userType);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} box.`);
  }
  return matches[0];
}

function requireRecord(records: Map<string, Uint8Array>, key: string, length?: number): Uint8Array {
  const value = records.get(key);
  if (!value || (length !== undefined && value.length !== length)) {
    throw new Error(`Missing or invalid TAP depth KLV record ${key}.`);
  }
  return value;
}

function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortJSON(value));
}

function sortJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJSON);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort(compareUTF8).map((key) => [key, sortJSON(value[key])]));
}

async function sha256Base64Url(bytes: Uint8Array): Promise<string> {
  const digestInput = bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice().buffer;
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.byteLength) throw new Error("Byte range exceeds input.");
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function asciiFourCC(bytes: Uint8Array, offset: number): string {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error("Truncated FourCC.");
  const values = bytes.subarray(offset, offset + 4);
  if (values.some((value) => value < 0x20 || value > 0x7e)) throw new Error("Non-ASCII FourCC.");
  return String.fromCharCode(...values);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error("Truncated UInt32.");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function readI32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error("Truncated Int32.");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, false);
}

function readU64(bytes: Uint8Array, offset: number): bigint {
  if (offset < 0 || offset + 8 > bytes.byteLength) throw new Error("Truncated UInt64.");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, false);
}

function readI64(bytes: Uint8Array, offset: number): bigint {
  if (offset < 0 || offset + 8 > bytes.byteLength) throw new Error("Truncated Int64.");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigInt64(0, false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function requireExactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error(`${label} has missing or unknown fields.`);
  }
}

function requireAllowedKeys(value: Record<string, unknown>, allowed: string[], required: string[], label: string): void {
  const actual = Object.keys(value);
  if (actual.some((key) => !allowed.includes(key)) || required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error(`${label} has missing or unknown fields.`);
  }
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
}

function requireFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
}

function decodeUTF8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
}

function hasOnlyUnicodeScalars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function compareUTF8(left: string, right: string): number {
  const leftBytes = utf8(left);
  const rightBytes = utf8(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index];
  }
  return leftBytes.length - rightBytes.length;
}

function getNestedString(value: unknown, ...keys: string[]): string | undefined {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}

function pass(id: string, label: string, detail: string): VerificationCheck {
  return { id, label, status: "pass", detail };
}

function check(id: string, label: string, matches: boolean, detail: string): VerificationCheck {
  return { id, label, status: matches ? "pass" : "fail", detail };
}

function float16ToNumber(value: number): number {
  const sign = (value & 0x8000) ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * Math.pow(2, -14) * (fraction / 1024);
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

function depthColor(value: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, value));
  const hue = (1 - clamped) * 240;
  const segment = hue / 60;
  const chroma = 0.92;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const rgb: [number, number, number] =
    segment < 1 ? [chroma, x, 0] :
    segment < 2 ? [x, chroma, 0] :
    segment < 3 ? [0, chroma, x] :
    segment < 4 ? [0, x, chroma] :
    segment < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return rgb.map((component) => Math.round((component + 0.04) * 255)) as [number, number, number];
}
