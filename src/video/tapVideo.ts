import { ZSTDDecoder } from "three/examples/jsm/libs/zstddec.module.js";
import type { LocalVerificationReport, VerificationCheck } from "../verifier/types";

const MANIFEST_UUID = "TAPCAMVIDEOMANF1";
const PROOF_UUID = "TAPCAMPROOFSLOT1";
const PROOF_MAGIC = "TAPCAM-PROOF-SLOT-V1";
const PROOF_PAYLOAD_BYTES = 60 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const MAX_BOX_COUNT = 4096;
const MAX_DEPTH_SAMPLES = 180 * 60;
const MAX_DEPTH_FRAME_BYTES = 32 * 1024 * 1024;

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
    version: number;
    mediaType: string;
  };
  payload: {
    id: string;
    packageID: string;
    capturedAt: string;
    container?: Record<string, unknown>;
    rgbTrack?: Record<string, unknown>;
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
  payload: Uint8Array;
}

export interface TapVideoInspection {
  manifest: TapVideoManifest;
  depthFrames: TapVideoDepthFrame[];
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

export async function verifyTapVideoLocally(bytes: Uint8Array): Promise<LocalVerificationReport> {
  const checks: VerificationCheck[] = [];
  try {
    if (bytes.byteLength > MAX_VIDEO_BYTES) {
      throw new Error("TAP Video exceeds the 512 MiB browser verification limit.");
    }
    const topLevel = parseBoxes(bytes, 0, bytes.byteLength);
    const manifestBox = requireUniqueUUIDBox(topLevel, MANIFEST_UUID, "TAP video manifest");
    const proofBox = requireUniqueUUIDBox(topLevel, PROOF_UUID, "TAP proof slot");
    if (manifestBox.payloadEnd - manifestBox.payloadStart > MAX_MANIFEST_BYTES) {
      throw new Error("TAP video manifest exceeds the bounded payload limit.");
    }
    const manifest = parseManifest(bytes.subarray(manifestBox.payloadStart, manifestBox.payloadEnd));
    checks.push(pass("video-container", "TAP Video container", "Found one v2 video manifest and one fixed proof slot."));

    const proof = parseProofEnvelope(bytes, proofBox);
    const proofValue = parseProofValue(proof);
    checks.push(pass("video-proof", "TAP Video proof envelope", "The App Attest proof envelope and fixed-slot padding are structurally valid."));

    const recomputedDigest = await buildContentDigest(bytes, proofBox, manifest);
    const suppliedDigest = proofValue.contentDigest;
    const digestMatches = canonicalJSON(suppliedDigest) === canonicalJSON(recomputedDigest);
    checks.push(check(
      "video-content-binding",
      "TAP Video v4 content binding",
      digestMatches,
      digestMatches
        ? "MP4 bytes outside the proof slot and canonical manifest payload match the signed v4 binding."
        : "Signed TAP Video content binding does not match the supplied MP4 bytes."
    ));

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
      proof.createdAt === manifest.payload.capturedAt &&
      keyMatches &&
      typeof proofValue.assertionObject === "string" &&
      proofValue.assertionObject.length > 0;
    checks.push(check(
      "video-proof-fields",
      "TAP Video proof fields",
      proofFieldsValid,
      proofFieldsValid ? "Proof identity, timestamp, and assertion fields are consistent." : "Proof identity, timestamp, or assertion fields are inconsistent."
    ));

    const serverRequest = proofFieldsValid && signingBindingMatches && digestMatches
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
        ? "TAP Video hard binding passed locally; timed depth playback is available as downstream analysis."
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
    const parseCheck: VerificationCheck = {
      id: "parse",
      label: "TAP Video parse",
      status: "fail",
      detail: message
    };
    return {
      status: "invalid",
      summary: message,
      mediaKind: "video",
      verificationScope: "fullVideo",
      captureId: null,
      capturedAt: null,
      manifest: { containerFormat: "mp4" },
      serverRequest: null,
      checks: [parseCheck]
    };
  }
}

export function inspectTapVideoDepth(bytes: Uint8Array): TapVideoInspection {
  const topLevel = parseBoxes(bytes, 0, bytes.byteLength);
  const manifestBox = requireUniqueUUIDBox(topLevel, MANIFEST_UUID, "TAP video manifest");
  const manifest = parseManifest(bytes.subarray(manifestBox.payloadStart, manifestBox.payloadEnd));
  const coverage = manifest.payload.depthCoverage;
  if (!coverage.format || coverage.sampleCount === 0 || coverage.trackID === null) {
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
  if (samples.length !== coverage.sampleCount) {
    throw new Error(`Depth sample count mismatch: manifest ${coverage.sampleCount}, MP4 ${samples.length}.`);
  }
  const depthFrames = samples.map((sample) => decodeMebxDepthSample(sample));
  return { manifest, depthFrames };
}

let zstdDecoderPromise: Promise<ZSTDDecoder> | null = null;

export async function decodeTapDepthFrame(frame: TapVideoDepthFrame): Promise<Uint8Array> {
  if (frame.uncompressedByteCount > MAX_DEPTH_FRAME_BYTES) {
    throw new Error("Depth frame exceeds the 32 MiB decoded limit.");
  }
  let decoded: Uint8Array;
  if (frame.compression === "raw") {
    decoded = frame.payload;
  } else if (frame.compression === "zstd1") {
    const decoder = await getZstdDecoder();
    decoded = decoder.decode(frame.payload, frame.uncompressedByteCount);
  } else {
    throw new Error("LZFSE TAP depth frames are not supported by this browser build.");
  }
  if (decoded.byteLength !== frame.uncompressedByteCount) {
    throw new Error("Decoded depth frame byte count does not match ULEN.");
  }
  return decoded;
}

export function renderTapDepthFrame(
  bytes: Uint8Array,
  format: TapVideoDepthFormat,
  canvas: HTMLCanvasElement
): { min: number; max: number } {
  const { width, height, bytesPerSample, packedRowStride, pixelFormat } = format;
  if (width <= 0 || height <= 0 || width * height > 16_777_216) {
    throw new Error("Invalid TAP depth frame dimensions.");
  }
  if ((bytesPerSample !== 2 && bytesPerSample !== 4) || packedRowStride < width * bytesPerSample) {
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
  const image = new ImageData(width, height);
  const isDisparity = pixelFormat.endsWith("dis") || format.kind === "disparity";
  for (let index = 0; index < values.length; index += 1) {
    const raw = Number.isFinite(values[index]) ? (values[index] - min) / span : 0;
    const normalized = isDisparity ? raw : 1 - raw;
    const [r, g, b] = depthColor(normalized);
    const offset = index * 4;
    image.data[offset] = r;
    image.data[offset + 1] = g;
    image.data[offset + 2] = b;
    image.data[offset + 3] = 255;
  }
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Depth canvas 2D context is unavailable.");
  }
  context.putImageData(image, 0, 0);
  return { min, max };
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

function parseManifest(bytes: Uint8Array): TapVideoManifest {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(value) || !isRecord(value.schema) || !isRecord(value.payload)) {
    throw new Error("Invalid TAP Video manifest JSON.");
  }
  if (
    value.schema.id !== "urn:tapnap:tapcam:video-manifest:v2" ||
    value.schema.version !== 2 ||
    value.schema.mediaType !== "application/vnd.tapnap.video-manifest+json;version=2" ||
    !Array.isArray(value.proofs) || value.proofs.length !== 0
  ) {
    throw new Error("Unsupported TAP Video manifest schema or non-empty manifest proofs.");
  }
  const payload = value.payload;
  if (
    typeof payload.id !== "string" || !payload.id ||
    typeof payload.packageID !== "string" ||
    typeof payload.capturedAt !== "string" ||
    !isRecord(payload.depthCoverage) ||
    typeof payload.depthCoverage.sampleCount !== "number"
  ) {
    throw new Error("TAP Video manifest is missing required identity or depth fields.");
  }
  return value as unknown as TapVideoManifest;
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
  const value: unknown = JSON.parse(new TextDecoder().decode(payload.subarray(32, 32 + envelopeLength)));
  if (!isRecord(value)) {
    throw new Error("Invalid TAP proof envelope.");
  }
  return value;
}

function parseProofValue(proof: ProofEnvelope): ProofValue {
  if (typeof proof.value !== "string" || !proof.value) {
    throw new Error("TAP proof value is missing.");
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(proof.value)));
  if (!isRecord(value)) {
    throw new Error("Invalid TAP proof value.");
  }
  return value;
}

async function buildContentDigest(bytes: Uint8Array, proofBox: Box, manifest: TapVideoManifest): Promise<VideoContentDigest> {
  const signedBytes = new Uint8Array(bytes.byteLength - proofBox.size);
  signedBytes.set(bytes.subarray(0, proofBox.start), 0);
  signedBytes.set(bytes.subarray(proofBox.start + proofBox.size), proofBox.start);
  const assetHash = await sha256Base64Url(signedBytes);
  const payloadBytes = utf8(canonicalJSON(manifest.payload));
  const metadataHash = await sha256Base64Url(payloadBytes);
  const coverage = manifest.payload.depthCoverage;
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
    depthResource: {
      binding: coverage.sampleCount > 0 ? "covered-by-assetHash" : "coverage-recorded-in-manifest",
      interpretation: "not-part-of-base-signature",
      platformPresenceCheck: "TAPVideoManifest.depthCoverage",
      presence: coverage.sampleCount > 0 ? "captured" : "no-samples"
    },
    manifestSchemaID: manifest.schema.id,
    metadataHash: {
      algorithm: "SHA-256",
      kind: "canonical-json",
      mediaType: `application/vnd.tapnap.video-manifest.payload+json;version=${manifest.schema.version}`,
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
    schemaID: "urn:tapnap:tapcam:content-binding:v4"
  };
}

function decodeMebxDepthSample(sample: Uint8Array): TapVideoDepthFrame {
  if (sample.byteLength < 8 || readU32(sample, 0) !== sample.byteLength || readU32(sample, 4) === 0) {
    throw new Error("Invalid mebx timed-metadata sample wrapper.");
  }
  const records = new Map<string, Uint8Array>();
  let offset = 8;
  while (offset < sample.byteLength) {
    if (offset + 8 > sample.byteLength || records.size >= 32) {
      throw new Error("Truncated or oversized TAP depth KLV record set.");
    }
    const key = ascii(sample, offset, 4);
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
  if (readU32(version, 0) !== 2) {
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
  return {
    frameIndex: readU32(frame, 0),
    presentationTimeSeconds: Number(readI64(pts, 0)) / timescale,
    compression,
    uncompressedByteCount: readU32(uncompressed, 0),
    calibrationIndex: calibration ? readU32(requireRecord(records, "CALI", 4), 0) : null,
    payload
  };
}

function readTrackSamples(bytes: Uint8Array, track: Box): Uint8Array[] {
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
  const sizes: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    sizes.push(sampleSize || readU32(bytes, stsz.payloadStart + 12 + index * 4));
  }
  const stscCount = readU32(bytes, stsc.payloadStart + 4);
  const mappings: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
  for (let index = 0; index < stscCount; index += 1) {
    const offset = stsc.payloadStart + 8 + index * 12;
    mappings.push({ firstChunk: readU32(bytes, offset), samplesPerChunk: readU32(bytes, offset + 4) });
  }
  const chunkCount = readU32(bytes, stco.payloadStart + 4);
  const chunks: number[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const offset = stco.payloadStart + 8 + index * (stco.type === "co64" ? 8 : 4);
    const value = stco.type === "co64" ? Number(readU64(bytes, offset)) : readU32(bytes, offset);
    chunks.push(value);
  }
  const samples: Uint8Array[] = [];
  let sampleIndex = 0;
  let mappingIndex = 0;
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
    for (let count = 0; count < mapping.samplesPerChunk && sampleIndex < sizes.length; count += 1) {
      const size = sizes[sampleIndex];
      if (size <= 0 || offset + size > bytes.byteLength) {
        throw new Error("Depth sample range exceeds the MP4 file.");
      }
      samples.push(bytes.subarray(offset, offset + size));
      offset += size;
      sampleIndex += 1;
    }
  }
  if (sampleIndex !== sizes.length) {
    throw new Error("Depth sample table does not resolve every sample.");
  }
  return samples;
}

function readTrackID(bytes: Uint8Array, track: Box): number {
  const tkhd = requireChild(bytes, track, "tkhd");
  const version = bytes[tkhd.payloadStart];
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
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJSON(value[key])]));
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
