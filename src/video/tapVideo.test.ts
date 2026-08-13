import { describe, expect, it } from "vitest";
import {
  decodeTapDepthFrame,
  inspectTapVideoDepth,
  orientTapDepthPixels,
  tapVideoDisplayOrientation,
  verifyTapVideoLocally
} from "./tapVideo";

const encoder = new TextEncoder();

describe("TAP Video browser support", () => {
  it("extracts a timed mebx KLV sample and preserves its presentation time", () => {
    const packedDepth = new Uint8Array([0x00, 0x3c, 0x00, 0x40]);
    const klv = concat(
      record("TVER", u32(2)),
      record("FRAM", u32(7)),
      record("PTS ", concat(i64(300n), i32(600))),
      record("COMP", encoder.encode("raw")),
      record("ULEN", u32(packedDepth.length)),
      record("DPTH", packedDepth)
    );
    const sample = concat(u32(klv.length + 8), u32(1), klv);
    const ftyp = box("ftyp", encoder.encode("mp42"));
    const mdat = box("mdat", sample);
    const sampleOffset = ftyp.length + 8;
    const track = box("trak", concat(
      fullBox("tkhd", concat(u32(0), u32(0), u32(2))),
      box("mdia", box("minf", box("stbl", concat(
        fullBox("stsz", concat(u32(0), u32(1), u32(sample.length))),
        fullBox("stsc", concat(u32(1), u32(1), u32(1), u32(1))),
        fullBox("stco", concat(u32(1), u32(sampleOffset)))
      ))))
    ));
    const manifest = makeManifest({
      trackID: 2,
      sampleCount: 1,
      format: {
        kind: "depth",
        pixelFormat: "hdep",
        width: 2,
        height: 1,
        packedRowStride: 4,
        sourceRowStride: 4,
        bytesPerSample: 2,
        byteOrder: "little-endian",
        uncompressedFrameByteCount: 4,
        compressionPolicy: "per-frame:raw"
      }
    });
    const bytes = concat(
      ftyp,
      mdat,
      box("moov", track),
      uuidBox("TAPCAMVIDEOMANF1", encoder.encode(canonical(manifest)))
    );

    const inspection = inspectTapVideoDepth(bytes);

    expect(inspection.depthFrames).toHaveLength(1);
    expect(inspection.depthFrames[0]).toMatchObject({
      frameIndex: 7,
      presentationTimeSeconds: 0.5,
      compression: "raw",
      uncompressedByteCount: 4
    });
    expect(Array.from(inspection.depthFrames[0].payload)).toEqual(Array.from(packedDepth));
  });

  it("decodes the contract zstd1 golden vector", async () => {
    const compressed = fromBase64("KLUv/SAo1QAAoFRBUF9ERVBUSF9WRUNUT1JfVjI6AQCOnkw=");
    const decoded = await decodeTapDepthFrame({
      frameIndex: 17,
      presentationTimeSeconds: 20.575,
      compression: "zstd1",
      uncompressedByteCount: 40,
      calibrationIndex: 0,
      payload: compressed
    });

    expect(new TextDecoder().decode(decoded)).toBe("TAP_DEPTH_VECTOR_V2:TAP_DEPTH_VECTOR_V2:");
  });

  it("maps every signed RGB transform to the matching depth display orientation", () => {
    expect([
      tapVideoDisplayOrientation("identity"),
      tapVideoDisplayOrientation("rotation:0;mirrored"),
      tapVideoDisplayOrientation("rotation:180"),
      tapVideoDisplayOrientation("rotation:180;mirrored"),
      tapVideoDisplayOrientation("rotation:270;mirrored"),
      tapVideoDisplayOrientation("rotation:90"),
      tapVideoDisplayOrientation("rotation:90;mirrored"),
      tapVideoDisplayOrientation("rotation:270")
    ]).toEqual([
      "up",
      "upMirrored",
      "down",
      "downMirrored",
      "leftMirrored",
      "right",
      "rightMirrored",
      "left"
    ]);
  });

  it("rotates and mirrors depth pixels with the signed RGB-track transform", () => {
    // Raw 3 x 2 grid, represented by the red channel:
    // 1 2 3
    // 4 5 6
    const rgba = new Uint8ClampedArray([
      1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255,
      4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255
    ]);

    const right = orientTapDepthPixels(rgba, 3, 2, "rotation:90");
    expect([right.width, right.height]).toEqual([2, 3]);
    expect(redChannels(right.rgba)).toEqual([4, 1, 5, 2, 6, 3]);

    const rightMirrored = orientTapDepthPixels(rgba, 3, 2, "rotation:90;mirrored");
    expect([rightMirrored.width, rightMirrored.height]).toEqual([2, 3]);
    expect(redChannels(rightMirrored.rgba)).toEqual([6, 3, 5, 2, 4, 1]);
  });

  it("verifies a synthetic v4 MP4 content binding and produces the server request", async () => {
    const manifest = makeManifest({ trackID: null, sampleCount: 0, format: null });
    const ftyp = box("ftyp", encoder.encode("mp42"));
    const manifestBox = uuidBox("TAPCAMVIDEOMANF1", encoder.encode(canonical(manifest)));
    const proofOffset = ftyp.length + manifestBox.length;
    const proofBoxLength = 8 + 16 + 60 * 1024;
    const finalByteCount = proofOffset + proofBoxLength;
    const assetValue = await sha256Base64Url(concat(ftyp, manifestBox));
    const metadataValue = await sha256Base64Url(encoder.encode(canonical(manifest.payload)));
    const contentDigest = {
      assetHash: {
        algorithm: "SHA-256",
        byteCount: finalByteCount,
        excludedRanges: [{ length: proofBoxLength, offset: proofOffset, reason: "tap-proof-slot" }],
        fileContainer: "mp4",
        kind: "c2pa-style-format-native-byte-ranges",
        value: assetValue
      },
      captureID: manifest.payload.id,
      capturedAt: manifest.payload.capturedAt,
      depthResource: {
        binding: "coverage-recorded-in-manifest",
        interpretation: "not-part-of-base-signature",
        platformPresenceCheck: "TAPVideoManifest.depthCoverage",
        presence: "no-samples"
      },
      manifestSchemaID: manifest.schema.id,
      metadataHash: {
        algorithm: "SHA-256",
        kind: "canonical-json",
        mediaType: "application/vnd.tapnap.video-manifest.payload+json;version=2",
        value: metadataValue
      },
      proofSlot: {
        kind: "bmff-uuid-proof-slot",
        length: proofBoxLength,
        offset: proofOffset,
        padding: "zero-filled-after-envelope",
        payloadLength: 60 * 1024,
        payloadOffset: proofOffset + 24
      },
      schemaID: "urn:tapnap:tapcam:content-binding:v4"
    };
    const signingBinding = {
      bodySHA256: await sha256Base64Url(encoder.encode(canonical(contentDigest))),
      captureID: manifest.payload.id,
      operation: "tapcam.capture.sign",
      schemaID: "urn:tapnap:tapcam:app-attest-capture-signing:v1"
    };
    const proofValue = {
      assertionObject: "synthetic-assertion",
      contentDigest,
      keyId: "synthetic-key",
      signingBinding
    };
    const proofEnvelope = {
      algorithm: "TAPCam.AppAttestCaptureSignature.v1",
      createdAt: manifest.payload.capturedAt,
      keyID: "synthetic-key",
      type: "appAttestAssertion",
      value: toBase64Url(encoder.encode(canonical(proofValue)))
    };
    const proofPayload = new Uint8Array(60 * 1024);
    proofPayload.set(encoder.encode("TAPCAM-PROOF-SLOT-V1"), 0);
    proofPayload.set(u32(1), 24);
    const envelopeBytes = encoder.encode(canonical(proofEnvelope));
    proofPayload.set(u32(envelopeBytes.length), 28);
    proofPayload.set(envelopeBytes, 32);
    const bytes = concat(ftyp, manifestBox, uuidBox("TAPCAMPROOFSLOT1", proofPayload));

    const report = await verifyTapVideoLocally(bytes);

    expect(report.status).toBe("valid");
    expect(report.mediaKind).toBe("video");
    expect(report.verificationScope).toBe("fullVideo");
    expect(report.checks.every((check) => check.status === "pass")).toBe(true);
    expect(report.serverRequest).toEqual({
      keyId: "synthetic-key",
      assertionObject: "synthetic-assertion",
      signingBinding
    });
  });
});

function makeManifest(depthCoverage: Record<string, unknown>) {
  return {
    schema: {
      id: "urn:tapnap:tapcam:video-manifest:v2",
      version: 2,
      mediaType: "application/vnd.tapnap.video-manifest+json;version=2"
    },
    payload: {
      id: "synthetic-video",
      packageID: "00000000-0000-0000-0000-000000000001",
      capturedAt: "2026-08-13T00:00:00Z",
      rgbTrack: { transform: "rotation:90;mirrored" },
      depthCoverage
    },
    proofs: []
  };
}

function redChannels(rgba: Uint8ClampedArray): number[] {
  const values: number[] = [];
  for (let index = 0; index < rgba.length; index += 4) values.push(rgba[index]);
  return values;
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return concat(u32(payload.length + 8), encoder.encode(type), payload);
}

function fullBox(type: string, body: Uint8Array): Uint8Array {
  return box(type, concat(new Uint8Array(4), body));
}

function uuidBox(userType: string, payload: Uint8Array): Uint8Array {
  return box("uuid", concat(encoder.encode(userType), payload));
}

function record(key: string, payload: Uint8Array): Uint8Array {
  const padding = new Uint8Array((4 - (payload.length % 4)) % 4);
  return concat(encoder.encode(key), u32(payload.length), payload, padding);
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function i32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, false);
  return bytes;
}

function i64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, false);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function canonical(value: unknown): string {
  return JSON.stringify(sort(value));
}

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

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}
