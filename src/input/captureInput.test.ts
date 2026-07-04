import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { resolveCaptureInput } from "./captureInput";

describe("resolveCaptureInput", () => {
  it("keeps a single photo as the verification photo", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const file = new File([bytes], "capture.HEIC", { type: "image/heic" });

    const input = resolveCaptureInput(file, bytes);

    expect(input.kind).toBe("single-photo");
    expect(input.fileName).toBe("capture.HEIC");
    expect(input.photoFile).toBe(file);
    expect(Array.from(input.photoBytes)).toEqual([1, 2, 3]);
    expect(input.pairedVideoBytes).toBeUndefined();
  });

  it("extracts a Live Photo verification ZIP using sidecar resource roles", () => {
    const photo = new Uint8Array([10, 11, 12]);
    const movie = new Uint8Array([20, 21, 22, 23]);
    const sidecar = new TextEncoder().encode(
      JSON.stringify({
        schemaID: "urn:tapnap:tapcam:verification-export:v1",
        version: 1,
        packageKind: "livePhotoPackage",
        resources: [
          { role: "primaryPhoto", filename: "primary-photo.heic", mediaType: "public.heic" },
          {
            role: "pairedLivePhotoVideo",
            filename: "paired-video.mov",
            mediaType: "com.apple.quicktime-movie"
          }
        ]
      })
    );
    const zipBytes = zipSync({
      "nested/primary-photo.heic": photo,
      "nested/paired-video.mov": movie,
      "tapcam-export.json": sidecar
    });
    const file = new File([zipBytes], "tapcam-live-photo-verification.zip", {
      type: "application/zip"
    });

    const input = resolveCaptureInput(file, zipBytes);

    expect(input.kind).toBe("live-photo-zip");
    expect(input.fileName).toBe("tapcam-live-photo-verification.zip");
    expect(input.photoFile.name).toBe("primary-photo.heic");
    expect(input.photoFile.type).toBe("image/heic");
    expect(Array.from(input.photoBytes)).toEqual([10, 11, 12]);
    expect(input.pairedVideoName).toBe("nested/paired-video.mov");
    expect(Array.from(input.pairedVideoBytes ?? [])).toEqual([20, 21, 22, 23]);
  });
});
