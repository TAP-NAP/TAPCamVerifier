import { prepareOriginalPreviewRgba } from "../wasm/tapcamVerifier";
import { decodeHeifPrimaryRgba } from "./heifPrimaryDecoder";
import type { OriginalPreviewResult } from "./types";

export async function visualizeOriginalHeicFallback(fileBytes: Uint8Array): Promise<OriginalPreviewResult> {
  try {
    const primaryImage = await decodeHeifPrimaryRgba(fileBytes);
    if (!primaryImage) {
      return {
        status: "unavailable",
        message: "Original preview is not available because no HEIF primary image was found.",
        warnings: ["No HEIF primary image was found."]
      };
    }

    return await prepareOriginalPreviewRgba(fileBytes, primaryImage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      message,
      warnings: [message]
    };
  }
}
