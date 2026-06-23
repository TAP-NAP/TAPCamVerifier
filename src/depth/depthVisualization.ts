import { visualizeDepthPlane } from "../wasm/tapcamVerifier";
import { decodeHeifAuxiliaryDepthPlane } from "./heifDepthDecoder";
import type { DepthVisualizationResult, DisplayOrientationReference } from "./types";

export async function visualizeCaptureDepth(
  fileBytes: Uint8Array,
  displayReference?: DisplayOrientationReference
): Promise<DepthVisualizationResult> {
  try {
    const depthPlane = await decodeHeifAuxiliaryDepthPlane(fileBytes);
    if (!depthPlane) {
      return {
        status: "unavailable",
        message: "No embedded HEIF auxiliary depth or disparity plane was found.",
        warnings: ["No embedded HEIF auxiliary depth or disparity plane was found."]
      };
    }

    return await visualizeDepthPlane(fileBytes, depthPlane, displayReference);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "error",
      message,
      warnings: [message]
    };
  }
}
