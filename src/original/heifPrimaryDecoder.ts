import { loadLibheif, type LibHeifImage, type LibHeifImageData } from "../depth/heifDepthDecoder";
import type { DecodedPrimaryImage } from "./types";

export async function decodeHeifPrimaryRgba(fileBytes: Uint8Array): Promise<DecodedPrimaryImage | null> {
  if (!isHeifContainer(fileBytes)) {
    return null;
  }

  const libheif = await loadLibheif();
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(fileBytes);
  if (images.length === 0) {
    return null;
  }

  const image = choosePrimaryImage(images);
  const width = image.get_width();
  const height = image.get_height();
  if (width <= 0 || height <= 0) {
    image.free?.();
    throw new Error("HEIF primary image returned invalid dimensions.");
  }

  const imageData: LibHeifImageData = {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height
  };

  try {
    await new Promise<void>((resolve, reject) => {
      image.display(imageData, (displayData) => {
        if (!displayData) {
          reject(new Error("HEIF primary image decode failed."));
          return;
        }
        resolve();
      });
    });
  } finally {
    image.free?.();
  }

  return {
    width,
    height,
    rgba: imageData.data
  };
}

function choosePrimaryImage(images: LibHeifImage[]): LibHeifImage {
  return images.find((image) => {
    try {
      return image.is_primary?.() === true;
    } catch {
      return false;
    }
  }) ?? images[0];
}

function isHeifContainer(fileBytes: Uint8Array): boolean {
  return fileBytes.length >= 12 && String.fromCharCode(...fileBytes.subarray(4, 8)) === "ftyp";
}
