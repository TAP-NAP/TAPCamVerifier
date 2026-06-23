export interface DecodedDepthPlane {
  itemId: number;
  width: number;
  height: number;
  luma: Uint8Array;
}

export interface DisplayOrientationReference {
  width: number;
  height: number;
}

export interface DepthVisualizationAvailable {
  status: "available";
  sourceKind: string;
  width: number;
  height: number;
  inputWidth: number;
  inputHeight: number;
  minValue: number;
  maxValue: number;
  valueRangeKind: string;
  valueUnit: string;
  rawMin: number;
  rawMax: number;
  orientation: string;
  photoOrientation: string;
  rotation: string;
  previewRgba: Uint8ClampedArray;
  warnings: string[];
}

export interface DepthVisualizationUnavailable {
  status: "unavailable";
  message: string;
  warnings: string[];
}

export interface DepthVisualizationError {
  status: "error";
  message: string;
  warnings: string[];
}

export type DepthVisualizationResult =
  | DepthVisualizationAvailable
  | DepthVisualizationUnavailable
  | DepthVisualizationError;

export type DepthPanelState =
  | { status: "idle" }
  | { status: "loading" }
  | DepthVisualizationResult;
