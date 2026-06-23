export interface DecodedPrimaryImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface OriginalPreviewAvailable {
  status: "available";
  sourceKind: string;
  width: number;
  height: number;
  inputWidth: number;
  inputHeight: number;
  orientedWidth: number;
  orientedHeight: number;
  photoOrientation: string;
  rotation: string;
  scale: number;
  previewRgba: Uint8ClampedArray;
  warnings: string[];
}

export interface OriginalPreviewUnavailable {
  status: "unavailable";
  message: string;
  warnings: string[];
}

export interface OriginalPreviewError {
  status: "error";
  message: string;
  warnings: string[];
}

export type OriginalPreviewResult =
  | OriginalPreviewAvailable
  | OriginalPreviewUnavailable
  | OriginalPreviewError;

export type OriginalPreviewState =
  | { status: "native" }
  | { status: "loading" }
  | OriginalPreviewResult;
