import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  resolveCaptureInput,
  TAPNAP_CAPTURE_PACKAGE_MIME_TYPE
} from "./captureInput";

const textEncoder = new TextEncoder();

function verificationSidecar(
  packageKind: "stillPhoto" | "livePhotoPackage",
  resources: Array<{ role: string; filename: string; mediaType: string }>
): Uint8Array {
  return textEncoder.encode(
    JSON.stringify({
      schemaID: "urn:tapnap:tapcam:verification-export:v1",
      version: 1,
      packageKind,
      resources
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
