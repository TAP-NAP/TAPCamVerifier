import { describe, expect, it, vi } from "vitest";
import {
  decodeTapDepthFrame,
  inspectTapVideoDepth,
  orientTapDepthPixels,
  tapVideoDisplayOrientation,
  verifyTapVideoLocally
} from "./tapVideo";

const encoder = new TextEncoder();
const ZSTD_PAYLOAD = fromBase64("KLUv/SAo1QAAoFRBUF9ERVBUSF9WRUNUT1JfVjI6AQCOnkw=");
const LZFSE_ZERO_4096 = new Uint8Array([
  0x62, 0x76, 0x78, 0x6e, 0x00, 0x10, 0x00, 0x00, 0x2b, 0x00, 0x00, 0x00, 0x68, 0x01,
  0x00, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0,
  0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0, 0xff, 0xf0,
  0xff, 0xf0, 0xff, 0xf0, 0x06, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x62,
  0x76, 0x78, 0x24
]);

vi.mock("../wasm/tapcamVerifier", () => ({
  decodeLzfseFrame: async (encoded: Uint8Array, decodedLength: number) => {
    if (decodedLength === 4096 && encoded.length === 59 && encoded[0] === 0x62 && encoded[58] === 0x24) {
      return new Uint8Array(4096);
    }
    throw new Error("LZFSE depth frame is malformed or does not decode to ULEN.");
  }
}));

describe("TAP Video v1 local verification", () => {
  it("hashes the exact canonical raw payload value bytes instead of reserializing", async () => {
    const artifact = await makeArtifact({ exactNumberToken: true });
    expect(artifact.payloadText).toContain('"nominalFrameRate":1e+0');
    expect(canonical(JSON.parse(artifact.payloadText))).not.toBe(artifact.payloadText);

    const report = await verifyTapVideoLocally(artifact.bytes);

    expect(report.status).toBe("valid");
    expect(report.recomputed?.metadataSHA256).toBe(await sha256Base64Url(encoder.encode(artifact.payloadText)));
    expect(report.serverRequest).not.toBeNull();
  });

  it("validates a raw mebx track, key mapping, sample ordinals, timestamps, and calibration coverage", async () => {
    const artifact = await makeArtifact({ depthFrames: [{}, {}] });
    const report = await verifyTapVideoLocally(artifact.bytes);
    const inspection = inspectTapVideoDepth(artifact.bytes);

    expect(report.status).toBe("valid");
    expect(report.checks.some((check) => check.id === "video-semantics" && check.status === "pass")).toBe(true);
    expect(report.serverRequest).not.toBeNull();
    expect(inspection.depthFrames.map((frame) => frame.frameIndex)).toEqual([0, 1]);
    expect(inspection.depthFrames.map((frame) => frame.presentationTimeSeconds)).toEqual([0, 0.5]);
    expect(Array.from(await decodeTapDepthFrame(inspection.depthFrames[0]))).toEqual([0, 60, 0, 64]);
  });

  it("accepts the optional finalized audio track when all signed facts match", async () => {
    const report = await verifyTapVideoLocally((await makeArtifact({ withAudio: true, depthFrames: [{}] })).bytes);
    expect(report.status).toBe("valid");
    expect(report.serverRequest).not.toBeNull();
  });

  it("accepts and decodes the shared zstd1 golden payload", async () => {
    const artifact = await makeArtifact({
      depthFrames: [{ compression: "zstd1", payload: ZSTD_PAYLOAD, ulen: 40 }],
      format: { width: 20, height: 1, packedRowStride: 40, sourceRowStride: 40, uncompressedFrameByteCount: 40, compressionPolicy: "per-frame:zstd1|raw" }
    });
    const report = await verifyTapVideoLocally(artifact.bytes);
    const decoded = await decodeTapDepthFrame(inspectTapVideoDepth(artifact.bytes).depthFrames[0]);

    expect(report.status).toBe("valid");
    expect(new TextDecoder().decode(decoded)).toBe("TAP_DEPTH_VECTOR_V2:TAP_DEPTH_VECTOR_V2:");
  });

  it("accepts the library's fixed LZFSE vector and rejects a malformed stream before server submission", async () => {
    const artifact = await makeArtifact({
      depthFrames: [{ compression: "lzfse", payload: LZFSE_ZERO_4096, ulen: 4096 }],
      format: { width: 2048, height: 1, packedRowStride: 4096, sourceRowStride: 4096, uncompressedFrameByteCount: 4096, compressionPolicy: "per-frame:lzfse|raw" }
    });
    const report = await verifyTapVideoLocally(artifact.bytes);
    const decoded = await decodeTapDepthFrame(inspectTapVideoDepth(artifact.bytes).depthFrames[0]);

    expect(report.status).toBe("valid");
    expect(report.serverRequest).not.toBeNull();
    expect(decoded).toEqual(new Uint8Array(4096));

    const malformed = await makeArtifact({
      depthFrames: [{ compression: "lzfse", payload: LZFSE_ZERO_4096.subarray(0, -1), ulen: 4096 }],
      format: { width: 2048, height: 1, packedRowStride: 4096, sourceRowStride: 4096, uncompressedFrameByteCount: 4096, compressionPolicy: "per-frame:lzfse|raw" }
    });
    const malformedReport = await verifyTapVideoLocally(malformed.bytes);
    expect(malformedReport.status).toBe("invalid");
    expect(malformedReport.serverRequest).toBeNull();
  });

  it("does not inspect untrusted KLV after the local artifact-binding gate fails", async () => {
    const bytes = (await makeArtifact({ depthFrames: [{ fram: 4 }] })).bytes.slice();
    bytes[8] ^= 1;

    const report = await verifyTapVideoLocally(bytes);

    expect(report.status).toBe("invalid");
    expect(report.serverRequest).toBeNull();
    expect(report.checks).toContainEqual(expect.objectContaining({
      id: "video-semantics",
      status: "warning"
    }));
    expect(report.checks.some((check) => check.detail.includes("FRAM"))).toBe(false);
  });

  it("rejects missing groups, wrong types/enums/counts, and invalid zero-depth relationships", async () => {
    const cases: Array<(manifest: AnyRecord) => void> = [
      (manifest) => { delete manifest.payload.software; },
      (manifest) => { manifest.payload.container.trackCount = 1.5; },
      (manifest) => { manifest.payload.audioTrack.status = "muted"; },
      (manifest) => { manifest.payload.depthCoverage.deliveredSampleCount = -1; },
      (manifest) => { manifest.payload.depthCoverage.trackID = 2; },
      (manifest) => { manifest.payload.synchronization.rgbToDepthMapping = "independent-timed-metadata"; }
    ];
    for (const mutateManifest of cases) {
      const report = await verifyTapVideoLocally((await makeArtifact({ mutateManifest })).bytes);
      expect(report.status).toBe("invalid");
      expect(report.serverRequest).toBeNull();
    }
  });

  it("rejects non-canonical embedded manifest JSON even when the proof hashes those exact bytes", async () => {
    const report = await verifyTapVideoLocally((await makeArtifact({
      payloadTextTransform: (text) => text.replace('"audioTrack":', '"audioTrack" :')
    })).bytes);
    expect(report.status).toBe("invalid");
    expect(report.summary).toContain("whitespace");
    expect(report.serverRequest).toBeNull();
  });

  it("rejects any metadata track for the canonical zero-depth form", async () => {
    const report = await verifyTapVideoLocally((await makeArtifact({
      includeMetadataTrack: true,
      mutateManifest: (manifest) => { manifest.payload.container.trackCount = 2; }
    })).bytes);
    expect(report.status).toBe("invalid");
    expect(report.summary).toContain("Zero-depth");
    expect(report.serverRequest).toBeNull();
  });

  it("rejects mismatched track composition, IDs, codecs, counts, durations, and timescales", async () => {
    const cases: ArtifactOptions[] = [
      { actualRGBCodec: "hvc1" },
      { actualRGBTrackID: 9 },
      { actualMovieTimeScale: 1000 },
      { actualMovieDuration: 599 },
      { withAudio: true, actualAudioCodec: "alac" },
      { depthFrames: [{}], actualDepthCodec: "mett" },
      { depthFrames: [{}, {}], actualDepthDuration: 599 }
    ];
    for (const options of cases) {
      const report = await verifyTapVideoLocally((await makeArtifact(options)).bytes);
      expect(report.status).toBe("invalid");
      expect(report.serverRequest).toBeNull();
    }
  });

  it("resolves the sample local key ID through the mebx metadata key table", async () => {
    const wrongKey = await verifyTapVideoLocally((await makeArtifact({ depthFrames: [{}], metadataKey: "com.example.wrong" })).bytes);
    const wrongID = await verifyTapVideoLocally((await makeArtifact({ depthFrames: [{ localKeyID: 7 }], metadataLocalKeyID: 3 })).bytes);

    expect(wrongKey.status).toBe("invalid");
    expect(wrongKey.summary).toContain("local key");
    expect(wrongKey.serverRequest).toBeNull();
    expect(wrongID.status).toBe("invalid");
    expect(wrongID.serverRequest).toBeNull();
  });

  it("rejects non-contiguous FRAM values and timestamp disagreement, regression, or overflow", async () => {
    const cases: ArtifactOptions[] = [
      { depthFrames: [{ fram: 4 }] },
      { depthFrames: [{ ptsValue: 10n }] },
      { depthFrames: [{}, { ptsValue: 0n }] },
      { depthFrames: [{ ptsValue: 601n }] }
    ];
    for (const options of cases) {
      const report = await verifyTapVideoLocally((await makeArtifact(options)).bytes);
      expect(report.status).toBe("invalid");
      expect(report.serverRequest).toBeNull();
    }
  });

  it("rejects COMP policy, ULEN/format, CALI/table, coverage, and padding violations", async () => {
    const cases: ArtifactOptions[] = [
      { depthFrames: [{ compression: "zstd1", payload: ZSTD_PAYLOAD, ulen: 40 }] },
      { depthFrames: [{ ulen: 8 }] },
      { depthFrames: [{ cali: 7 }] },
      { depthFrames: [{}], mutateManifest: (manifest) => { manifest.payload.spatialRegistration.calibrationCoverage.indexedSampleCount = 0; manifest.payload.spatialRegistration.calibrationCoverage.missingCalibrationSampleCount = 1; } },
      { depthFrames: [{ nonZeroPadding: true }] },
      { depthFrames: [{ duplicateTVER: true }] },
      { depthFrames: [{ omitDPTH: true }] },
      { depthFrames: [{ extraUnknownRecords: 27 }] }
    ];
    for (const options of cases) {
      const report = await verifyTapVideoLocally((await makeArtifact(options)).bytes);
      expect(report.status).toBe("invalid");
      expect(report.serverRequest).toBeNull();
    }
  });

  it("accepts only the exact v1 RGB transform forms", async () => {
    expect(tapVideoDisplayOrientation("identity")).toBe("up");
    expect(tapVideoDisplayOrientation("rotation:90;mirrored")).toBe("rightMirrored");
    expect(() => tapVideoDisplayOrientation("rotation:450;mirrored")).toThrow("Unsupported");
    expect(() => tapVideoDisplayOrientation("mirrored;rotation:90")).toThrow("Unsupported");
    const report = await verifyTapVideoLocally((await makeArtifact({
      mutateManifest: (manifest) => { manifest.payload.rgbTrack.transform = "rotation:450;mirrored"; }
    })).bytes);
    expect(report.status).toBe("invalid");
    expect(report.serverRequest).toBeNull();
  });

  it("rotates and mirrors depth pixels with the exact signed transform", () => {
    const rgba = new Uint8ClampedArray([
      1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255,
      4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255
    ]);
    const right = orientTapDepthPixels(rgba, 3, 2, "rotation:90");
    const rightMirrored = orientTapDepthPixels(rgba, 3, 2, "rotation:90;mirrored");
    expect([right.width, right.height, ...redChannels(right.rgba)]).toEqual([2, 3, 4, 1, 5, 2, 6, 3]);
    expect([rightMirrored.width, rightMirrored.height, ...redChannels(rightMirrored.rgba)]).toEqual([2, 3, 6, 3, 5, 2, 4, 1]);
  });
});

type AnyRecord = Record<string, any>;

interface FrameOptions {
  fram?: number;
  ptsValue?: bigint;
  ptsTimescale?: number;
  compression?: "raw" | "zstd1" | "lzfse";
  ulen?: number;
  cali?: number | null;
  payload?: Uint8Array;
  localKeyID?: number;
  nonZeroPadding?: boolean;
  duplicateTVER?: boolean;
  omitDPTH?: boolean;
  extraUnknownRecords?: number;
}

interface ArtifactOptions {
  depthFrames?: FrameOptions[];
  format?: Partial<AnyRecord>;
  includeMetadataTrack?: boolean;
  metadataKey?: string;
  metadataLocalKeyID?: number;
  actualRGBCodec?: string;
  actualRGBTrackID?: number;
  actualDepthCodec?: string;
  actualMovieTimeScale?: number;
  actualMovieDuration?: number;
  actualDepthDuration?: number;
  withAudio?: boolean;
  actualAudioCodec?: string;
  exactNumberToken?: boolean;
  payloadTextTransform?: (payload: string) => string;
  mutateManifest?: (manifest: AnyRecord) => void;
}

async function makeArtifact(options: ArtifactOptions = {}): Promise<{ bytes: Uint8Array; payloadText: string }> {
  const frames = options.depthFrames ?? [];
  const hasDepth = frames.length > 0;
  const metadataTrackPresent = options.includeMetadataTrack ?? hasDepth;
  const format = {
    kind: "depth", pixelFormat: "hdep", width: 2, height: 1, packedRowStride: 4, sourceRowStride: 4,
    bytesPerSample: 2, byteOrder: "little-endian", uncompressedFrameByteCount: 4,
    compressionPolicy: "per-frame:raw", ...options.format
  };
  const manifest = baseManifest(hasDepth, frames, format, options.withAudio ?? false);
  options.mutateManifest?.(manifest);
  let payloadText = canonical(manifest.payload);
  if (options.exactNumberToken) payloadText = payloadText.replace('"nominalFrameRate":1', '"nominalFrameRate":1e+0');
  if (options.payloadTextTransform) payloadText = options.payloadTextTransform(payloadText);
  const manifestText = `{"payload":${payloadText},"proofs":[],"schema":${canonical(manifest.schema)}}`;
  const manifestBox = uuidBox("TAPCAMVIDEOMANF1", encoder.encode(manifestText));
  const rgbSample = new Uint8Array([0, 0, 0, 1]);
  const audioSample = new Uint8Array([0xaa, 0xbb]);
  const depthSamples = frames.map((frame, index) => makeDepthSample(frame, index, Math.floor(600 / Math.max(1, frames.length))));
  const ftyp = box("ftyp", encoder.encode("mp42"));
  const mdat = box("mdat", concat(rgbSample, ...(options.withAudio ? [audioSample] : []), ...depthSamples));
  const rgbOffset = ftyp.length + 8;
  const audioOffset = rgbOffset + rgbSample.length;
  const depthOffset = audioOffset + (options.withAudio ? audioSample.length : 0);
  const tracks = [makeTrack({
    id: options.actualRGBTrackID ?? 1, handler: "vide", codec: options.actualRGBCodec ?? "avc1",
    timeScale: 600, duration: 600, sampleSizes: [rgbSample.length], chunkOffset: rgbOffset, width: 4, height: 4
  })];
  if (options.withAudio) {
    tracks.push(makeTrack({
      id: 3, handler: "soun", codec: options.actualAudioCodec ?? "mp4a", timeScale: 48_000,
      duration: 48_000, sampleSizes: [audioSample.length], chunkOffset: audioOffset
    }));
  }
  if (metadataTrackPresent) {
    tracks.push(makeTrack({
      id: 2, handler: "meta", codec: options.actualDepthCodec ?? "mebx", timeScale: 600,
      duration: options.actualDepthDuration ?? 600, sampleSizes: depthSamples.length > 0 ? depthSamples.map((sample) => sample.length) : [8],
      chunkOffset: depthOffset, sampleDelta: Math.floor((options.actualDepthDuration ?? 600) / Math.max(1, depthSamples.length)),
      metadataKey: options.metadataKey ?? "com.tapnap.depth.klv", metadataLocalKeyID: options.metadataLocalKeyID ?? 3
    }));
  }
  const moov = box("moov", concat(makeMovieHeader(options.actualMovieTimeScale ?? 600, options.actualMovieDuration ?? 600), ...tracks));
  const prefix = concat(ftyp, mdat, moov, manifestBox);
  const proofOffset = prefix.length;
  const proofBoxLength = 8 + 16 + 60 * 1024;
  const contentDigest = {
    assetHash: {
      algorithm: "SHA-256", byteCount: proofOffset + proofBoxLength,
      excludedRanges: [{ length: proofBoxLength, offset: proofOffset, reason: "tap-proof-slot" }],
      fileContainer: "mp4", kind: "c2pa-style-format-native-byte-ranges", value: await sha256Base64Url(prefix)
    },
    captureID: manifest.payload.id,
    capturedAt: manifest.payload.capturedAt,
    depthResource: {
      binding: manifest.payload.depthCoverage.sampleCount > 0 ? "covered-by-assetHash" : "coverage-recorded-in-manifest",
      interpretation: "not-part-of-base-signature", platformPresenceCheck: "TAPVideoManifest.depthCoverage",
      presence: manifest.payload.depthCoverage.sampleCount > 0 ? "captured" : "no-samples"
    },
    manifestSchemaID: manifest.schema.id,
    metadataHash: {
      algorithm: "SHA-256", kind: "canonical-json", mediaType: "application/vnd.tapnap.video-manifest.payload+json;version=1",
      value: await sha256Base64Url(encoder.encode(payloadText))
    },
    proofSlot: {
      kind: "bmff-uuid-proof-slot", length: proofBoxLength, offset: proofOffset, padding: "zero-filled-after-envelope",
      payloadLength: 60 * 1024, payloadOffset: proofOffset + 24
    },
    schemaID: "urn:tapnap:tapcam:video-content-binding:v1"
  };
  const signingBinding = {
    bodySHA256: await sha256Base64Url(encoder.encode(canonical(contentDigest))), captureID: manifest.payload.id,
    operation: "tapcam.capture.sign", schemaID: "urn:tapnap:tapcam:app-attest-capture-signing:v1"
  };
  const proofValue = { assertionObject: "synthetic-assertion", contentDigest, keyId: "synthetic-key", signingBinding };
  const proofEnvelope = {
    algorithm: "TAPCam.AppAttestCaptureSignature.v1", createdAt: manifest.payload.capturedAt, keyID: "synthetic-key",
    type: "appAttestAssertion", value: toBase64Url(encoder.encode(canonical(proofValue)))
  };
  const proofPayload = new Uint8Array(60 * 1024);
  proofPayload.set(encoder.encode("TAPCAM-PROOF-SLOT-V1"), 0);
  proofPayload.set(u32(1), 24);
  const envelopeBytes = encoder.encode(canonical(proofEnvelope));
  proofPayload.set(u32(envelopeBytes.length), 28);
  proofPayload.set(envelopeBytes, 32);
  return { bytes: concat(prefix, uuidBox("TAPCAMPROOFSLOT1", proofPayload)), payloadText };
}

function baseManifest(hasDepth: boolean, frames: FrameOptions[], format: AnyRecord, withAudio: boolean): AnyRecord {
  const indexed = hasDepth ? frames.filter((frame) => frame.cali !== null).length : 0;
  const calibration = {
    intrinsicMatrix: [1, 0, 0, 0, 1, 0, 1, 1, 1], intrinsicMatrixReferenceDimensions: { width: 2, height: 1 },
    extrinsicMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], pixelSizeMillimeters: 0.001,
    lensDistortionCenter: { x: 1, y: 0.5 }
  };
  return {
    schema: { id: "urn:tapnap:tapcam:video-manifest:v1", version: 1, mediaType: "application/vnd.tapnap.video-manifest+json;version=1" },
    payload: {
      id: "synthetic-video", packageID: "00000000-0000-0000-0000-000000000001", capturedAt: "2026-08-13T00:00:00.000Z",
      selectedCameraPlan: { position: "back", depthCapable: hasDepth },
      container: { fileType: "mp4", mediaType: "video/mp4", durationSeconds: 1, timeScale: 600, trackCount: 1 + (hasDepth ? 1 : 0) + (withAudio ? 1 : 0) },
      rgbTrack: { trackID: 1, codec: "avc1", width: 4, height: 4, durationSeconds: 1, timeScale: 600, nominalFrameRate: 1, frameCount: 1, transform: "rotation:90;mirrored" },
      audioTrack: withAudio
        ? { status: "captured", trackID: 3, codec: "mp4a", durationSeconds: 1, timeScale: 48_000, sampleRate: 48_000, channelCount: 2 }
        : { status: "notCaptured", trackID: null, codec: null, durationSeconds: null, timeScale: null, sampleRate: null, channelCount: null },
      depthCoverage: {
        trackID: hasDepth ? 2 : null, trackCodec: hasDepth ? "mebx" : null, trackDurationSeconds: hasDepth ? 1 : null,
        trackTimeScale: hasDepth ? 600 : null, sampleCount: frames.length, deliveredSampleCount: frames.length,
        outputDropCount: 0, encodingDropCount: 0, metadataDropCount: 0, gapCount: 0, gaps: [], format: hasDepth ? format : null
      },
      spatialRegistration: {
        status: hasDepth ? "registered" : "unavailable",
        mapping: hasDepth ? "urn:tapnap:tapcam:video-depth-registration:avdepthdata-yuv-warp:v1" : "unavailable",
        calibrationTable: hasDepth ? [calibration] : [],
        calibrationCoverage: { indexedSampleCount: indexed, missingCalibrationSampleCount: frames.length - indexed, overflowUnindexedSampleCount: 0, tableOverflowed: false },
        ...(hasDepth ? { descriptor: {
          schema: "urn:tapnap:tapcam:video-depth-registration:avdepthdata-yuv-warp:v1", version: 1,
          model: "avdepthdata-warped-to-synchronized-rgb-pixel-centers", alignedRGBCodedDimensions: { width: 4, height: 4 },
          encodedRGBCodedDimensions: { width: 4, height: 4 }, depthDimensions: { width: format.width, height: format.height },
          depthToAlignedRGBPixelCenterAffine: [2, 0, 0, 0, 2, 0], connectionTransform: "rotation:90;mirrored",
          isEncodedHorizontallyMirrored: false, rgbCleanAperture: { x: 0, y: 0, width: 4, height: 4 }, videoStabilizationMode: "off"
        } } : {})
      },
      synchronization: { timing: "capture-output-presentation-timestamps", rgbToDepthMapping: hasDepth ? "independent-timed-metadata" : "no-depth-samples" },
      stop: { reason: "userStop", recordedDurationSeconds: 1 },
      software: { appIdentifier: "example.invalid.tapcam", appVersion: "1", buildNumber: "1", schemaWriter: "synthetic.v1" }
    },
    proofs: []
  };
}

function makeDepthSample(frame: FrameOptions, index: number, defaultDelta: number): Uint8Array {
  const compression = frame.compression ?? "raw";
  const payload = frame.payload ?? new Uint8Array([0, 60, 0, 64]);
  const records = [
    record("TVER", u32(1)), ...(frame.duplicateTVER ? [record("TVER", u32(1))] : []), record("FRAM", u32(frame.fram ?? index)),
    record("PTS ", concat(i64(frame.ptsValue ?? BigInt(index * defaultDelta)), i32(frame.ptsTimescale ?? 600))),
    record("COMP", encoder.encode(compression), frame.nonZeroPadding), record("ULEN", u32(frame.ulen ?? 4)),
    ...(frame.cali === null ? [] : [record("CALI", u32(frame.cali ?? 0))]),
    ...Array.from({ length: frame.extraUnknownRecords ?? 0 }, (_, extra) => record(`X${String(extra).padStart(3, "0")}`, new Uint8Array())),
    ...(frame.omitDPTH ? [] : [record("DPTH", payload)])
  ];
  const klv = concat(...records);
  return concat(u32(klv.length + 8), u32(frame.localKeyID ?? 3), klv);
}

interface TrackOptions {
  id: number; handler: "vide" | "soun" | "meta"; codec: string; timeScale: number; duration: number;
  sampleSizes: number[]; chunkOffset: number; sampleDelta?: number; width?: number; height?: number;
  metadataKey?: string; metadataLocalKeyID?: number;
}

function makeTrack(options: TrackOptions): Uint8Array {
  const tkhd = fullBox("tkhd", concat(u32(0), u32(0), u32(options.id)));
  const mdhd = fullBox("mdhd", concat(u32(0), u32(0), u32(options.timeScale), u32(options.duration), u32(0)));
  const hdlr = fullBox("hdlr", concat(u32(0), encoder.encode(options.handler), new Uint8Array(12)));
  const sampleEntry = options.handler === "vide"
    ? videoSampleEntry(options.codec, options.width ?? 4, options.height ?? 4)
    : options.handler === "soun" ? audioSampleEntry(options.codec)
      : metadataSampleEntry(options.codec, options.metadataLocalKeyID ?? 3, options.metadataKey ?? "com.tapnap.depth.klv");
  const stsd = fullBox("stsd", concat(u32(1), sampleEntry));
  const stts = fullBox("stts", concat(u32(1), u32(options.sampleSizes.length), u32(options.sampleDelta ?? options.duration)));
  const stsz = fullBox("stsz", concat(u32(0), u32(options.sampleSizes.length), ...options.sampleSizes.map(u32)));
  const stsc = fullBox("stsc", concat(u32(1), u32(1), u32(options.sampleSizes.length), u32(1)));
  const stco = fullBox("stco", concat(u32(1), u32(options.chunkOffset)));
  return box("trak", concat(tkhd, box("mdia", concat(mdhd, hdlr, box("minf", box("stbl", concat(stsd, stts, stsz, stsc, stco)))))));
}

function makeMovieHeader(timeScale: number, duration: number): Uint8Array {
  return fullBox("mvhd", concat(u32(0), u32(0), u32(timeScale), u32(duration)));
}

function videoSampleEntry(codec: string, width: number, height: number): Uint8Array {
  const payload = new Uint8Array(28);
  const view = new DataView(payload.buffer);
  view.setUint16(6, 1, false); view.setUint16(24, width, false); view.setUint16(26, height, false);
  return box(codec, payload);
}

function audioSampleEntry(codec: string): Uint8Array {
  const payload = new Uint8Array(28);
  const view = new DataView(payload.buffer);
  view.setUint16(6, 1, false); view.setUint16(16, 2, false); view.setUint16(18, 16, false); view.setUint32(24, 48_000 * 65_536, false);
  return box(codec, payload);
}

function metadataSampleEntry(codec: string, localKeyID: number, key: string): Uint8Array {
  const keyDeclaration = box("keyd", concat(encoder.encode("mdta"), encoder.encode(key)));
  const keyAtom = concat(u32(keyDeclaration.length + 8), u32(localKeyID), keyDeclaration);
  return box(codec, concat(new Uint8Array(6), u16(1), box("keys", keyAtom)));
}

function redChannels(rgba: Uint8ClampedArray): number[] {
  const values: number[] = [];
  for (let index = 0; index < rgba.length; index += 4) values.push(rgba[index]);
  return values;
}

function box(type: string, payload: Uint8Array): Uint8Array { return concat(u32(payload.length + 8), encoder.encode(type), payload); }
function fullBox(type: string, body: Uint8Array): Uint8Array { return box(type, concat(new Uint8Array(4), body)); }
function uuidBox(userType: string, payload: Uint8Array): Uint8Array { return box("uuid", concat(encoder.encode(userType), payload)); }
function record(key: string, payload: Uint8Array, nonZeroPadding = false): Uint8Array {
  const padding = new Uint8Array((4 - (payload.length % 4)) % 4);
  if (nonZeroPadding && padding.length > 0) padding[0] = 1;
  return concat(encoder.encode(key), u32(payload.length), payload, padding);
}
function u16(value: number): Uint8Array { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, false); return bytes; }
function u32(value: number): Uint8Array { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, false); return bytes; }
function i32(value: number): Uint8Array { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setInt32(0, value, false); return bytes; }
function i64(value: bigint): Uint8Array { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setBigInt64(0, value, false); return bytes; }

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function canonical(value: unknown): string { return JSON.stringify(sort(value)); }
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sort(record[key])]));
}
async function sha256Base64Url(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer)));
}
function toBase64Url(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64url"); }
function fromBase64(value: string): Uint8Array { return new Uint8Array(Buffer.from(value, "base64")); }
