import { ZSTDDecoder } from "three/examples/jsm/libs/zstddec.module.js";
import type { LocalVerificationReport, VerificationCheck } from "../verifier/types";
import { decodeLzfseFrame } from "../wasm/tapcamVerifier";

const MANIFEST_UUID = "TAPCAMVIDEOMANF1";
const PROOF_UUID = "TAPCAMPROOFSLOT1";
const PROOF_MAGIC = "TAPCAM-PROOF-SLOT-V1";
const PROOF_PAYLOAD_BYTES = 60 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const MAX_BOX_COUNT = 4096;
const MAX_DEPTH_SAMPLES = 180 * 60;
const MAX_DEPTH_FRAME_BYTES = 32 * 1024 * 1024;
const MAX_KLV_FRAME_BYTES = MAX_DEPTH_FRAME_BYTES + 4096;
const TAP_DEPTH_METADATA_KEY = "com.tapnap.depth.klv";
const VIDEO_MANIFEST_ID = "urn:tapnap:tapcam:video-manifest:v1";
const VIDEO_MANIFEST_MEDIA_TYPE = "application/vnd.tapnap.video-manifest+json;version=1";

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

export interface OrientedTapDepthPixels {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  orientation: TapVideoDisplayOrientation;
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

interface CanonicalJSONDocument {
  value: unknown;
  memberRanges: Map<string, { start: number; end: number }>;
  numberTokens: Map<string, string>;
}

interface TrackSample {
  bytes: Uint8Array;
  timestamp: bigint;
  duration: number;
  sampleDescriptionIndex: number;
}

interface TrackInfo {
  box: Box;
  id: number;
  handler: string;
  timeScale: number;
  duration: bigint;
  codecs: string[];
  sampleCount: number;
  width: number | null;
  height: number | null;
  sampleRate: number | null;
  channelCount: number | null;
}

interface ParsedDepthFrame extends TapVideoDepthFrame {
  ptsValue: bigint;
  ptsTimescale: number;
  localKeyID: number;
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
    const manifestDocument = parseManifest(bytes.subarray(manifestBox.payloadStart, manifestBox.payloadEnd));
    const manifest = manifestDocument.manifest;
    checks.push(pass("video-container", "TAP Video container", "Found one v1 video manifest and one fixed proof slot."));

    const proof = parseProofEnvelope(bytes, proofBox);
    const proofValue = parseProofValue(proof);
    checks.push(pass("video-proof", "TAP Video proof envelope", "The App Attest proof envelope and fixed-slot padding are structurally valid."));

    const recomputedDigest = await buildContentDigest(bytes, proofBox, manifest, manifestDocument.payloadBytes);
    const suppliedDigest = proofValue.contentDigest;
    const digestMatches = canonicalJSON(suppliedDigest) === canonicalJSON(recomputedDigest);
    checks.push(check(
      "video-content-binding",
      "TAP Video v1 content binding",
      digestMatches,
      digestMatches
        ? "MP4 bytes outside the proof slot and canonical manifest payload match the signed v1 binding."
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

    const localBindingMatches = proofFieldsValid && signingBindingMatches && digestMatches;
    if (localBindingMatches) {
      await validateVideoSemantics(bytes, topLevel, manifest);
      checks.push(pass(
        "video-semantics",
        "TAP Video v1 manifest and timed metadata",
        "Manifest groups, finalized MP4 track facts, and every timed-depth sample satisfy the v1 relationships."
      ));
    } else {
      checks.push({
        id: "video-semantics",
        label: "TAP Video v1 manifest and timed metadata",
        status: "warning",
        detail: "Bounded MP4/KLV semantic inspection was not run because the local artifact-binding gate failed."
      });
    }

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
  const manifest = parseManifest(bytes.subarray(manifestBox.payloadStart, manifestBox.payloadEnd)).manifest;
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
  if (frame.uncompressedByteCount > MAX_DEPTH_FRAME_BYTES) {
    throw new Error("Depth frame exceeds the 32 MiB decoded limit.");
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
  transform?: string | null
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
  const oriented = orientTapDepthPixels(rgba, width, height, transform);
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
  const text = decodeUTF8(bytes, "TAP Video manifest");
  const document = parseCanonicalJSON(text, "TAP Video manifest");
  const value = document.value;
  if (!isRecord(value) || !isRecord(value.schema) || !isRecord(value.payload)) {
    throw new Error("Invalid TAP Video manifest JSON.");
  }
  requireExactKeys(value, ["payload", "proofs", "schema"], "TAP Video manifest");
  requireExactKeys(value.schema, ["id", "mediaType", "version"], "TAP Video schema");
  requireInteger(value.schema.version, document.numberTokens, ["schema", "version"], "schema.version");
  if (
    value.schema.id !== VIDEO_MANIFEST_ID ||
    value.schema.version !== 1 ||
    value.schema.mediaType !== VIDEO_MANIFEST_MEDIA_TYPE ||
    !Array.isArray(value.proofs) || value.proofs.length !== 0
  ) {
    throw new Error("Unsupported TAP Video manifest schema or non-empty manifest proofs.");
  }
  validateManifestPayload(value.payload, document.numberTokens);
  const range = document.memberRanges.get("payload");
  if (!range) {
    throw new Error("TAP Video manifest payload raw bytes are unavailable.");
  }
  return {
    manifest: value as unknown as TapVideoManifest,
    payloadBytes: utf8(text.slice(range.start, range.end))
  };
}

function parseCanonicalJSON(text: string, label: string): CanonicalJSONDocument {
  let offset = 0;
  const memberRanges = new Map<string, { start: number; end: number }>();
  const numberTokens = new Map<string, string>();

  const parseValue = (path: string[]): unknown => {
    const character = text[offset];
    if (character === "{") return parseObject(path);
    if (character === "[") return parseArray(path);
    if (character === '"') return parseString();
    if (text.startsWith("true", offset)) { offset += 4; return true; }
    if (text.startsWith("false", offset)) { offset += 5; return false; }
    if (text.startsWith("null", offset)) { offset += 4; return null; }
    const match = text.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) throw new Error(`${label} is not canonical JSON.`);
    const token = match[0];
    const number = Number(token);
    if (!Number.isFinite(number)) throw new Error(`${label} contains a non-finite JSON number.`);
    numberTokens.set(path.join("\u0000"), token);
    offset += token.length;
    return number;
  };

  const parseObject = (path: string[]): Record<string, unknown> => {
    offset += 1;
    const result: Record<string, unknown> = {};
    let previousKey: string | null = null;
    if (text[offset] === "}") { offset += 1; return result; }
    while (true) {
      if (text[offset] !== '"') throw new Error(`${label} contains whitespace or an invalid object member.`);
      const key = parseString();
      if (previousKey !== null && compareUTF8(previousKey, key) >= 0) {
        throw new Error(`${label} object member names are duplicated or not sorted by UTF-8 bytes.`);
      }
      previousKey = key;
      if (text[offset] !== ":") throw new Error(`${label} contains whitespace or a missing colon.`);
      offset += 1;
      const valueStart = offset;
      result[key] = parseValue([...path, key]);
      if (path.length === 0) memberRanges.set(key, { start: valueStart, end: offset });
      if (text[offset] === "}") { offset += 1; return result; }
      if (text[offset] !== ",") throw new Error(`${label} contains whitespace or an invalid object separator.`);
      offset += 1;
    }
  };

  const parseArray = (path: string[]): unknown[] => {
    offset += 1;
    const result: unknown[] = [];
    if (text[offset] === "]") { offset += 1; return result; }
    while (true) {
      result.push(parseValue([...path, String(result.length)]));
      if (text[offset] === "]") { offset += 1; return result; }
      if (text[offset] !== ",") throw new Error(`${label} contains whitespace or an invalid array separator.`);
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
        if (!hasOnlyUnicodeScalars(value) || JSON.stringify(value) !== token) {
          throw new Error(`${label} contains a non-canonical JSON string.`);
        }
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
  if (offset !== text.length) throw new Error(`${label} contains trailing or non-canonical bytes.`);
  return { value, memberRanges, numberTokens };
}

function validateManifestPayload(payload: Record<string, unknown>, tokens: Map<string, string>): void {
  requireExactKeys(payload, [
    "audioTrack", "capturedAt", "container", "depthCoverage", "id", "packageID", "rgbTrack",
    "selectedCameraPlan", "software", "spatialRegistration", "stop", "synchronization"
  ], "TAP Video payload");
  requireNonEmptyString(payload.id, "payload.id");
  requireString(payload.packageID, "payload.packageID");
  requireTimestamp(payload.capturedAt, "payload.capturedAt");

  const camera = requireObject(payload.selectedCameraPlan, "payload.selectedCameraPlan");
  requireAllowedKeys(camera, [
    "depthCapable", "deviceType", "deviceUniqueID", "localizedName", "position",
    "requestedFocalLengthLabel", "resolvedFocalLengthLabel", "resolvedZoomFactor"
  ], ["depthCapable", "position"], "selectedCameraPlan");
  requireEnum(camera.position, ["front", "back", "unspecified", "unknown"], "selectedCameraPlan.position");
  requireBoolean(camera.depthCapable, "selectedCameraPlan.depthCapable");
  for (const key of ["deviceType", "deviceUniqueID", "localizedName", "requestedFocalLengthLabel", "resolvedFocalLengthLabel"]) {
    if (camera[key] !== undefined && camera[key] !== null) requireString(camera[key], `selectedCameraPlan.${key}`);
  }
  if (camera.resolvedZoomFactor !== undefined && camera.resolvedZoomFactor !== null) {
    requireFiniteNumber(camera.resolvedZoomFactor, "selectedCameraPlan.resolvedZoomFactor");
  }

  const container = requireObject(payload.container, "payload.container");
  requireExactKeys(container, ["durationSeconds", "fileType", "mediaType", "timeScale", "trackCount"], "container");
  if (container.fileType !== "mp4" || container.mediaType !== "video/mp4") throw new Error("Invalid TAP Video container identity.");
  requireNonNegativeNumber(container.durationSeconds, "container.durationSeconds");
  requirePositiveInteger(container.timeScale, tokens, ["payload", "container", "timeScale"], "container.timeScale");
  requireNonNegativeInteger(container.trackCount, tokens, ["payload", "container", "trackCount"], "container.trackCount");

  const rgb = requireObject(payload.rgbTrack, "payload.rgbTrack");
  requireAllowedKeys(rgb, ["codec", "durationSeconds", "frameCount", "height", "nominalFrameRate", "timeScale", "trackID", "transform", "width"],
    ["codec", "durationSeconds", "height", "timeScale", "trackID", "width"], "rgbTrack");
  requirePositiveInteger(rgb.trackID, tokens, ["payload", "rgbTrack", "trackID"], "rgbTrack.trackID");
  requireNonEmptyString(rgb.codec, "rgbTrack.codec");
  requirePositiveInteger(rgb.width, tokens, ["payload", "rgbTrack", "width"], "rgbTrack.width");
  requirePositiveInteger(rgb.height, tokens, ["payload", "rgbTrack", "height"], "rgbTrack.height");
  requireNonNegativeNumber(rgb.durationSeconds, "rgbTrack.durationSeconds");
  requirePositiveInteger(rgb.timeScale, tokens, ["payload", "rgbTrack", "timeScale"], "rgbTrack.timeScale");
  if (rgb.nominalFrameRate !== undefined && rgb.nominalFrameRate !== null) requireFiniteNumber(rgb.nominalFrameRate, "rgbTrack.nominalFrameRate");
  if (rgb.frameCount !== undefined && rgb.frameCount !== null) {
    requireNonNegativeInteger(rgb.frameCount, tokens, ["payload", "rgbTrack", "frameCount"], "rgbTrack.frameCount");
  }
  if (rgb.transform !== undefined && rgb.transform !== null) {
    requireString(rgb.transform, "rgbTrack.transform");
    tapVideoDisplayOrientation(rgb.transform as string);
  }

  validateAudioTrack(requireObject(payload.audioTrack, "payload.audioTrack"), tokens);
  const coverage = requireObject(payload.depthCoverage, "payload.depthCoverage");
  validateDepthCoverage(coverage, tokens);
  if ((coverage.sampleCount as number) > 0 && camera.depthCapable !== true) throw new Error("Stored TAP Video depth requires a depth-capable camera plan.");
  const registration = requireObject(payload.spatialRegistration, "payload.spatialRegistration");
  validateSpatialRegistration(registration, coverage, tokens);
  validateRegistrationGeometry(registration, rgb, coverage);
  validateSynchronization(requireObject(payload.synchronization, "payload.synchronization"), coverage);

  const stop = requireObject(payload.stop, "payload.stop");
  requireExactKeys(stop, ["reason", "recordedDurationSeconds"], "stop");
  requireEnum(stop.reason, ["userStop", "durationLimit", "thermalPressure", "systemPressure", "appLifecycle", "storageFailure", "captureFailure"], "stop.reason");
  requireNonNegativeNumber(stop.recordedDurationSeconds, "stop.recordedDurationSeconds");
  if (!numbersEqual(stop.recordedDurationSeconds as number, container.durationSeconds as number)) {
    throw new Error("Recorded duration does not match the finalized container duration.");
  }

  const software = requireObject(payload.software, "payload.software");
  requireExactKeys(software, ["appIdentifier", "appVersion", "buildNumber", "schemaWriter"], "software");
  requireString(software.appIdentifier, "software.appIdentifier");
  requireString(software.appVersion, "software.appVersion");
  requireString(software.buildNumber, "software.buildNumber");
  requireNonEmptyString(software.schemaWriter, "software.schemaWriter");
}

function validateAudioTrack(audio: Record<string, unknown>, tokens: Map<string, string>): void {
  requireExactKeys(audio, ["channelCount", "codec", "durationSeconds", "sampleRate", "status", "timeScale", "trackID"], "audioTrack");
  requireEnum(audio.status, ["captured", "notCaptured", "unavailable"], "audioTrack.status");
  const factKeys = ["trackID", "codec", "durationSeconds", "timeScale", "sampleRate", "channelCount"];
  if (audio.status !== "captured") {
    if (factKeys.some((key) => audio[key] !== null)) throw new Error("A non-captured audio track must serialize null track facts.");
    return;
  }
  requirePositiveInteger(audio.trackID, tokens, ["payload", "audioTrack", "trackID"], "audioTrack.trackID");
  requireNonEmptyString(audio.codec, "audioTrack.codec");
  requireNonNegativeNumber(audio.durationSeconds, "audioTrack.durationSeconds");
  requirePositiveInteger(audio.timeScale, tokens, ["payload", "audioTrack", "timeScale"], "audioTrack.timeScale");
  if (audio.sampleRate !== null) requireFiniteNumber(audio.sampleRate, "audioTrack.sampleRate");
  if (audio.channelCount !== null) {
    requirePositiveInteger(audio.channelCount, tokens, ["payload", "audioTrack", "channelCount"], "audioTrack.channelCount");
  }
}

function validateDepthCoverage(coverage: Record<string, unknown>, tokens: Map<string, string>): void {
  requireExactKeys(coverage, [
    "deliveredSampleCount", "encodingDropCount", "format", "gapCount", "gaps", "metadataDropCount",
    "outputDropCount", "sampleCount", "trackCodec", "trackDurationSeconds", "trackID", "trackTimeScale"
  ], "depthCoverage");
  for (const key of ["sampleCount", "deliveredSampleCount", "outputDropCount", "encodingDropCount", "metadataDropCount", "gapCount"]) {
    requireNonNegativeInteger(coverage[key], tokens, ["payload", "depthCoverage", key], `depthCoverage.${key}`);
  }
  if ((coverage.deliveredSampleCount as number) < (coverage.sampleCount as number)) {
    throw new Error("Delivered depth sample count is below the stored sample count.");
  }
  if (!Array.isArray(coverage.gaps) || coverage.gaps.length > 1024 || coverage.gapCount !== coverage.gaps.length) {
    throw new Error("Invalid TAP Video depth gap table or gap count.");
  }
  coverage.gaps.forEach((gap, index) => validateDepthGap(gap, index, tokens));
  if (coverage.sampleCount === 0) {
    if (coverage.trackID !== null || coverage.trackCodec !== null || coverage.trackDurationSeconds !== null ||
        coverage.trackTimeScale !== null || coverage.format !== null) {
      throw new Error("Zero-depth TAP Video must use canonical null depth-track facts.");
    }
    return;
  }
  requirePositiveInteger(coverage.trackID, tokens, ["payload", "depthCoverage", "trackID"], "depthCoverage.trackID");
  if (coverage.trackCodec !== "mebx") throw new Error("Stored TAP Video depth requires the mebx track codec.");
  requireNonNegativeNumber(coverage.trackDurationSeconds, "depthCoverage.trackDurationSeconds");
  requirePositiveInteger(coverage.trackTimeScale, tokens, ["payload", "depthCoverage", "trackTimeScale"], "depthCoverage.trackTimeScale");
  validateDepthFormat(requireObject(coverage.format, "depthCoverage.format"), tokens);
}

function validateDepthFormat(format: Record<string, unknown>, tokens: Map<string, string>): void {
  requireAllowedKeys(format, [
    "byteOrder", "bytesPerSample", "compressionPolicy", "height", "kind", "packedRowStride",
    "pixelFormat", "sourceRowStride", "uncompressedFrameByteCount", "width"
  ], ["byteOrder", "bytesPerSample", "compressionPolicy", "height", "kind", "packedRowStride", "pixelFormat", "uncompressedFrameByteCount", "width"], "depthCoverage.format");
  requireEnum(format.kind, ["depth", "disparity"], "depthCoverage.format.kind");
  requireEnum(format.pixelFormat, ["hdep", "fdep", "hdis", "fdis"], "depthCoverage.format.pixelFormat");
  requirePositiveInteger(format.width, tokens, ["payload", "depthCoverage", "format", "width"], "depthCoverage.format.width");
  requirePositiveInteger(format.height, tokens, ["payload", "depthCoverage", "format", "height"], "depthCoverage.format.height");
  requirePositiveInteger(format.packedRowStride, tokens, ["payload", "depthCoverage", "format", "packedRowStride"], "depthCoverage.format.packedRowStride");
  requirePositiveInteger(format.bytesPerSample, tokens, ["payload", "depthCoverage", "format", "bytesPerSample"], "depthCoverage.format.bytesPerSample");
  requirePositiveInteger(format.uncompressedFrameByteCount, tokens, ["payload", "depthCoverage", "format", "uncompressedFrameByteCount"], "depthCoverage.format.uncompressedFrameByteCount");
  if (format.sourceRowStride !== undefined && format.sourceRowStride !== null) {
    requirePositiveInteger(format.sourceRowStride, tokens, ["payload", "depthCoverage", "format", "sourceRowStride"], "depthCoverage.format.sourceRowStride");
  }
  if (format.byteOrder !== "little-endian") throw new Error("Unsupported TAP Video depth byte order.");
  requireEnum(format.compressionPolicy, ["per-frame:zstd1|raw", "per-frame:lzfse|raw", "per-frame:raw"], "depthCoverage.format.compressionPolicy");
  const expected = format.pixelFormat === "hdep" ? ["depth", 2] :
    format.pixelFormat === "fdep" ? ["depth", 4] :
    format.pixelFormat === "hdis" ? ["disparity", 2] : ["disparity", 4];
  if (format.kind !== expected[0] || format.bytesPerSample !== expected[1]) throw new Error("Invalid TAP Video depth kind, pixel format, and sample-size combination.");
  const rowBytes = (format.width as number) * (format.bytesPerSample as number);
  if (!Number.isSafeInteger(rowBytes) || format.packedRowStride !== rowBytes ||
      (format.sourceRowStride !== undefined && format.sourceRowStride !== null && (format.sourceRowStride as number) < rowBytes)) {
    throw new Error("Invalid TAP Video packed/source row stride.");
  }
  const frameBytes = rowBytes * (format.height as number);
  if (!Number.isSafeInteger(frameBytes) || format.uncompressedFrameByteCount !== frameBytes || frameBytes > MAX_DEPTH_FRAME_BYTES) {
    throw new Error("Invalid TAP Video uncompressed frame byte count.");
  }
}

function validateDepthGap(value: unknown, index: number, tokens: Map<string, string>): void {
  const gap = requireObject(value, `depthCoverage.gaps[${index}]`);
  requireAllowedKeys(gap, ["endPTS", "nearestEndRGBFrame", "nearestStartRGBFrame", "reason", "startPTS"], ["endPTS", "reason", "startPTS"], `depthCoverage.gaps[${index}]`);
  requireEnum(gap.reason, ["outputDrop", "encodingFailure", "metadataBackpressure", "silentCadence", "boundedAggregation"], `depthCoverage.gaps[${index}].reason`);
  const start = validateMediaTime(gap.startPTS, ["payload", "depthCoverage", "gaps", String(index), "startPTS"], tokens);
  const end = validateMediaTime(gap.endPTS, ["payload", "depthCoverage", "gaps", String(index), "endPTS"], tokens);
  if (end.value * BigInt(start.timescale) < start.value * BigInt(end.timescale)) throw new Error("Depth gap ends before it starts.");
  for (const key of ["nearestStartRGBFrame", "nearestEndRGBFrame"]) {
    if (gap[key] !== undefined && gap[key] !== null) {
      requireNonNegativeInteger(gap[key], tokens, ["payload", "depthCoverage", "gaps", String(index), key], `depthCoverage.gaps[${index}].${key}`);
    }
  }
}

function validateMediaTime(value: unknown, path: string[], tokens: Map<string, string>): { value: bigint; timescale: number } {
  const time = requireObject(value, path.join("."));
  requireExactKeys(time, ["timescale", "value"], path.join("."));
  const valueToken = requireIntegerToken(tokens, [...path, "value"], `${path.join(".")}.value`);
  requirePositiveInteger(time.timescale, tokens, [...path, "timescale"], `${path.join(".")}.timescale`);
  return { value: BigInt(valueToken), timescale: time.timescale as number };
}

function validateSpatialRegistration(registration: Record<string, unknown>, coverage: Record<string, unknown>, tokens: Map<string, string>): void {
  requireAllowedKeys(registration, [
    "calibrationCoverage", "calibrationTable", "depthReferenceDimensions", "descriptor", "mapping",
    "recordedTransform", "rgbCleanAperture", "rgbReferenceDimensions", "status"
  ], ["calibrationCoverage", "calibrationTable", "mapping", "status"], "spatialRegistration");
  requireEnum(registration.status, ["registered", "unavailable"], "spatialRegistration.status");
  requireString(registration.mapping, "spatialRegistration.mapping");
  for (const key of ["rgbReferenceDimensions", "depthReferenceDimensions"]) {
    if (registration[key] !== undefined && registration[key] !== null) validateDimensions(registration[key], `spatialRegistration.${key}`);
  }
  if (registration.rgbCleanAperture !== undefined && registration.rgbCleanAperture !== null) validateRect(registration.rgbCleanAperture, "spatialRegistration.rgbCleanAperture");
  if (registration.recordedTransform !== undefined && registration.recordedTransform !== null) {
    requireEnum(registration.recordedTransform, registrationTransforms(), "spatialRegistration.recordedTransform");
  }
  if (!Array.isArray(registration.calibrationTable) || registration.calibrationTable.length > 16) throw new Error("Invalid TAP Video calibration table.");
  registration.calibrationTable.forEach((item, index) => validateCalibration(item, index));
  const calibrationCoverage = requireObject(registration.calibrationCoverage, "spatialRegistration.calibrationCoverage");
  requireExactKeys(calibrationCoverage, ["indexedSampleCount", "missingCalibrationSampleCount", "overflowUnindexedSampleCount", "tableOverflowed"], "spatialRegistration.calibrationCoverage");
  for (const key of ["indexedSampleCount", "missingCalibrationSampleCount", "overflowUnindexedSampleCount"]) {
    requireNonNegativeInteger(calibrationCoverage[key], tokens, ["payload", "spatialRegistration", "calibrationCoverage", key], `calibrationCoverage.${key}`);
  }
  requireBoolean(calibrationCoverage.tableOverflowed, "calibrationCoverage.tableOverflowed");
  const countSum = (calibrationCoverage.indexedSampleCount as number) + (calibrationCoverage.missingCalibrationSampleCount as number) + (calibrationCoverage.overflowUnindexedSampleCount as number);
  if (countSum !== coverage.sampleCount || ((calibrationCoverage.indexedSampleCount as number) > 0 && registration.calibrationTable.length === 0) ||
      ((calibrationCoverage.overflowUnindexedSampleCount as number) > 0 && calibrationCoverage.tableOverflowed !== true) ||
      (calibrationCoverage.tableOverflowed === true && registration.calibrationTable.length !== 16)) {
    throw new Error("Invalid TAP Video calibration coverage relationship.");
  }
  if (registration.status === "registered") {
    if (registration.mapping !== "urn:tapnap:tapcam:video-depth-registration:avdepthdata-yuv-warp:v1") throw new Error("Invalid registered TAP Video mapping.");
    validateRegistrationDescriptor(requireObject(registration.descriptor, "spatialRegistration.descriptor"), tokens);
  } else {
    if (registration.descriptor !== undefined && registration.descriptor !== null) throw new Error("Unavailable TAP Video registration must not include a descriptor.");
    if (registration.mapping !== "unavailable" && !(registration.mapping as string).startsWith("avdepthdata-registration-prerequisites-unavailable:")) {
      throw new Error("Invalid unavailable TAP Video registration reason.");
    }
  }
}

function validateRegistrationGeometry(registration: Record<string, unknown>, rgb: Record<string, unknown>, coverage: Record<string, unknown>): void {
  if (registration.status !== "registered") return;
  const descriptor = registration.descriptor as Record<string, unknown>;
  const format = coverage.format as Record<string, unknown>;
  const encoded = descriptor.encodedRGBCodedDimensions as Record<string, unknown>;
  const aligned = descriptor.alignedRGBCodedDimensions as Record<string, unknown>;
  const depth = descriptor.depthDimensions as Record<string, unknown>;
  const transform = rgb.transform === undefined || rgb.transform === null || rgb.transform === "identity" ? "rotation:0" : rgb.transform as string;
  const swapsAxes = transform === "rotation:90" || transform === "rotation:90;mirrored" ||
    transform === "rotation:270" || transform === "rotation:270;mirrored";
  const expectedConnection = transform.includes(";mirrored") ? transform : `${transform};not-mirrored`;
  if (encoded.width !== rgb.width || encoded.height !== rgb.height ||
      aligned.width !== (swapsAxes ? rgb.height : rgb.width) || aligned.height !== (swapsAxes ? rgb.width : rgb.height) ||
      depth.width !== format.width || depth.height !== format.height || descriptor.connectionTransform !== expectedConnection) {
    throw new Error("TAP Video registration dimensions or connection transform do not match the signed track formats.");
  }
  if (registration.rgbReferenceDimensions !== undefined && registration.rgbReferenceDimensions !== null &&
      canonicalJSON(registration.rgbReferenceDimensions) !== canonicalJSON(aligned)) {
    throw new Error("TAP Video RGB registration reference dimensions do not match the descriptor.");
  }
  if (registration.depthReferenceDimensions !== undefined && registration.depthReferenceDimensions !== null &&
      canonicalJSON(registration.depthReferenceDimensions) !== canonicalJSON(depth)) {
    throw new Error("TAP Video depth registration reference dimensions do not match the descriptor.");
  }
  if (registration.recordedTransform !== undefined && registration.recordedTransform !== null && registration.recordedTransform !== expectedConnection) {
    throw new Error("TAP Video recorded registration transform does not match the RGB track transform.");
  }
  if (registration.rgbCleanAperture !== undefined && registration.rgbCleanAperture !== null &&
      canonicalJSON(registration.rgbCleanAperture) !== canonicalJSON(descriptor.rgbCleanAperture)) {
    throw new Error("TAP Video registration clean aperture does not match the descriptor.");
  }
}

function validateCalibration(value: unknown, index: number): void {
  const calibration = requireObject(value, `calibrationTable[${index}]`);
  requireAllowedKeys(calibration, [
    "extrinsicMatrix", "intrinsicMatrix", "intrinsicMatrixReferenceDimensions", "inverseLensDistortionLookupTable",
    "lensDistortionCenter", "lensDistortionLookupTable", "pixelSizeMillimeters"
  ], ["extrinsicMatrix", "intrinsicMatrix", "intrinsicMatrixReferenceDimensions", "lensDistortionCenter", "pixelSizeMillimeters"], `calibrationTable[${index}]`);
  requireNumberArray(calibration.intrinsicMatrix, 9, `calibrationTable[${index}].intrinsicMatrix`);
  requireNumberArray(calibration.extrinsicMatrix, 12, `calibrationTable[${index}].extrinsicMatrix`);
  validateDimensions(calibration.intrinsicMatrixReferenceDimensions, `calibrationTable[${index}].intrinsicMatrixReferenceDimensions`);
  requireFiniteNumber(calibration.pixelSizeMillimeters, `calibrationTable[${index}].pixelSizeMillimeters`);
  validatePoint(calibration.lensDistortionCenter, `calibrationTable[${index}].lensDistortionCenter`);
  for (const key of ["lensDistortionLookupTable", "inverseLensDistortionLookupTable"]) {
    if (calibration[key] !== undefined && calibration[key] !== null) requireBase64(calibration[key], `calibrationTable[${index}].${key}`);
  }
}

function validateRegistrationDescriptor(value: Record<string, unknown>, tokens: Map<string, string>): void {
  requireExactKeys(value, [
    "alignedRGBCodedDimensions", "connectionTransform", "depthDimensions", "depthToAlignedRGBPixelCenterAffine",
    "encodedRGBCodedDimensions", "isEncodedHorizontallyMirrored", "model", "rgbCleanAperture", "schema",
    "version", "videoStabilizationMode"
  ], "spatialRegistration.descriptor");
  if (value.schema !== "urn:tapnap:tapcam:video-depth-registration:avdepthdata-yuv-warp:v1" || value.version !== 1 ||
      value.model !== "avdepthdata-warped-to-synchronized-rgb-pixel-centers" || value.videoStabilizationMode !== "off") {
    throw new Error("Invalid TAP Video registration descriptor identity.");
  }
  requireInteger(value.version, tokens, ["payload", "spatialRegistration", "descriptor", "version"], "descriptor.version");
  validateDimensions(value.alignedRGBCodedDimensions, "descriptor.alignedRGBCodedDimensions");
  validateDimensions(value.encodedRGBCodedDimensions, "descriptor.encodedRGBCodedDimensions");
  validateDimensions(value.depthDimensions, "descriptor.depthDimensions");
  requireNumberArray(value.depthToAlignedRGBPixelCenterAffine, 6, "descriptor.depthToAlignedRGBPixelCenterAffine");
  requireEnum(value.connectionTransform, registrationTransforms(), "descriptor.connectionTransform");
  requireBoolean(value.isEncodedHorizontallyMirrored, "descriptor.isEncodedHorizontallyMirrored");
  validateRect(value.rgbCleanAperture, "descriptor.rgbCleanAperture");
}

function validateSynchronization(sync: Record<string, unknown>, coverage: Record<string, unknown>): void {
  requireAllowedKeys(sync, ["maxObservedDeltaSeconds", "maxObservedDepthIntervalSeconds", "nominalDepthIntervalSeconds", "rgbToDepthMapping", "timing"],
    ["rgbToDepthMapping", "timing"], "synchronization");
  if (sync.timing !== "capture-output-presentation-timestamps") throw new Error("Invalid TAP Video synchronization timing.");
  const expectedMapping = coverage.sampleCount === 0 ? "no-depth-samples" : "independent-timed-metadata";
  if (sync.rgbToDepthMapping !== expectedMapping) throw new Error("TAP Video depth mapping does not match sample coverage.");
  for (const key of ["maxObservedDeltaSeconds", "maxObservedDepthIntervalSeconds", "nominalDepthIntervalSeconds"]) {
    if (sync[key] !== undefined && sync[key] !== null) requireFiniteNumber(sync[key], `synchronization.${key}`);
  }
}

function validateDimensions(value: unknown, label: string): void {
  const dimensions = requireObject(value, label);
  requireExactKeys(dimensions, ["height", "width"], label);
  requireFiniteNumber(dimensions.width, `${label}.width`);
  requireFiniteNumber(dimensions.height, `${label}.height`);
}

function validateRect(value: unknown, label: string): void {
  const rect = requireObject(value, label);
  requireExactKeys(rect, ["height", "width", "x", "y"], label);
  for (const key of ["x", "y", "width", "height"]) requireFiniteNumber(rect[key], `${label}.${key}`);
}

function validatePoint(value: unknown, label: string): void {
  const point = requireObject(value, label);
  requireExactKeys(point, ["x", "y"], label);
  requireFiniteNumber(point.x, `${label}.x`);
  requireFiniteNumber(point.y, `${label}.y`);
}

function registrationTransforms(): string[] {
  return [
    "rotation:0;mirrored", "rotation:0;not-mirrored", "rotation:90;mirrored", "rotation:90;not-mirrored",
    "rotation:180;mirrored", "rotation:180;not-mirrored", "rotation:270;mirrored", "rotation:270;not-mirrored"
  ];
}

function requireNumberArray(value: unknown, length: number, label: string): void {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} must contain exactly ${length} numbers.`);
  value.forEach((item, index) => requireFiniteNumber(item, `${label}[${index}]`));
}

function requireBase64(value: unknown, label: string): void {
  requireString(value, label);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value as string)) {
    throw new Error(`${label} is not canonical base64.`);
  }
}

async function validateVideoSemantics(bytes: Uint8Array, topLevel: Box[], manifest: TapVideoManifest): Promise<void> {
  const moovBoxes = topLevel.filter((box) => box.type === "moov");
  if (moovBoxes.length !== 1) throw new Error("TAP Video must contain exactly one moov box.");
  const moov = moovBoxes[0];
  const movieHeader = requireUniqueChild(bytes, moov, "mvhd");
  const movieTiming = readHeaderTiming(bytes, movieHeader, "movie");
  const trackBoxes = children(bytes, moov).filter((box) => box.type === "trak");
  const tracks = trackBoxes.map((track) => readTrackInfo(bytes, track));
  const payload = manifest.payload as unknown as Record<string, unknown>;
  const container = payload.container as Record<string, unknown>;
  const rgb = payload.rgbTrack as Record<string, unknown>;
  const audio = payload.audioTrack as Record<string, unknown>;
  const coverage = payload.depthCoverage as Record<string, unknown>;
  const registration = payload.spatialRegistration as Record<string, unknown>;

  if (container.trackCount !== tracks.length || container.timeScale !== movieTiming.timeScale ||
      !durationMatches(container.durationSeconds as number, movieTiming.duration, movieTiming.timeScale)) {
    throw new Error("Finalized MP4 movie facts do not match the TAP Video manifest.");
  }
  const trackIDs = tracks.map((track) => track.id);
  if (trackIDs.some((id) => id <= 0) || new Set(trackIDs).size !== trackIDs.length) throw new Error("MP4 track IDs must be positive and distinct.");
  const rgbTracks = tracks.filter((track) => track.handler === "vide");
  const audioTracks = tracks.filter((track) => track.handler === "soun");
  const metadataTracks = tracks.filter((track) => track.handler === "meta");
  if (tracks.some((track) => !["vide", "soun", "meta"].includes(track.handler)) || rgbTracks.length !== 1 || audioTracks.length > 1 || metadataTracks.length > 1) {
    throw new Error("Invalid TAP Video v1 track composition.");
  }
  const rgbTrack = rgbTracks[0];
  requireSingleCodec(rgbTrack, rgb.codec as string, "RGB");
  if (rgb.trackID !== rgbTrack.id || rgb.timeScale !== rgbTrack.timeScale ||
      !durationMatches(rgb.durationSeconds as number, rgbTrack.duration, rgbTrack.timeScale) ||
      rgb.width !== rgbTrack.width || rgb.height !== rgbTrack.height ||
      (rgb.frameCount !== undefined && rgb.frameCount !== null && rgb.frameCount !== rgbTrack.sampleCount)) {
    throw new Error("RGB track facts do not match the finalized MP4.");
  }
  if (audio.status === "captured") {
    if (audioTracks.length !== 1) throw new Error("Captured audio manifest state requires exactly one MP4 audio track.");
    const audioTrack = audioTracks[0];
    requireSingleCodec(audioTrack, audio.codec as string, "audio");
    if (audio.trackID !== audioTrack.id || audio.timeScale !== audioTrack.timeScale ||
        !durationMatches(audio.durationSeconds as number, audioTrack.duration, audioTrack.timeScale) ||
        (audio.sampleRate !== null && audio.sampleRate !== audioTrack.sampleRate) ||
        (audio.channelCount !== null && audio.channelCount !== audioTrack.channelCount)) {
      throw new Error("Audio track facts do not match the finalized MP4.");
    }
  } else if (audioTracks.length !== 0) {
    throw new Error("Non-captured audio manifest state cannot have an MP4 audio track.");
  }

  if (coverage.sampleCount === 0) {
    if (metadataTracks.length !== 0) throw new Error("Zero-depth TAP Video must not contain a timed metadata track.");
    return;
  }
  if ((coverage.sampleCount as number) > MAX_DEPTH_SAMPLES || metadataTracks.length !== 1) {
    throw new Error("Stored TAP Video depth requires one bounded timed metadata track.");
  }
  const depthTrack = metadataTracks[0];
  requireSingleCodec(depthTrack, "mebx", "depth metadata");
  if (coverage.trackID !== depthTrack.id || coverage.trackTimeScale !== depthTrack.timeScale ||
      !durationMatches(coverage.trackDurationSeconds as number, depthTrack.duration, depthTrack.timeScale) ||
      depthTrack.sampleCount !== coverage.sampleCount ||
      depthTrack.id === rgbTrack.id || (audioTracks[0] && depthTrack.id === audioTracks[0].id)) {
    throw new Error("Depth metadata track facts do not match the finalized MP4.");
  }
  const samples = readTrackSamples(bytes, depthTrack.box);
  if (samples.reduce((sum, sample) => sum + BigInt(sample.duration), 0n) !== depthTrack.duration) {
    throw new Error("Timed-depth sample durations do not match the signed track duration.");
  }
  const keyMappings = readMebxKeyMappings(bytes, depthTrack.box);
  const format = coverage.format as Record<string, unknown>;
  const policy = format.compressionPolicy as string;
  const calibrationTable = registration.calibrationTable as unknown[];
  let previousPTS: { value: bigint; timescale: number } | null = null;
  let previousSampleTimestamp: bigint | null = null;
  let indexedSamples = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const frame = decodeMebxDepthSample(sample.bytes);
    requireTapDepthKeyMapping(keyMappings, sample.sampleDescriptionIndex, frame.localKeyID);
    if (frame.frameIndex !== index) throw new Error("TAP depth FRAM values must be contiguous zero-based sample ordinals.");
    if (frame.uncompressedByteCount !== format.uncompressedFrameByteCount) throw new Error("TAP depth ULEN does not match the signed format.");
    if (frame.payload.byteLength > MAX_DEPTH_FRAME_BYTES || !compressionAllowed(policy, frame.compression)) {
      throw new Error("TAP depth COMP or encoded DPTH payload violates the signed policy.");
    }
    if (frame.calibrationIndex !== null) {
      indexedSamples += 1;
      if (frame.calibrationIndex >= calibrationTable.length) throw new Error("TAP depth CALI index is outside the signed calibration table.");
    }
    if (previousPTS && compareMediaTimes(frame.ptsValue, frame.ptsTimescale, previousPTS.value, previousPTS.timescale) <= 0) {
      throw new Error("TAP depth KLV presentation timestamps must be strictly increasing.");
    }
    if (previousSampleTimestamp !== null && sample.timestamp <= previousSampleTimestamp) {
      throw new Error("MP4 timed-depth sample timestamps must be strictly increasing.");
    }
    if (sample.duration <= 0 || sample.timestamp < 0n || sample.timestamp + BigInt(sample.duration) > depthTrack.duration ||
        compareMediaTimes(frame.ptsValue, frame.ptsTimescale, 0n, 1) < 0 ||
        compareMediaTimes(frame.ptsValue, frame.ptsTimescale, depthTrack.duration, depthTrack.timeScale) > 0) {
      throw new Error("TAP depth sample timestamp or duration is outside the signed track duration.");
    }
    if (!withinOneFinerTick(frame.ptsValue, frame.ptsTimescale, sample.timestamp, depthTrack.timeScale)) {
      throw new Error("KLV PTS does not agree with its MP4 sample timestamp within one tick.");
    }
    await decodeTapDepthFrame(frame);
    previousPTS = { value: frame.ptsValue, timescale: frame.ptsTimescale };
    previousSampleTimestamp = sample.timestamp;
  }
  const calibrationCoverage = registration.calibrationCoverage as Record<string, unknown>;
  if (indexedSamples !== calibrationCoverage.indexedSampleCount ||
      samples.length - indexedSamples !== (calibrationCoverage.missingCalibrationSampleCount as number) + (calibrationCoverage.overflowUnindexedSampleCount as number)) {
    throw new Error("KLV CALI records do not match signed calibration coverage counts.");
  }
}

function readTrackInfo(bytes: Uint8Array, track: Box): TrackInfo {
  const id = readTrackID(bytes, track);
  const mdia = requireUniqueChild(bytes, track, "mdia");
  const mdhd = requireUniqueChild(bytes, mdia, "mdhd");
  const timing = readHeaderTiming(bytes, mdhd, "track");
  const hdlr = requireUniqueChild(bytes, mdia, "hdlr");
  if (hdlr.payloadStart + 12 > hdlr.payloadEnd) throw new Error("Truncated MP4 media handler.");
  const handler = asciiFourCC(bytes, hdlr.payloadStart + 8);
  const minf = requireUniqueChild(bytes, mdia, "minf");
  const stbl = requireUniqueChild(bytes, minf, "stbl");
  const descriptions = readSampleDescriptions(bytes, stbl);
  const stsz = requireUniqueChild(bytes, stbl, "stsz");
  const sampleCount = readU32(bytes, stsz.payloadStart + 8);
  const first = descriptions[0];
  let width: number | null = null;
  let height: number | null = null;
  let sampleRate: number | null = null;
  let channelCount: number | null = null;
  if (handler === "vide") {
    if (!first || first.payloadStart + 28 > first.payloadEnd) throw new Error("Truncated MP4 video sample entry.");
    width = readU16(bytes, first.payloadStart + 24);
    height = readU16(bytes, first.payloadStart + 26);
  } else if (handler === "soun") {
    if (!first || first.payloadStart + 28 > first.payloadEnd) throw new Error("Truncated MP4 audio sample entry.");
    channelCount = readU16(bytes, first.payloadStart + 16);
    sampleRate = readU32(bytes, first.payloadStart + 24) / 65536;
  }
  return { box: track, id, handler, timeScale: timing.timeScale, duration: timing.duration, codecs: descriptions.map((entry) => entry.type), sampleCount, width, height, sampleRate, channelCount };
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

function readHeaderTiming(bytes: Uint8Array, box: Box, label: string): { timeScale: number; duration: bigint } {
  const version = bytes[box.payloadStart];
  if (version !== 0 && version !== 1) throw new Error(`Unsupported MP4 ${label} header version.`);
  const timeScaleOffset = box.payloadStart + (version === 1 ? 20 : 12);
  const durationOffset = box.payloadStart + (version === 1 ? 24 : 16);
  const timeScale = readU32(bytes, timeScaleOffset);
  const duration = version === 1 ? readU64(bytes, durationOffset) : BigInt(readU32(bytes, durationOffset));
  if (timeScale === 0) throw new Error(`Invalid MP4 ${label} timescale.`);
  return { timeScale, duration };
}

function readTrackTiming(bytes: Uint8Array, stbl: Box, sampleCount: number): { timestamps: bigint[]; durations: number[] } {
  const stts = requireUniqueChild(bytes, stbl, "stts");
  const entryCount = readU32(bytes, stts.payloadStart + 4);
  if (entryCount === 0 || stts.payloadStart + 8 + entryCount * 8 > stts.payloadEnd) throw new Error("Invalid MP4 time-to-sample table.");
  const timestamps: bigint[] = [];
  const durations: number[] = [];
  let timestamp = 0n;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = stts.payloadStart + 8 + index * 8;
    const count = readU32(bytes, entryOffset);
    const delta = readU32(bytes, entryOffset + 4);
    if (count === 0 || delta === 0 || count > sampleCount - timestamps.length) throw new Error("Invalid MP4 time-to-sample entry.");
    for (let item = 0; item < count; item += 1) {
      timestamps.push(timestamp);
      durations.push(delta);
      timestamp += BigInt(delta);
    }
  }
  if (timestamps.length !== sampleCount) throw new Error("MP4 timing table does not cover every sample.");
  const cttsBoxes = children(bytes, stbl).filter((box) => box.type === "ctts");
  if (cttsBoxes.length > 1) throw new Error("Ambiguous MP4 composition-time table.");
  if (cttsBoxes.length === 1) {
    const ctts = cttsBoxes[0];
    const version = bytes[ctts.payloadStart];
    const count = readU32(bytes, ctts.payloadStart + 4);
    if ((version !== 0 && version !== 1) || ctts.payloadStart + 8 + count * 8 > ctts.payloadEnd) throw new Error("Invalid MP4 composition-time table.");
    let sampleIndex = 0;
    for (let index = 0; index < count; index += 1) {
      const entryOffset = ctts.payloadStart + 8 + index * 8;
      const entrySamples = readU32(bytes, entryOffset);
      const compositionOffset = version === 0 ? BigInt(readU32(bytes, entryOffset + 4)) : BigInt(readI32(bytes, entryOffset + 4));
      if (entrySamples === 0 || entrySamples > sampleCount - sampleIndex) throw new Error("Invalid MP4 composition-time entry.");
      for (let item = 0; item < entrySamples; item += 1) timestamps[sampleIndex++] += compositionOffset;
    }
    if (sampleIndex !== sampleCount) throw new Error("MP4 composition-time table does not cover every sample.");
  }
  return { timestamps, durations };
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

function requireSingleCodec(track: TrackInfo, expected: string, label: string): void {
  if (track.codecs.length !== 1 || track.codecs[0] !== expected) throw new Error(`${label} track codec does not match the finalized MP4.`);
}

function compressionAllowed(policy: string, compression: TapVideoDepthFrame["compression"]): boolean {
  if (policy === "per-frame:raw") return compression === "raw";
  if (policy === "per-frame:zstd1|raw") return compression === "zstd1" || compression === "raw";
  if (policy === "per-frame:lzfse|raw") return compression === "lzfse" || compression === "raw";
  return false;
}

function compareMediaTimes(leftValue: bigint, leftScale: number, rightValue: bigint, rightScale: number): number {
  const left = leftValue * BigInt(rightScale);
  const right = rightValue * BigInt(leftScale);
  return left < right ? -1 : left > right ? 1 : 0;
}

function withinOneFinerTick(leftValue: bigint, leftScale: number, rightValue: bigint, rightScale: number): boolean {
  const difference = absBigInt(leftValue * BigInt(rightScale) - rightValue * BigInt(leftScale));
  return difference * BigInt(Math.max(leftScale, rightScale)) <= BigInt(leftScale) * BigInt(rightScale);
}

function durationMatches(declared: number, ticks: bigint, timeScale: number): boolean {
  if (ticks > BigInt(Number.MAX_SAFE_INTEGER)) return false;
  return numbersEqual(declared, Number(ticks) / timeScale);
}

function numbersEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
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
  const value = parseCanonicalJSON(envelopeText, "TAP proof envelope").value;
  if (!isRecord(value)) {
    throw new Error("Invalid TAP proof envelope.");
  }
  requireExactKeys(value, ["algorithm", "createdAt", "keyID", "type", "value"], "TAP proof envelope");
  return value;
}

function parseProofValue(proof: ProofEnvelope): ProofValue {
  if (typeof proof.value !== "string" || !proof.value) {
    throw new Error("TAP proof value is missing.");
  }
  const proofValueText = decodeUTF8(base64UrlDecode(proof.value), "TAP proof value");
  const value = parseCanonicalJSON(proofValueText, "TAP proof value").value;
  if (!isRecord(value)) {
    throw new Error("Invalid TAP proof value.");
  }
  requireExactKeys(value, ["assertionObject", "contentDigest", "keyId", "signingBinding"], "TAP proof value");
  return value;
}

async function buildContentDigest(
  bytes: Uint8Array,
  proofBox: Box,
  manifest: TapVideoManifest,
  payloadBytes: Uint8Array
): Promise<VideoContentDigest> {
  const signedBytes = new Uint8Array(bytes.byteLength - proofBox.size);
  signedBytes.set(bytes.subarray(0, proofBox.start), 0);
  signedBytes.set(bytes.subarray(proofBox.start + proofBox.size), proofBox.start);
  const assetHash = await sha256Base64Url(signedBytes);
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
  return {
    frameIndex: readU32(frame, 0),
    presentationTimeSeconds: Number(readI64(pts, 0)) / timescale,
    compression,
    uncompressedByteCount: readU32(uncompressed, 0),
    calibrationIndex: calibration ? readU32(requireRecord(records, "CALI", 4), 0) : null,
    payload,
    ptsValue: readI64(pts, 0),
    ptsTimescale: timescale,
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
  const timing = readTrackTiming(bytes, stbl, sampleCount);
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
        timestamp: timing.timestamps[sampleIndex],
        duration: timing.durations[sampleIndex],
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

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new Error("Truncated UInt16.");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, false);
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

function requireBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
}

function requireEnum(value: unknown, allowed: string[], label: string): asserts value is string {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${label} has an unsupported value.`);
}

function requireFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
}

function requireNonNegativeNumber(value: unknown, label: string): asserts value is number {
  requireFiniteNumber(value, label);
  if (value < 0) throw new Error(`${label} must be non-negative.`);
}

function requireInteger(value: unknown, tokens: Map<string, string>, path: string[], label: string): asserts value is number {
  requireIntegerToken(tokens, path, label);
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${label} must be a safely representable integer.`);
}

function requireIntegerToken(tokens: Map<string, string>, path: string[], label: string): string {
  const token = tokens.get(path.join("\u0000"));
  if (!token || !/^(?:0|-?[1-9]\d*)$/.test(token)) throw new Error(`${label} must use the canonical integer form.`);
  return token;
}

function requirePositiveInteger(value: unknown, tokens: Map<string, string>, path: string[], label: string): asserts value is number {
  requireInteger(value, tokens, path, label);
  if (value <= 0) throw new Error(`${label} must be positive.`);
}

function requireNonNegativeInteger(value: unknown, tokens: Map<string, string>, path: string[], label: string): asserts value is number {
  requireInteger(value, tokens, path, label);
  if (value < 0) throw new Error(`${label} must be non-negative.`);
}

function requireTimestamp(value: unknown, label: string): asserts value is string {
  requireString(value, label);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d+)Z$/);
  if (!match || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a UTC ISO 8601 timestamp with fractional seconds.`);
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day ||
      calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    throw new Error(`${label} must be a valid UTC calendar timestamp.`);
  }
}

function decodeUTF8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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
