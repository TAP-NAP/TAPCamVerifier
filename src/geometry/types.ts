import type { DecodedPrimaryImage } from "../original/types";

export interface PixelProjectionDepthRange {
  min: number;
  max: number;
  kind: string;
  rawMin: number;
  rawMax: number;
}

export type PixelProjectionGlobalRisk = "ok" | "notice" | "warning" | "poor";
export type PixelProjectionWarningSeverity = "info" | "notice" | "warning" | "high";
export type PixelProjectionAlignmentRisk = "ok" | "notice" | "warning";

export interface PixelProjectionQualityWarning {
  id: string;
  severity: PixelProjectionWarningSeverity;
  filterable: boolean;
  affectedPointCount?: number | null;
  message: string;
}

export interface PixelProjectionQualityMetrics {
  clippedLowRatio: number;
  clippedHighRatio: number;
  robustRange: number;
  discontinuityRatio: number;
  outlierRatio: number;
  alignmentRisk: PixelProjectionAlignmentRisk;
}

export interface PixelProjectionQuality {
  globalRisk: PixelProjectionGlobalRisk;
  metrics: PixelProjectionQualityMetrics;
  warnings: PixelProjectionQualityWarning[];
}

export interface ProjectedPixelCloud {
  status: "available";
  geometryKind: "signed-depth-pixel-point-cloud";
  viewMode: "capture-camera" | string;
  cameraModel: "virtual-pinhole" | "metadata-pinhole" | string;
  imageWidth: number;
  imageHeight: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  sourceKind: string;
  valueUnit: string;
  relativeGeometry: boolean;
  pointCount: number;
  sampleStep: number;
  width: number;
  height: number;
  inputDepthWidth: number;
  inputDepthHeight: number;
  rgbWidth: number;
  rgbHeight: number;
  rgbCoordinateSpace?: "native-heif" | "display-oriented" | string;
  orientation: string;
  photoOrientation: string;
  rotation: string;
  depthRange: PixelProjectionDepthRange;
  quality: PixelProjectionQuality;
  positions: Float32Array;
  colors: Uint8Array;
  riskFlags: Uint16Array;
  outlierScores: Uint8Array;
  discontinuityScores: Uint8Array;
  warnings: string[];
}

export interface PixelProjectionUnavailable {
  status: "unavailable";
  message: string;
  warnings: string[];
}

export interface PixelProjectionError {
  status: "error";
  message: string;
  warnings: string[];
}

export type PixelProjectionReport =
  | ProjectedPixelCloud
  | PixelProjectionUnavailable
  | PixelProjectionError;

export type PixelProjectionState =
  | { status: "idle" }
  | { status: "loading" }
  | PixelProjectionReport;

export type DecodedRgbImage = DecodedPrimaryImage;
