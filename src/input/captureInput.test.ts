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

    const input = resolveCaptureInput(file, bytes);

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
      "nested/signed-capture.heic": photo,
      "nested/signed-motion.mov": movie,
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
      type: TAPNAP_CAPTURE_PACKAGE_MIME_TYPE
    });

    const input = resolveCaptureInput(file, zipBytes);

    expect(input.kind).toBe("capture-package");
    expect(input.fileName).toBe("TAPNAP-Capture.tapnap");
    expect(input.photoFile.name).toBe("signed-capture.heic");
    expect(input.photoFile.type).toBe("image/heic");
    expect(Array.from(input.photoBytes)).toEqual([10, 11, 12]);
    expect(input.pairedVideoName).toBe("nested/signed-motion.mov");
    expect(Array.from(input.pairedVideoBytes ?? [])).toEqual([20, 21, 22, 23]);
  });

  it("accepts a still-photo .tapnap package without a paired MOV", () => {
    const photo = new Uint8Array([31, 32, 33]);
    const zipBytes = zipSync({
      "primary-photo.jpg": photo,
      "tapcam-export.json": verificationSidecar("stillPhoto", [
        { role: "primaryPhoto", filename: "primary-photo.jpg", mediaType: "public.jpeg" }
      ])
    });
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", { type: "" });

    const input = resolveCaptureInput(file, zipBytes);

    expect(input.kind).toBe("capture-package");
    expect(input.photoFile.name).toBe("primary-photo.jpg");
    expect(input.photoFile.type).toBe("image/jpeg");
    expect(Array.from(input.photoBytes)).toEqual([31, 32, 33]);
    expect(input.pairedVideoName).toBeUndefined();
    expect(input.pairedVideoBytes).toBeUndefined();
  });

  it("preserves legacy ZIP support without a sidecar", () => {
    const photo = new Uint8Array([40, 41]);
    const movie = new Uint8Array([42, 43]);
    const zipBytes = zipSync({
      "legacy/primary-photo.heif": photo,
      "legacy/paired-video.mov": movie
    });
    const file = new File([zipBytes], "tapcam-live-photo-verification.zip", {
      type: "application/zip"
    });

    const input = resolveCaptureInput(file, zipBytes);

    expect(input.kind).toBe("capture-package");
    expect(input.photoFile.name).toBe("primary-photo.heif");
    expect(input.photoFile.type).toBe("image/heif");
    expect(Array.from(input.pairedVideoBytes ?? [])).toEqual([42, 43]);
  });

  it("recognizes the TAPNAP MIME type even when the filename has no package extension", () => {
    const zipBytes = zipSync({ "primary-photo.heic": new Uint8Array([50]) });
    const file = new File([zipBytes], "shared-file", {
      type: TAPNAP_CAPTURE_PACKAGE_MIME_TYPE
    });

    expect(resolveCaptureInput(file, zipBytes).kind).toBe("capture-package");
  });

  it("recognizes ZIP magic even when the filename and MIME type are generic", () => {
    const zipBytes = zipSync({ "primary-photo.jpeg": new Uint8Array([60]) });
    const file = new File([zipBytes], "shared-file.bin", {
      type: "application/octet-stream"
    });

    const input = resolveCaptureInput(file, zipBytes);

    expect(input.kind).toBe("capture-package");
    expect(input.photoFile.name).toBe("primary-photo.jpeg");
    expect(input.photoFile.type).toBe("image/jpeg");
  });

  it("treats sidecar media fields as untrusted hints and falls back to fixed names", () => {
    const photo = new Uint8Array([70, 71]);
    const movie = new Uint8Array([72, 73]);
    const zipBytes = zipSync({
      "primary-photo.heic": photo,
      "paired-video.mov": movie,
      "not-a-photo.mov": new Uint8Array([99]),
      "not-a-video.jpg": new Uint8Array([98]),
      "tapcam-export.json": verificationSidecar("livePhotoPackage", [
        { role: "primaryPhoto", filename: "not-a-photo.mov", mediaType: "public.heic" },
        {
          role: "pairedLivePhotoVideo",
          filename: "not-a-video.jpg",
          mediaType: "com.apple.quicktime-movie"
        }
      ])
    });
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", {
      type: TAPNAP_CAPTURE_PACKAGE_MIME_TYPE
    });

    const input = resolveCaptureInput(file, zipBytes);

    expect(Array.from(input.photoBytes)).toEqual([70, 71]);
    expect(input.pairedVideoName).toBe("paired-video.mov");
    expect(Array.from(input.pairedVideoBytes ?? [])).toEqual([72, 73]);
  });

  it("falls back to fixed names when the sidecar is malformed", () => {
    const zipBytes = zipSync({
      "primary-photo.heic": new Uint8Array([80]),
      "tapcam-export.json": textEncoder.encode(JSON.stringify({ resources: "invalid" }))
    });
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", { type: "" });

    const input = resolveCaptureInput(file, zipBytes);

    expect(input.photoFile.name).toBe("primary-photo.heic");
    expect(Array.from(input.photoBytes)).toEqual([80]);
  });

  it("ignores a resource index with an unsupported sidecar schema", () => {
    const zipBytes = zipSync({
      "primary-photo.heic": new Uint8Array([81]),
      "alternate.heic": new Uint8Array([82]),
      "tapcam-export.json": textEncoder.encode(
        JSON.stringify({
          schemaID: "urn:tapnap:tapcam:verification-export:v2",
          version: 2,
          resources: [
            { role: "primaryPhoto", filename: "alternate.heic", mediaType: "public.heic" }
          ]
        })
      )
    });
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", { type: "" });

    const input = resolveCaptureInput(file, zipBytes);

    expect(Array.from(input.photoBytes)).toEqual([81]);
  });

  it("rejects ambiguous fixed-name primary photos", () => {
    const zipBytes = zipSync({
      "a/primary-photo.heic": new Uint8Array([83]),
      "b/primary-photo.jpg": new Uint8Array([84])
    });
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", {
      type: TAPNAP_CAPTURE_PACKAGE_MIME_TYPE
    });

    expect(() => resolveCaptureInput(file, zipBytes)).toThrow(
      "Capture package contains ambiguous media resources"
    );
  });

  it("rejects an ambiguous sidecar basename lookup", () => {
    const zipBytes = zipSync({
      "a/signed-capture.heic": new Uint8Array([85]),
      "b/signed-capture.heic": new Uint8Array([86]),
      "tapcam-export.json": verificationSidecar("stillPhoto", [
        { role: "primaryPhoto", filename: "signed-capture.heic", mediaType: "public.heic" }
      ])
    });
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", { type: "" });

    expect(() => resolveCaptureInput(file, zipBytes)).toThrow(
      "Capture package contains ambiguous media resources"
    );
  });

  it("rejects packages with excessive archive entries", () => {
    const entries: Record<string, Uint8Array> = {
      "primary-photo.heic": new Uint8Array([87])
    };
    for (let index = 0; index < 16; index += 1) {
      entries[`ignored-${index}.txt`] = new Uint8Array([index]);
    }
    const zipBytes = zipSync(entries);
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", { type: "" });

    expect(() => resolveCaptureInput(file, zipBytes)).toThrow(
      "Capture package contains too many entries"
    );
  });

  it("rejects a package without a supported primary photo", () => {
    const zipBytes = zipSync({ "paired-video.mov": new Uint8Array([90]) });
    const file = new File([zipBytes], "TAPNAP-Capture.tapnap", {
      type: TAPNAP_CAPTURE_PACKAGE_MIME_TYPE
    });

    expect(() => resolveCaptureInput(file, zipBytes)).toThrow(
      "Capture package does not contain primary-photo.heic"
    );
  });

  it("uses the .tapnap extension to route non-ZIP bytes into package parsing", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = new File([bytes], "TAPNAP-Capture.tapnap", {
      type: "application/octet-stream"
    });

    expect(() => resolveCaptureInput(file, bytes)).toThrow();
  });

  it("uses the TAPNAP MIME type to route extensionless non-ZIP bytes into package parsing", () => {
    const bytes = new Uint8Array([5, 6, 7, 8]);
    const file = new File([bytes], "shared-file", {
      type: TAPNAP_CAPTURE_PACKAGE_MIME_TYPE
    });

    expect(() => resolveCaptureInput(file, bytes)).toThrow();
  });
});
