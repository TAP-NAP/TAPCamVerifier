import { decodeHeifPrimaryRgba } from "../original/heifPrimaryDecoder";
import type { DecodedPrimaryImage } from "../original/types";
import { projectDepthPixels } from "../wasm/tapcamVerifier";
import type { DecodedDepthPlane, DisplayOrientationReference } from "../depth/types";
import type { DecodedRgbImage, PixelProjectionReport } from "./types";

export async function decodeRgbForPixelProjection(file: File, fileBytes: Uint8Array): Promise<DecodedRgbImage | null> {
  const heifImage = await decodeHeifPrimaryRgba(fileBytes);
  if (heifImage) {
    return heifImage;
  }

  return decodeBrowserImageRgba(file, fileBytes);
}

export async function projectSignedDepthPixels(
  fileBytes: Uint8Array,
  rgbImage: DecodedPrimaryImage,
  depthPlane: DecodedDepthPlane,
  displayReference?: DisplayOrientationReference
): Promise<PixelProjectionReport> {
  try {
    return await projectDepthPixels(fileBytes, rgbImage, depthPlane, displayReference);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      message,
      warnings: [message]
    };
  }
}

async function decodeBrowserImageRgba(file: File, fileBytes: Uint8Array): Promise<DecodedRgbImage | null> {
  const blob = new Blob([copyArrayBuffer(fileBytes)], { type: file.type || inferMimeType(file.name) });
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) {
    return null;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Browser image canvas 2D context is unavailable.");
    }
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      rgba: imageData.data
    };
  } finally {
    bitmap.close();
  }
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function inferMimeType(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerName.endsWith(".heic")) {
    return "image/heic";
  }
  if (lowerName.endsWith(".heif")) {
    return "image/heif";
  }
  return "application/octet-stream";
}
