import { zipSync } from "fflate";
import { resolveCaptureInput } from "../input/captureInput";
import { describe, expect, it, vi } from "vitest";
import extensionVectors from "./fixtures/tap-video-extensions-v1.json";
import { classifyResult } from "../ui/rendering";
import type { LocalVerificationReport } from "../verifier/types";
import {
  decodeTapDepthFrame,
  inspectTapVideoDepth,
  orientTapDepthPixels,
  registerTapDepthPixels,
  renderTapDepthFrame,
  tapVideoDisplayOrientation,
  verifyTapVideoLocally,
  type TapVideoRegistrationDescriptor
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

describe("TAP Video byte binding and downstream depth", () => {
  it.each([false, true])("verifies unchanged packaged MP4 bytes (depth=%s)", async (withDepth) => {
    const artifact = await makeArtifact({ depthFrames: withDepth ? [{}] : [] });
    const bytes = packageVideo(artifact.bytes);
    const input = resolveCaptureInput(new File([new Uint8Array(bytes)], "capture.tapnap"), bytes);
    if (input.kind !== "tap-video") throw new Error("expected TAP Video input");
    expect(input.videoBytes).toEqual(artifact.bytes);
    expect((await verifyTapVideoLocally(input.videoBytes)).serverRequest).not.toBeNull();
  });

  it("rejects changed media and telemetry bytes even when they remain parseable", async () => {
    const artifact = await makeArtifact({ telemetryBoxes: [encoder.encode(canonical(captureTelemetry()))] });
    const marker = encoder.encode('"quaternion":[0,0,0,1]');
    const markerOffset = artifact.bytes.findIndex((_, index) => marker.every((byte, relative) => artifact.bytes[index + relative] === byte));
    expect(markerOffset).toBeGreaterThan(0);
    for (const offset of [20, markerOffset + '"quaternion":['.length]) {
      const altered = artifact.bytes.slice();
      altered[offset] ^= 1;
      const report = await verifyTapVideoLocally(altered);
      expect(report.status).toBe("invalid");
      expect(report.serverRequest).toBeNull();
      expect(report.checks).toContainEqual(expect.objectContaining({ id: "video-content-binding", status: "fail" }));
    }
  });

  it.each(extensionVectors.cases)("binds the exact extension bytes without judging their content: $id", async (vector) => {
    const bytes = fromBase64(vector.utf8Base64);
    expect(bytes.length).toBe(vector.utf8ByteCount);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
    expect(Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")).toBe(vector.utf8SHA256);
    const artifact = await makeArtifact(vector.extension === "cald"
      ? { depthFrames: [{ cali: null, cald: bytes }] }
      : { depthFrames: [{}], telemetryBoxes: [bytes] });
    expect((await verifyTapVideoLocally(artifact.bytes)).serverRequest).not.toBeNull();
  });

  it("does not parse telemetry or let it block independent depth inspection", async () => {
    const telemetry = captureTelemetry();
    telemetry.motion.samples.push(telemetry.motion.samples[0]);
    telemetry.motion.samples[0].quaternion = [0, 0, 0, 2];
    telemetry.filtering.filteredSampleCount = 900;
    for (const telemetryBoxes of [
      [encoder.encode(canonical(telemetry))],
      [new Uint8Array([255])],
      [new Uint8Array(), new Uint8Array()],
      [new Uint8Array(4 * 1024 * 1024 + 1)]
    ]) {
      const artifact = await makeArtifact({ depthFrames: [{}], telemetryBoxes });
      const report = await verifyTapVideoLocally(artifact.bytes);
      expect(report.status).toBe("valid");
      expect(report.serverRequest).not.toBeNull();
      expect(inspectTapVideoDepth(artifact.bytes).depthFrames).toHaveLength(1);
    }
  });

  it("binds descriptive manifest fields without requiring content validity", async () => {
    const mutations: Array<(manifest: AnyRecord) => void> = [
      (m) => { delete m.payload.software; delete m.payload.selectedCameraPlan; },
      (m) => { m.payload.extra = { future: true }; m.payload.capturedAt = "unknown capture clock"; },
      (m) => { m.payload.container = { durationSeconds: -1, trackCount: 1.5 }; m.payload.stop = null; },
      (m) => { m.payload.audioTrack = { status: "muted", sampleRate: -1 }; },
      (m) => { m.payload.depthCoverage = { sampleCount: -1, gaps: [{ startPTS: 10, endPTS: 0 }] }; },
      (m) => { delete m.payload.depthCoverage; delete m.payload.synchronization; },
      (m) => { m.payload.rgbTrack.transform = "rotation:450;mirrored"; },
      (m) => { m.payload.spatialRegistration = { status: "registered", descriptor: null, calibrationTable: [null], calibrationCoverage: { indexedSampleCount: 900 } }; },
      (m) => { m.payload.selectedCameraPlan.depthCapable = false; m.payload.depthCoverage.deliveredSampleCount = 0; },
      (m) => { m.payload.depthCoverage.format = { kind: "unknown", width: -1, bytesPerSample: 3 }; }
    ];
    for (const mutateManifest of mutations) {
      const report = await verifyTapVideoLocally((await makeArtifact({ depthFrames: [{}], mutateManifest })).bytes);
      expect(report.status).toBe("valid");
      expect(report.serverRequest).not.toBeNull();
    }
  });

  it("preserves the signed depth descriptor without inferring blob presence", async () => {
    for (const depthResource of [null, { presence: "producer-observation", binding: "opaque" }]) {
      const report = await verifyTapVideoLocally((await makeArtifact({ depthFrames: [{}], depthResource })).bytes);
      expect(report.status).toBe("valid");
      expect(report.expected?.contentDigest).toMatchObject({ depthResource });
    }
  });

  it("selects the v1 algorithm by schema identity while binding descriptive version bytes", async () => {
    for (const version of [undefined, 2, "future description", null]) {
      const artifact = await makeArtifact({ mutateManifest: (m) => {
        if (version === undefined) delete m.schema.version;
        else m.schema.version = version;
        m.schema.mediaType = "producer description";
      } });
      const report = await verifyTapVideoLocally(artifact.bytes);
      expect(report.status).toBe("valid");
      expect(report.serverRequest).not.toBeNull();
      expect(report.expected?.contentDigest).toMatchObject({
        metadataHash: { mediaType: "application/vnd.tapnap.video-manifest.payload+json;version=1" }
      });
      if (version === 2) {
        const marker = encoder.encode('"version":2');
        const offset = artifact.bytes.findIndex((_, index) => marker.every((byte, relative) => artifact.bytes[index + relative] === byte));
        expect(offset).toBeGreaterThan(0);
        const altered = artifact.bytes.slice();
        altered[offset + marker.length - 1] = 0x33;
        const changed = await verifyTapVideoLocally(altered);
        expect(changed.status).toBe("invalid");
        expect(changed.serverRequest).toBeNull();
        expect(changed.checks).toContainEqual(expect.objectContaining({ id: "video-content-binding", status: "fail" }));
      }
    }
  });

  it("hashes raw payload bytes with whitespace, key order, numeric and string spellings intact", async () => {
    for (const payloadTextTransform of [
      (text: string) => JSON.stringify(JSON.parse(text), null, 2),
      (text: string) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(text)).reverse())),
      (text: string) => text.replace('"nominalFrameRate":1e+0', '"nominalFrameRate":1e400'),
      (text: string) => text.replace('"audioTrack"', '"\\u0061udioTrack"')
    ]) {
      const artifact = await makeArtifact({ payloadTextTransform, exactNumberToken: true });
      const report = await verifyTapVideoLocally(artifact.bytes);
      expect(report.status).toBe("valid");
      expect(report.recomputed?.metadataSHA256).toBe(await sha256Base64Url(encoder.encode(artifact.payloadText)));
    }
  });

  it("rejects ambiguous JSON, wrong binding identity and malformed proof framing", async () => {
    const duplicate = await makeArtifact({ payloadTextTransform: (text) => text.replace('"id":"synthetic-video"', '"id":"synthetic-video","id":"synthetic-video"') });
    const family = await makeArtifact({ mutateManifest: (m) => { m.schema.id = "unknown-binding"; } });
    const artifact = await makeArtifact();
    const badProof = artifact.bytes.slice();
    badProof[badProof.length - 1] = 1;
    for (const bytes of [duplicate.bytes, family.bytes, badProof, artifact.bytes.subarray(0, -1)]) {
      const report = await verifyTapVideoLocally(bytes);
      expect(report.status).toBe("invalid");
      expect(report.serverRequest).toBeNull();
      expect(classifyVideoReport(report)).not.toBe("noSignature");
    }
    expect(classifyVideoReport(await verifyTapVideoLocally(box("ftyp", encoder.encode("mp42"))))).toBe("noSignature");
  });

  it("ignores proof descriptions but still rejects altered binding or key identity", async () => {
    const description = await makeArtifact({ mutateProof: (proof) => { proof.createdAt = "another display time"; proof.extra = "description"; } });
    expect((await verifyTapVideoLocally(description.bytes)).serverRequest).not.toBeNull();
    for (const mutateProofValue of [
      (value: AnyRecord) => { value.contentDigest.assetHash.value = "changed"; },
      (value: AnyRecord) => { value.contentDigest.depthResource = { presence: "changed" }; },
      (value: AnyRecord) => { value.signingBinding.bodySHA256 = "changed"; },
      (value: AnyRecord) => { value.keyId = "another-key"; }
    ]) {
      const report = await verifyTapVideoLocally((await makeArtifact({ mutateProofValue })).bytes);
      expect(report.status).toBe("invalid");
      expect(report.serverRequest).toBeNull();
    }
  });

  it("does not require finalized MP4 facts, supported audio, or edit semantics to verify bytes", async () => {
    const cases: ArtifactOptions[] = [
      { actualRGBCodec: "hvc1", actualRGBTrackID: 9 },
      { actualMovieTimeScale: 1000, actualMovieDuration: 599 },
      { withAudio: true, actualAudioCodec: "alac" },
      { withAudio: true, audioDescriptor: new Uint8Array([255]) },
      { withAudio: true, audioDescriptor: audioDescriptor(new Uint8Array([0x29, 0x90])) },
      { includeMetadataTrack: true },
      { depthFrames: [{}], actualDepthCodec: "mett", actualDepthDuration: 599 },
      { depthFrames: [{}, {}], trackEdits: { depth: trackEdit(200, 400) } }, // First sample is fully clipped.
      { depthFrames: [{}], trackEdits: { depth: trackEditList([[60, -1], [60, -1], [480, 0]]) } },
      { depthFrames: [{}], trackEdits: { depth: trackEdit(600, 0, 0, 0) } },
      { depthFrames: [{}, {}], actualDepthDuration: 0 }
    ];
    for (const options of cases) {
      const report = await verifyTapVideoLocally((await makeArtifact(options)).bytes);
      expect(report.status).toBe("valid");
      expect(report.serverRequest).not.toBeNull();
      expect(report.checks.every((check) => check.status === "pass")).toBe(true);
    }
  });

  it("retains duplicate and regressing PTS and FRAM as separate depth samples", async () => {
    const artifact = await makeArtifact({ depthFrames: [
      { fram: 7, ptsValue: 600n }, { fram: 7, ptsValue: 0n }, { fram: 1, ptsValue: 0n }, { fram: 9, ptsValue: -1n }
    ] });
    expect((await verifyTapVideoLocally(artifact.bytes)).serverRequest).not.toBeNull();
    const frames = inspectTapVideoDepth(artifact.bytes).depthFrames;
    expect(frames.map((frame) => frame.frameIndex)).toEqual([7, 7, 1, 9]);
    expect(frames.map((frame) => frame.presentationTimeSeconds)).toEqual([1, 0, 0, -1 / 600]);
  });

  it("keeps KLV framing and calibration decoding failures local to depth inspection", async () => {
    const cases: ArtifactOptions[] = [
      { depthFrames: [{ duplicateTVER: true }] }, { depthFrames: [{ omitDPTH: true }] },
      { depthFrames: [{ nonZeroPadding: true }] }, { depthFrames: [{ extraUnknownRecords: 27 }] },
      { depthFrames: [{}], metadataKey: "com.example.other" },
      { depthFrames: [{ cali: null, cald: new Uint8Array([255]) }] },
      { depthFrames: [{ cali: null, cald: new Uint8Array(3073) }] },
      { depthFrames: [{ cali: 0, cald: encoder.encode(canonical({ calibration: cameraCalibration(), schemaVersion: 1 })) }] }
    ];
    for (const options of cases) {
      const artifact = await makeArtifact(options);
      expect((await verifyTapVideoLocally(artifact.bytes)).serverRequest).not.toBeNull();
      expect(() => inspectTapVideoDepth(artifact.bytes)).toThrow();
    }
  });

  it("decodes bounded raw, zstd1 and LZFSE frames independently of verification", async () => {
    const cases: ArtifactOptions[] = [
      { depthFrames: [{}] },
      { depthFrames: [{ compression: "zstd1", payload: ZSTD_PAYLOAD, ulen: 40 }] },
      { depthFrames: [{ compression: "lzfse", payload: LZFSE_ZERO_4096, ulen: 4096 }] }
    ];
    for (const options of cases) {
      const artifact = await makeArtifact(options);
      expect((await verifyTapVideoLocally(artifact.bytes)).status).toBe("valid");
      const frame = inspectTapVideoDepth(artifact.bytes).depthFrames[0];
      expect((await decodeTapDepthFrame(frame)).byteLength).toBe(frame.uncompressedByteCount);
    }
    for (const frameOptions of [
      { ulen: 8 }, { compression: "lzfse" as const, payload: new Uint8Array([1]) }, { ulen: 32 * 1024 * 1024 + 1 }
    ]) {
      const artifact = await makeArtifact({ depthFrames: [frameOptions] });
      expect((await verifyTapVideoLocally(artifact.bytes)).serverRequest).not.toBeNull();
      await expect(decodeTapDepthFrame(inspectTapVideoDepth(artifact.bytes).depthFrames[0])).rejects.toThrow();
    }
  });

  it("retains inline calibration without requiring calibration coverage agreement", async () => {
    const calibration = cameraCalibration();
    const artifact = await makeArtifact({ depthFrames: [{ cali: 7 }, { cali: null, cald: encoder.encode(canonical({ calibration, schemaVersion: 1 })) }] });
    expect((await verifyTapVideoLocally(artifact.bytes)).status).toBe("valid");
    const frames = inspectTapVideoDepth(artifact.bytes).depthFrames;
    expect(frames[0].calibrationIndex).toBe(7);
    expect(frames[1].inlineCalibration).toEqual(calibration);
  });

  it("keeps unsupported display transforms a rendering concern", () => {
    expect(tapVideoDisplayOrientation("identity")).toBe("up");
    expect(() => tapVideoDisplayOrientation("rotation:450;mirrored")).toThrow("Unsupported");
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

describe("registered depth presentation", () => {
  const rgba = new Uint8ClampedArray([1, 2, 3, 4, 5, 6].flatMap((value) => [value, 0, 0, 255]));
  const cases = [
    [0, false, [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]],
    [0, true, [3, 2, 1, 6, 5, 4], [3, 2, 1, 6, 5, 4]],
    [90, false, [4, 1, 5, 2, 6, 3], [4, 1, 5, 2, 6, 3]],
    [90, true, [1, 4, 2, 5, 3, 6], [6, 3, 5, 2, 4, 1]],
    [180, false, [6, 5, 4, 3, 2, 1], [6, 5, 4, 3, 2, 1]],
    [180, true, [4, 5, 6, 1, 2, 3], [4, 5, 6, 1, 2, 3]],
    [270, false, [3, 6, 2, 5, 1, 4], [3, 6, 2, 5, 1, 4]],
    [270, true, [6, 3, 5, 2, 4, 1], [1, 4, 2, 5, 3, 6]]
  ] as const;

  it.each(cases)("maps asymmetric pixels at rotation %i, mirrored %s without changing legacy display", (rotation, mirrored, registeredPixels, legacyPixels) => {
    const descriptor = registrationDescriptor(rotation, mirrored);
    const registered = registerTapDepthPixels(rgba, 3, 2, descriptor);
    const legacy = orientTapDepthPixels(rgba, 3, 2, `rotation:${rotation}${mirrored ? ";mirrored" : ""}`);
    expect(redChannels(registered.rgba)).toEqual(registeredPixels);
    expect(redChannels(legacy.rgba)).toEqual(legacyPixels);
    expect([registered.width, registered.height]).toEqual(rotation % 180 === 0 ? [3, 2] : [2, 3]);
  });

  it("applies pixel-center affine scaling before rotation, encoded mirroring, and aperture cropping", () => {
    const descriptor = registrationDescriptor(90, true);
    descriptor.alignedRGBCodedDimensions = { width: 6, height: 4 };
    descriptor.encodedRGBCodedDimensions = { width: 4, height: 6 };
    descriptor.depthToAlignedRGBPixelCenterAffine = [2, 0, 0.5, 0, 2, 0.5];
    descriptor.rgbCleanAperture = { x: 2, y: 2, width: 2, height: 4 };
    const projected = registerTapDepthPixels(rgba, 3, 2, descriptor);
    expect([projected.width, projected.height, ...redChannels(projected.rgba)]).toEqual([1, 2, 5, 6]);
  });

  it("uses the full affine and leaves unmapped aperture pixels transparent", () => {
    const descriptor = registrationDescriptor(0, false);
    descriptor.depthToAlignedRGBPixelCenterAffine = [1, 1, 0, 0, 1, 0];
    const projected = registerTapDepthPixels(rgba, 3, 2, descriptor);
    expect(redChannels(projected.rgba)).toEqual([1, 2, 3, 0, 4, 5]);
    expect(projected.rgba[3 * 4 + 3]).toBe(0);
  });

  it("rejects inconsistent or non-invertible registered geometry instead of falling back to legacy", () => {
    const descriptor = registrationDescriptor(90, true);
    expect(() => registerTapDepthPixels(rgba, 3, 2, { ...descriptor, isEncodedHorizontallyMirrored: false })).toThrow("Invalid");
    expect(() => registerTapDepthPixels(rgba, 3, 2, { ...descriptor, depthToAlignedRGBPixelCenterAffine: [1, 1, 0, 1, 1, 0] })).toThrow("invertible");
    expect(() => registerTapDepthPixels(rgba, 3, 2, { ...descriptor, rgbCleanAperture: { x: 0, y: 0, width: 3, height: 3 } })).toThrow("Invalid");
  });

  it("renders registered playback from the descriptor while keeping historical display-only pixels", () => {
    vi.stubGlobal("ImageData", class {
      data: Uint8ClampedArray;
      constructor(public width: number, public height: number) { this.data = new Uint8ClampedArray(width * height * 4); }
    });
    try {
      const putImageData = vi.fn();
      const canvas = { width: 0, height: 0, getContext: () => ({ putImageData }) } as unknown as HTMLCanvasElement;
      const bytes = new Uint8Array(new Float32Array([1, 2, 3, 4, 5, 6]).buffer);
      const format = { width: 3, height: 2, kind: "depth", pixelFormat: "fdep", packedRowStride: 12, bytesPerSample: 4, byteOrder: "little-endian", uncompressedFrameByteCount: 24 };
      renderTapDepthFrame(bytes, format, canvas);
      const original = (putImageData.mock.calls[0][0] as ImageData).data;
      renderTapDepthFrame(bytes, format, canvas, "rotation:90;mirrored", { status: "registered", descriptor: registrationDescriptor(90, true) });
      const registered = (putImageData.mock.calls[1][0] as ImageData).data;
      expect(Array.from(registered)).toEqual([0, 3, 1, 4, 2, 5].flatMap((index) => Array.from(original.slice(index * 4, index * 4 + 4))));
      renderTapDepthFrame(bytes, format, canvas, "rotation:90;mirrored", { status: "unavailable" });
      const legacy = (putImageData.mock.calls[2][0] as ImageData).data;
      expect(Array.from(legacy)).toEqual([5, 2, 4, 1, 3, 0].flatMap((index) => Array.from(original.slice(index * 4, index * 4 + 4))));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function registrationDescriptor(rotation: number, mirrored: boolean): TapVideoRegistrationDescriptor {
  const encoded = rotation % 180 === 0 ? { width: 3, height: 2 } : { width: 2, height: 3 };
  return {
    alignedRGBCodedDimensions: { width: 3, height: 2 },
    encodedRGBCodedDimensions: encoded,
    depthDimensions: { width: 3, height: 2 },
    depthToAlignedRGBPixelCenterAffine: [1, 0, 0, 0, 1, 0],
    connectionTransform: `rotation:${rotation};${mirrored ? "mirrored" : "not-mirrored"}`,
    isEncodedHorizontallyMirrored: mirrored,
    rgbCleanAperture: { x: 0, y: 0, ...encoded }
  };
}

type AnyRecord = Record<string, any>;

interface FrameOptions {
  fram?: number;
  ptsValue?: bigint;
  ptsTimescale?: number;
  compression?: "raw" | "zstd1" | "lzfse";
  ulen?: number;
  cali?: number | null;
  cald?: Uint8Array;
  payload?: Uint8Array;
  localKeyID?: number;
  nonZeroPadding?: boolean;
  duplicateTVER?: boolean;
  duplicateCALD?: boolean;
  omitDPTH?: boolean;
  extraUnknownRecords?: number;
}

interface ArtifactOptions {
  mutateProof?: (proof: AnyRecord) => void;
  mutateProofValue?: (value: AnyRecord) => void;
  depthResource?: unknown;
  telemetryBoxes?: Uint8Array[];
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
  actualDepthTimeScale?: number;
  trackEdits?: Partial<Record<"rgb" | "audio" | "depth", Uint8Array>>;
  withAudio?: boolean;
  actualAudioCodec?: string;
  audioDescriptor?: Uint8Array;
  exactNumberToken?: boolean;
  payloadTextTransform?: (payload: string) => string;
  mutateManifest?: (manifest: AnyRecord) => void;
}

function classifyVideoReport(local: LocalVerificationReport) {
  return classifyResult({
    fileName: "capture.mp4",
    fileSize: 0,
    finalStatus: "invalid",
    local,
    server: null,
    serverError: null,
    serverBoundary: { status: "not-run", summary: "Local validation failed." }
  });
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
    timeScale: 600, duration: 600, sampleSizes: [rgbSample.length], chunkOffset: rgbOffset, width: 4, height: 4, edit: options.trackEdits?.rgb
  })];
  if (options.withAudio) {
    tracks.push(makeTrack({
      id: 3, handler: "soun", codec: options.actualAudioCodec ?? "mp4a", timeScale: 48_000,
      duration: 48_000, sampleSizes: [audioSample.length], chunkOffset: audioOffset, audioDescriptor: options.audioDescriptor, edit: options.trackEdits?.audio
    }));
  }
  if (metadataTrackPresent) {
    tracks.push(makeTrack({
      id: 2, handler: "meta", codec: options.actualDepthCodec ?? "mebx", timeScale: options.actualDepthTimeScale ?? 600, edit: options.trackEdits?.depth,
      duration: options.actualDepthDuration ?? 600, sampleSizes: depthSamples.length > 0 ? depthSamples.map((sample) => sample.length) : [8],
      chunkOffset: depthOffset, sampleDelta: Math.floor((options.actualDepthDuration ?? 600) / Math.max(1, depthSamples.length)),
      metadataKey: options.metadataKey ?? "com.tapnap.depth.klv", metadataLocalKeyID: options.metadataLocalKeyID ?? 3
    }));
  }
  const moov = box("moov", concat(makeMovieHeader(options.actualMovieTimeScale ?? 600, options.actualMovieDuration ?? 600), ...tracks));
  const prefix = concat(ftyp, mdat, moov, manifestBox,
    ...(options.telemetryBoxes ?? []).map((payload) => uuidBox("TAPCAMTELEMETRY1", payload)));
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
    depthResource: "depthResource" in options ? options.depthResource : {
      binding: manifest.payload.depthCoverage?.sampleCount > 0 ? "covered-by-assetHash" : "coverage-recorded-in-manifest",
      interpretation: "not-part-of-base-signature", platformPresenceCheck: "TAPVideoManifest.depthCoverage",
      presence: manifest.payload.depthCoverage?.sampleCount > 0 ? "captured" : "no-samples"
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
  options.mutateProofValue?.(proofValue);
  const proofEnvelope = {
    algorithm: "TAPCam.AppAttestCaptureSignature.v1", createdAt: manifest.payload.capturedAt, keyID: "synthetic-key",
    type: "appAttestAssertion", value: toBase64Url(encoder.encode(canonical(proofValue)))
  };
  options.mutateProof?.(proofEnvelope);
  const proofPayload = new Uint8Array(60 * 1024);
  proofPayload.set(encoder.encode("TAPCAM-PROOF-SLOT-V1"), 0);
  proofPayload.set(u32(1), 24);
  const envelopeBytes = encoder.encode(canonical(proofEnvelope));
  proofPayload.set(u32(envelopeBytes.length), 28);
  proofPayload.set(envelopeBytes, 32);
  return { bytes: concat(prefix, uuidBox("TAPCAMPROOFSLOT1", proofPayload)), payloadText };
}

function captureTelemetry(): AnyRecord {
  return {
    schema: { id: "urn:tapnap:tapcam:video-capture-telemetry:v1", version: 1, mediaType: "application/vnd.tapnap.video-capture-telemetry+json;version=1" },
    filtering: { requestedEnabled: false, filteredSampleCount: 0, unfilteredSampleCount: 0 },
    motion: {
      status: "available", referenceFrame: "xArbitraryZVertical", deviceCoordinateSystem: "core-motion-device-right-handed",
      timeBase: "capture-relative-seconds", motionToCaptureOffsetSeconds: -100, sampleIntervalSeconds: 1 / 30,
      droppedSampleCount: 0, errorCount: 0,
      samples: [{ ptsSeconds: 0.1, quaternion: [0, 0, 0, 1], rotationRate: [0, 0, 0], gravity: [0, -1, 0], userAcceleration: [0, 0, 0] }]
    }
  };
}

function cameraCalibration(): AnyRecord {
  return {
    intrinsicMatrix: [1, 0, 0, 0, 1, 0, 1, 1, 1], intrinsicMatrixReferenceDimensions: { width: 2, height: 1 },
    extrinsicMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], pixelSizeMillimeters: 0.001,
    lensDistortionCenter: { x: 1, y: 0.5 }
  };
}

function baseManifest(hasDepth: boolean, frames: FrameOptions[], format: AnyRecord, withAudio: boolean): AnyRecord {
  const indexed = hasDepth ? frames.filter((frame) => frame.cali !== null).length : 0;
  const calibration = cameraCalibration();
  return {
    schema: { id: "urn:tapnap:tapcam:video-manifest:v1", version: 1, mediaType: "application/vnd.tapnap.video-manifest+json;version=1" },
    payload: {
      id: "synthetic-video", packageID: "00000000-0000-0000-0000-000000000001", capturedAt: "2026-08-13T00:00:00.000Z",
      selectedCameraPlan: { position: "back", depthCapable: hasDepth },
      container: { fileType: "mp4", mediaType: "video/mp4", durationSeconds: 1, timeScale: 600, trackCount: 1 + (hasDepth ? 1 : 0) + (withAudio ? 1 : 0) },
      rgbTrack: { trackID: 1, codec: "avc1", width: 4, height: 4, durationSeconds: 1, timeScale: 600, nominalFrameRate: 1, frameCount: 1, transform: "rotation:90;mirrored" },
      audioTrack: withAudio
        ? { status: "captured", trackID: 3, codec: "aac ", durationSeconds: 1, timeScale: 48_000, sampleRate: 48_000, channelCount: 2 }
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
    ...(frame.cald ? [record("CALD", frame.cald), ...(frame.duplicateCALD ? [record("CALD", frame.cald)] : [])] : []),
    ...Array.from({ length: frame.extraUnknownRecords ?? 0 }, (_, extra) => record(`X${String(extra).padStart(3, "0")}`, new Uint8Array())),
    ...(frame.omitDPTH ? [] : [record("DPTH", payload)])
  ];
  const klv = concat(...records);
  return concat(u32(klv.length + 8), u32(frame.localKeyID ?? 3), klv);
}

interface TrackOptions {
  id: number; handler: "vide" | "soun" | "meta"; codec: string; timeScale: number; duration: number;
  sampleSizes: number[]; chunkOffset: number; sampleDelta?: number; width?: number; height?: number;
  metadataKey?: string; metadataLocalKeyID?: number; audioDescriptor?: Uint8Array; edit?: Uint8Array;
}

function makeTrack(options: TrackOptions): Uint8Array {
  const tkhd = fullBox("tkhd", concat(u32(0), u32(0), u32(options.id)));
  const mdhd = fullBox("mdhd", concat(u32(0), u32(0), u32(options.timeScale), u32(options.duration), u32(0)));
  const hdlr = fullBox("hdlr", concat(u32(0), encoder.encode(options.handler), new Uint8Array(12)));
  const sampleEntry = options.handler === "vide"
    ? videoSampleEntry(options.codec, options.width ?? 4, options.height ?? 4)
    : options.handler === "soun" ? audioSampleEntry(options.codec, options.audioDescriptor)
      : metadataSampleEntry(options.codec, options.metadataLocalKeyID ?? 3, options.metadataKey ?? "com.tapnap.depth.klv");
  const stsd = fullBox("stsd", concat(u32(1), sampleEntry));
  const stts = fullBox("stts", concat(u32(1), u32(options.sampleSizes.length), u32(options.sampleDelta ?? options.duration)));
  const stsz = fullBox("stsz", concat(u32(0), u32(options.sampleSizes.length), ...options.sampleSizes.map(u32)));
  const stsc = fullBox("stsc", concat(u32(1), u32(1), u32(options.sampleSizes.length), u32(1)));
  const stco = fullBox("stco", concat(u32(1), u32(options.chunkOffset)));
  return box("trak", concat(tkhd, ...(options.edit ? [box("edts", options.edit)] : []), box("mdia", concat(mdhd, hdlr, box("minf", box("stbl", concat(stsd, stts, stsz, stsc, stco)))))));
}

function trackEdit(duration: number, mediaStart: number, version = 0, rate = 0x00010000): Uint8Array {
  return trackEditList([[duration, mediaStart, rate]], version);
}

function trackEditList(entries: Array<[duration: number, mediaStart: number, rate?: number]>, version = 0): Uint8Array {
  return box("elst", concat(new Uint8Array([version, 0, 0, 0]), u32(entries.length),
    ...entries.map(([duration, mediaStart, rate = 0x00010000]) => concat(
      version === 1 ? concat(i64(BigInt(duration)), i64(BigInt(mediaStart))) : concat(u32(duration), i32(mediaStart)), u32(rate)))));
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

function audioSampleEntry(codec: string, descriptor = audioDescriptor(new Uint8Array([0x11, 0x90]))): Uint8Array {
  const payload = new Uint8Array(28);
  const view = new DataView(payload.buffer);
  view.setUint16(6, 1, false); view.setUint16(16, 2, false); view.setUint16(18, 16, false); view.setUint32(24, 48_000 * 65_536, false);
  return box(codec, concat(payload, ...(codec === "mp4a" ? [fullBox("esds", descriptor)] : [])));
}

function audioDescriptor(config: Uint8Array, objectType = 0x40): Uint8Array {
  const descriptor = (tag: number, payload: Uint8Array) => concat(new Uint8Array([tag, payload.length]), payload);
  return descriptor(3, concat(new Uint8Array(3), descriptor(4, concat(new Uint8Array([objectType, 0x14]), new Uint8Array(11), descriptor(5, config))), descriptor(6, new Uint8Array([2]))));
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

function packageVideo(video: Uint8Array): Uint8Array {
  return zipSync({
    "original-video.mp4": video,
    "tapcam-export.json": encoder.encode(JSON.stringify({
      schemaID: "urn:tapnap:tapcam:verification-export:v1",
      version: 1,
      packageKind: "tapVideo",
      resources: [{ role: "primaryVideo", filename: "original-video.mp4", mediaType: "public.mpeg-4" }],
      warningLabels: [],
      warnings: [],
      trustBoundary: "This sidecar is not signed. Verify original video bytes against the TAP signature embedded in the video."
    }))
  }, { level: 0 });
}
