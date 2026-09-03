import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  resolveCaptureInput,
  TAPNAP_CAPTURE_PACKAGE_MIME_TYPE
} from "./captureInput";

const textEncoder = new TextEncoder();
const trustBoundary =
  "This sidecar is not signed. Verify primary photo and paired video bytes against the TAP signature embedded in the photo.";

function verificationSidecar(
  packageKind: "stillPhoto" | "livePhotoPackage",
  resources: Array<{ role: string; filename: string; mediaType: string }>
): Uint8Array {
  return textEncoder.encode(
    JSON.stringify({
      schemaID: "urn:tapnap:tapcam:verification-export:v1",
      version: 1,
      packageKind,
      resources,
      warningLabels: [],
      warnings: [],
      trustBoundary
    })
  );
}

describe("resolveCaptureInput", () => {
  it("recognizes a raw MP4 as TAP Video input without routing it through ZIP parsing", () => {
    const bytes = new Uint8Array([
      0, 0, 0, 20,
      0x66, 0x74, 0x79, 0x70,
      0x6d, 0x70, 0x34, 0x32,
      0, 0, 0, 0,
      0x6d, 0x70, 0x34, 0x32
    ]);
    const file = new File([bytes], "tap-video.mp4", { type: "video/mp4" });

    const input = resolveCaptureInput(file, bytes);

    expect(input.kind).toBe("tap-video");
    if (input.kind !== "tap-video") throw new Error("expected TAP Video input");
    expect(input.videoFile).toBe(file);
    expect(Array.from(input.videoBytes)).toEqual(Array.from(bytes));
  });

  it.each([
    ["capture.HEIC", "image/heic"],
    ["capture.heif", "image/heif"],
    ["capture.JPG", "image/jpeg"],
    ["capture.jpeg", "image/jpeg"]
  ])("keeps raw photo %s as the verification photo", (fileName, mediaType) => {
    const bytes = new Uint8Array([1, 2, 3]);
    const file = new File([bytes], fileName, { type: mediaType });

    const input = requirePhotoInput(resolveCaptureInput(file, bytes));

    expect(input.kind).toBe("single-photo");
    expect(input.fileName).toBe(fileName);
    expect(input.photoFile).toBe(file);
    expect(Array.from(input.photoBytes)).toEqual([1, 2, 3]);
    expect(input.pairedVideoBytes).toBeUndefined();
  });

  it("extracts a Live Photo .tapnap package using sidecar resource roles", () => {
    const photo = new Uint8Array([10, 11, 12]);
    const movie = new Uint8Array([20, 21, 22, 23]);
    const zipBytes = zipSync({
      "signed-capture.heic": photo,
      "signed-motion.mov": movie,
      "tapcam-export.json": verificationSidecar("livePhotoPackage", [
        { role: "primaryPhoto", filename: "signed-capture.heic", mediaType: "public.heic" },
        {
          role: "pairedLivePhotoVideo",
          filename: "signed-motion.mov",
          mediaType: "com.apple.quicktime-movie"
        }
      ])
    });
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", {
      type: "application/octet-stream"
    });

    const input = requirePhotoInput(resolveCaptureInput(file, zipBytes));

    expect(input.kind).toBe("capture-package");
    expect(input.fileName).toBe("TAPNAP-Capture.tapnap");
    expect(input.photoFile.name).toBe("signed-capture.heic");
    expect(input.photoFile.type).toBe("image/heic");
    expect(Array.from(input.photoBytes)).toEqual([10, 11, 12]);
    expect(input.pairedVideoName).toBe("signed-motion.mov");
    expect(Array.from(input.pairedVideoBytes ?? [])).toEqual([20, 21, 22, 23]);
  });

  it("does not route legacy ZIP markers as TAPNAP", () => {
    const zipBytes = zipSync({
      "primary-photo.heic": new Uint8Array([40]),
      "tapcam-export.json": verificationSidecar("stillPhoto", [
        { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
      ])
    });

    for (const [fileName, mediaType] of [
      ["legacy.zip", "application/octet-stream"],
      ["shared-file.bin", "application/zip"],
      ["shared-file.bin", "application/octet-stream"]
    ]) {
      const file = new File([zipBytes], fileName, { type: mediaType });
      expect(() => resolveCaptureInput(file, zipBytes)).toThrow();
    }
  });

  it("accepts a still-photo package through the TAPNAP MIME type", () => {
    const zipBytes = zipSync({
      "primary-photo.jpg": new Uint8Array([50]),
      "tapcam-export.json": verificationSidecar("stillPhoto", [
        { role: "primaryPhoto", filename: "primary-photo.jpg", mediaType: "public.jpeg" }
      ])
    });
    const file = new File([zipBytes], "shared-file", {
      type: TAPNAP_CAPTURE_PACKAGE_MIME_TYPE
    });

    const input = requirePhotoInput(resolveCaptureInput(file, zipBytes));

    expect(input.kind).toBe("capture-package");
    expect(input.photoFile.name).toBe("primary-photo.jpg");
    expect(input.photoFile.type).toBe("image/jpeg");
    expect(input.pairedVideoName).toBeUndefined();
    expect(input.pairedVideoBytes).toBeUndefined();
  });

  it("accepts string-array presentation warnings without treating them as evidence", () => {
    const sidecar = JSON.parse(new TextDecoder().decode(verificationSidecar("stillPhoto", [
      { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
    ])));
    sidecar.warningLabels = ["adjustment-data", "thumbnail"];
    sidecar.warnings = ["Photos presentation resources detected."];
    const zipBytes = zipSync({
      "primary-photo.heic": new Uint8Array([1]),
      "tapcam-export.json": textEncoder.encode(JSON.stringify(sidecar))
    });

    expect(requirePhotoInput(resolveTapnap(zipBytes)).kind).toBe("capture-package");
  });

  it("rejects missing or invalid current-v1 sidecars and resources", () => {
    const invalidPackages: Array<Record<string, Uint8Array>> = [
      { "primary-photo.heic": new Uint8Array([80]) },
      {
        "primary-photo.heic": new Uint8Array([80]),
        "tapcam-export.json": textEncoder.encode(
          JSON.stringify({
            schemaID: "urn:tapnap:tapcam:verification-export:v1",
            version: 1,
            resources: [
              { role: "primaryPhoto", filename: "primary-photo.heic" },
              {}
            ]
          })
        )
      },
      {
        "primary-photo.heic": new Uint8Array([80]),
        "tapcam-export.json": textEncoder.encode(
          JSON.stringify({
            schemaID: "urn:tapnap:tapcam:verification-export:v2",
            version: 2,
            resources: [
              { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
            ]
          })
        )
      },
      {
        "not-a-photo.mov": new Uint8Array([81]),
        "tapcam-export.json": verificationSidecar("stillPhoto", [
          { role: "primaryPhoto", filename: "not-a-photo.mov", mediaType: "public.heic" }
        ])
      },
      {
        "paired-video.mov": new Uint8Array([82]),
        "tapcam-export.json": verificationSidecar("livePhotoPackage", [
          { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" },
          {
            role: "pairedLivePhotoVideo",
            filename: "paired-video.mov",
            mediaType: "com.apple.quicktime-movie"
          }
        ])
      },
      {
        "primary-photo.heic": new Uint8Array([83]),
        "alternate.heic": new Uint8Array([84]),
        "tapcam-export.json": verificationSidecar("stillPhoto", [
          { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" },
          { role: "primaryPhoto", filename: "alternate.heic", mediaType: "public.heic" }
        ])
      },
      {
        "primary-photo.heic": new Uint8Array([85]),
        "paired-video.mov": new Uint8Array([86]),
        "alternate.mov": new Uint8Array([87]),
        "tapcam-export.json": verificationSidecar("livePhotoPackage", [
          { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" },
          {
            role: "pairedLivePhotoVideo",
            filename: "paired-video.mov",
            mediaType: "com.apple.quicktime-movie"
          },
          {
            role: "pairedLivePhotoVideo",
            filename: "alternate.mov",
            mediaType: "com.apple.quicktime-movie"
          }
        ])
      }
    ];

    for (const entries of invalidPackages) {
      const zipBytes = zipSync(entries);
      const file = new File([zipBytes], "TAPNAP-Capture.tapnap", { type: "" });

      expect(() => resolveCaptureInput(file, zipBytes)).toThrow();
    }
  });

  it("rejects missing, mistyped, unknown, or authenticity-bearing sidecar fields", () => {
    const valid = {
      schemaID: "urn:tapnap:tapcam:verification-export:v1",
      version: 1,
      packageKind: "stillPhoto",
      resources: [
        { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
      ],
      warningLabels: [],
      warnings: [],
      trustBoundary
    };
    const invalidSidecars = [
      { ...valid, packageKind: undefined },
      { ...valid, version: "1" },
      { ...valid, warningLabels: "adjusted" },
      { ...valid, trustBoundary: "signed routing metadata" },
      { ...valid, signingBinding: {} },
      {
        ...valid,
        resources: [{ ...valid.resources[0], digest: "unsigned" }]
      }
    ];

    for (const sidecar of invalidSidecars) {
      const zipBytes = zipSync({
        "primary-photo.heic": new Uint8Array([1]),
        "tapcam-export.json": textEncoder.encode(JSON.stringify(sidecar))
      });
      expect(() => resolveTapnap(zipBytes)).toThrow();
    }
  });

  it("rejects package-kind, role, ordering, media-type, and path mismatches", () => {
    const invalidPackages: Array<Record<string, Uint8Array>> = [
      {
        "primary-photo.heic": new Uint8Array([1]),
        "tapcam-export.json": verificationSidecar("livePhotoPackage", [
          { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
        ])
      },
      {
        "primary-photo.heic": new Uint8Array([1]),
        "paired-video.mov": new Uint8Array([2]),
        "tapcam-export.json": verificationSidecar("stillPhoto", [
          { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" },
          {
            role: "pairedLivePhotoVideo",
            filename: "paired-video.mov",
            mediaType: "com.apple.quicktime-movie"
          }
        ])
      },
      {
        "primary-photo.heic": new Uint8Array([1]),
        "paired-video.mov": new Uint8Array([2]),
        "tapcam-export.json": verificationSidecar("livePhotoPackage", [
          {
            role: "pairedLivePhotoVideo",
            filename: "paired-video.mov",
            mediaType: "com.apple.quicktime-movie"
          },
          { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
        ])
      },
      {
        "primary-photo.heic": new Uint8Array([1]),
        "tapcam-export.json": verificationSidecar("stillPhoto", [
          { role: "tapDepthManifestPayload", filename: "primary-photo.heic", mediaType: "public.heic" }
        ])
      },
      {
        "primary-photo.jpg": new Uint8Array([1]),
        "tapcam-export.json": verificationSidecar("stillPhoto", [
          { role: "primaryPhoto", filename: "primary-photo.jpg", mediaType: "public.heic" }
        ])
      },
      {
        "nested/primary-photo.heic": new Uint8Array([1]),
        "tapcam-export.json": verificationSidecar("stillPhoto", [
          { role: "primaryPhoto", filename: "nested/primary-photo.heic", mediaType: "public.heic" }
        ])
      }
    ];

    for (const entries of invalidPackages) {
      expect(() => resolveTapnap(zipSync(entries))).toThrow();
    }
  });

  it("rejects malformed ZIP magic, versions, headers, and lengths", () => {
    const makePackage = () => zipSync({
      "primary-photo.heic": new Uint8Array([1, 2, 3]),
      "tapcam-export.json": verificationSidecar("stillPhoto", [
        { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
      ])
    });

    const invalidMagic = makePackage().slice();
    invalidMagic[0] = 0;

    const invalidVersion = makePackage().slice();
    writeUint16(invalidVersion, 4, 45);
    writeUint16(invalidVersion, findSignature(invalidVersion, 0x02014b50) + 6, 45);

    const invalidCentralHeader = makePackage().slice();
    invalidCentralHeader[findSignature(invalidCentralHeader, 0x02014b50)] = 0;

    const invalidLength = makePackage().slice();
    writeUint16(invalidLength, findSignature(invalidLength, 0x06054b50) + 20, 1);

    for (const bytes of [invalidMagic, invalidVersion, invalidCentralHeader, invalidLength]) {
      expect(() => resolveTapnap(bytes)).toThrow();
    }
  });

  it("rejects sidecars and declared resources beyond local size budgets", () => {
    const oversizedSidecar = verificationSidecar("stillPhoto", [
      { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
    ]);
    const paddedSidecar = new Uint8Array(256 * 1024 + 1);
    paddedSidecar.set(oversizedSidecar);
    expect(() => resolveTapnap(zipSync({
      "primary-photo.heic": new Uint8Array([1]),
      "tapcam-export.json": paddedSidecar
    }))).toThrow();

    const oversizedResource = zipSync({
      "primary-photo.heic": new Uint8Array([1]),
      "tapcam-export.json": oversizedSidecar
    });
    const centralHeader = findSignature(oversizedResource, 0x02014b50);
    writeUint32(oversizedResource, centralHeader + 24, 384 * 1024 * 1024 + 1);
    expect(() => resolveTapnap(oversizedResource)).toThrow();
  });

  it("rejects a non-UTF-8 routing sidecar", () => {
    const zipBytes = zipSync({
      "primary-photo.heic": new Uint8Array([1]),
      "tapcam-export.json": new Uint8Array([0xc3, 0x28])
    });
    expect(() => resolveTapnap(zipBytes)).toThrow();
  });

  it("rejects duplicate root sidecar archive entries", () => {
    const zipBytes = zipSync({
      "primary-photo.heic": new Uint8Array([1]),
      "tapcam-export.json": verificationSidecar("stillPhoto", [
        { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
      ]),
      "tapcam-export.jsox": new Uint8Array([1])
    });
    replaceAscii(zipBytes, "tapcam-export.jsox", "tapcam-export.json");

    expect(() => resolveTapnap(zipBytes)).toThrow();
  });

  it("rejects packages with excessive archive entries", () => {
    const entries: Record<string, Uint8Array> = {
      "primary-photo.heic": new Uint8Array([87]),
      "tapcam-export.json": verificationSidecar("stillPhoto", [
        { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" }
      ])
    };
    for (let index = 0; index < 15; index += 1) {
      entries[`ignored-${index}.txt`] = new Uint8Array([index]);
    }
    const zipBytes = zipSync(entries);
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", { type: "" });

    expect(() => resolveCaptureInput(file, zipBytes)).toThrow();
  });

  it("rejects non-ZIP bytes carrying current package markers", () => {
    for (const [fileName, mediaType] of [
      ["TAPNAP-Capture.tapnap", "application/octet-stream"],
      ["shared-file", TAPNAP_CAPTURE_PACKAGE_MIME_TYPE]
    ]) {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const file = new File([bytes], fileName, { type: mediaType });
      expect(() => resolveCaptureInput(file, bytes)).toThrow();
    }
  });
});

function requirePhotoInput(input: ReturnType<typeof resolveCaptureInput>) {
  if (input.kind === "tap-video") throw new Error("expected photo input");
  return input;
}

function resolveTapnap(bytes: Uint8Array) {
  return resolveCaptureInput(
    new File([new Uint8Array(bytes)], "TAPNAP-Capture.tapnap"),
    bytes
  );
}

function findSignature(bytes: Uint8Array, signature: number): number {
  for (let offset = 0; offset <= bytes.length - 4; offset += 1) {
    if (
      bytes[offset] === (signature & 0xff) &&
      bytes[offset + 1] === ((signature >>> 8) & 0xff) &&
      bytes[offset + 2] === ((signature >>> 16) & 0xff) &&
      bytes[offset + 3] === ((signature >>> 24) & 0xff)
    ) {
      return offset;
    }
  }
  throw new Error("ZIP signature not found in test fixture");
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function replaceAscii(bytes: Uint8Array, source: string, replacement: string): void {
  const sourceBytes = textEncoder.encode(source);
  const replacementBytes = textEncoder.encode(replacement);
  if (sourceBytes.length !== replacementBytes.length) throw new Error("test names must match");
  for (let offset = 0; offset <= bytes.length - sourceBytes.length; offset += 1) {
    if (sourceBytes.every((byte, index) => bytes[offset + index] === byte)) {
      bytes.set(replacementBytes, offset);
    }
  }
}
