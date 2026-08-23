import { unzipSync, type Unzipped } from "fflate";

export const TAPNAP_CAPTURE_PACKAGE_MIME_TYPE =
  "application/vnd.tapnap.capture-package+zip";

const VERIFICATION_SIDECAR_SCHEMA_ID =
  "urn:tapnap:tapcam:verification-export:v1";
const VERIFICATION_SIDECAR_VERSION = 1;
const MAX_CAPTURE_PACKAGE_BYTES = 512 * 1024 * 1024;
const MAX_CAPTURE_PACKAGE_ENTRIES = 16;
const MAX_CAPTURE_RESOURCE_BYTES = 384 * 1024 * 1024;
const MAX_CAPTURE_EXTRACTED_BYTES = 512 * 1024 * 1024;
const MAX_VERIFICATION_SIDECAR_BYTES = 256 * 1024;

export type CaptureInputKind = "single-photo" | "capture-package" | "tap-video";

interface CaptureInputBase {
  fileName: string;
  fileSize: number;
}

export interface PhotoCaptureInput extends CaptureInputBase {
  kind: "single-photo" | "capture-package";
  photoFile: File;
  photoBytes: Uint8Array;
  pairedVideoBytes?: Uint8Array;
  pairedVideoName?: string;
}

export interface VideoCaptureInput extends CaptureInputBase {
  kind: "tap-video";
  videoFile: File;
  videoBytes: Uint8Array;
}

export type CaptureInput = PhotoCaptureInput | VideoCaptureInput;

export function resolveCaptureInput(file: File, fileBytes: Uint8Array): CaptureInput {
  if (isMP4Video(file, fileBytes)) {
    return {
      kind: "tap-video",
      fileName: file.name,
      fileSize: file.size,
      videoFile: file,
      videoBytes: fileBytes
    };
  }

  if (!isCapturePackage(file)) {
    if (!isSupportedPhotoFile(file)) {
      throw new Error("Unsupported capture input. Select HEIC, HEIF, JPG, JPEG, MP4, or TAPNAP.");
    }
    return {
      kind: "single-photo",
      fileName: file.name,
      fileSize: file.size,
      photoFile: file,
      photoBytes: fileBytes
    };
  }

  const entries = unzipCapturePackage(fileBytes);
  const sidecar = parseVerificationSidecar(entries["tapcam-export.json"]);
  const primaryPhotoName = resolveSidecarResource(
    entries,
    sidecar,
    "primaryPhoto",
    isSupportedPhotoName
  );

  if (!primaryPhotoName) {
    throw new Error("Capture package requires a valid current v1 sidecar.");
  }

  const pairedVideoName = resolveSidecarResource(
    entries,
    sidecar,
    "pairedLivePhotoVideo",
    isQuickTimeMovieName
  );
  const photoBytes = entries[primaryPhotoName];
  const pairedVideoBytes = pairedVideoName ? entries[pairedVideoName] : undefined;
  const photoFileName = entryBasename(primaryPhotoName);

  return {
    kind: "capture-package",
    fileName: file.name,
    fileSize: file.size,
    photoFile: new File([photoBytes], photoFileName, {
      type: mediaTypeForPhotoName(photoFileName)
    }),
    photoBytes,
    pairedVideoBytes,
    pairedVideoName: pairedVideoName ?? undefined
  };
}

function isMP4Video(file: File, fileBytes: Uint8Array): boolean {
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.toLowerCase();
  if (!lowerName.endsWith(".mp4") && lowerType !== "video/mp4") {
    return false;
  }
  return fileBytes.length >= 12 && ascii(fileBytes, 4, 4) === "ftyp";
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function unzipCapturePackage(fileBytes: Uint8Array): Unzipped {
  if (fileBytes.byteLength > MAX_CAPTURE_PACKAGE_BYTES) {
    throw new Error("Capture package is too large.");
  }

  let entryCount = 0;
  let extractedBytes = 0;
  return unzipSync(fileBytes, {
    filter: (entry) => {
      entryCount += 1;
      if (entryCount > MAX_CAPTURE_PACKAGE_ENTRIES) {
        throw new Error("Capture package contains too many entries.");
      }

      const basename = entryBasename(entry.name);
      const isSidecar = entry.name === "tapcam-export.json";
      const isMediaResource = isSupportedPhotoName(basename) || isQuickTimeMovieName(basename);
      if (!isSidecar && !isMediaResource) {
        return false;
      }

      const maximumEntryBytes = isSidecar
        ? MAX_VERIFICATION_SIDECAR_BYTES
        : MAX_CAPTURE_RESOURCE_BYTES;
      if (entry.originalSize > maximumEntryBytes) {
        throw new Error(
          isSidecar
            ? "Capture package sidecar is too large."
            : "Capture package media resource is too large."
        );
      }

      extractedBytes += entry.originalSize;
      if (extractedBytes > MAX_CAPTURE_EXTRACTED_BYTES) {
        throw new Error("Capture package expands beyond the supported size.");
      }
      return true;
    }
  });
}

function isCapturePackage(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.toLowerCase();
  return lowerName.endsWith(".tapnap") || lowerType === TAPNAP_CAPTURE_PACKAGE_MIME_TYPE;
}

interface VerificationExportSidecar {
  resources: Array<{
    role: string;
    filename: string;
  }>;
}

function parseVerificationSidecar(bytes: Uint8Array | undefined): VerificationExportSidecar {
  if (!bytes) {
    throw new Error("Capture package requires a valid current v1 sidecar.");
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Capture package requires a valid current v1 sidecar.");
  }

  if (
    !isRecord(value) ||
    value.schemaID !== VERIFICATION_SIDECAR_SCHEMA_ID ||
    value.version !== VERIFICATION_SIDECAR_VERSION ||
    !Array.isArray(value.resources) ||
    value.resources.some(
      (resource) =>
        !isRecord(resource) ||
        typeof resource.role !== "string" ||
        typeof resource.filename !== "string"
    )
  ) {
    throw new Error("Capture package requires a valid current v1 sidecar.");
  }

  const resources = value.resources.map((resource) => ({
    role: resource.role as string,
    filename: resource.filename as string
  }));
  if (
    resources.filter((resource) => resource.role === "primaryPhoto").length !== 1 ||
    resources.filter((resource) => resource.role === "pairedLivePhotoVideo").length > 1
  ) {
    throw new Error("Capture package requires a valid current v1 sidecar.");
  }
  return { resources };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveSidecarResource(
  entries: Record<string, Uint8Array>,
  sidecar: VerificationExportSidecar,
  role: string,
  isAllowedName: (name: string) => boolean
): string | null {
  const filename = sidecar?.resources.find((resource) => resource.role === role)?.filename;
  if (!filename) {
    return null;
  }

  if (!entries[filename] || !isAllowedName(entryBasename(filename))) {
    throw new Error("Capture package requires a valid current v1 sidecar.");
  }
  return filename;
}

function entryBasename(name: string): string {
  return name.split("/").filter(Boolean).at(-1) ?? name;
}

function isSupportedPhotoName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".heic") ||
    lower.endsWith(".heif") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg")
  );
}

function isSupportedPhotoFile(file: File): boolean {
  const lowerType = file.type.toLowerCase();
  return (
    isSupportedPhotoName(file.name) ||
    lowerType === "image/heic" ||
    lowerType === "image/heif" ||
    lowerType === "image/jpeg"
  );
}

function isQuickTimeMovieName(name: string): boolean {
  return name.toLowerCase().endsWith(".mov");
}

function mediaTypeForPhotoName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".heif")) {
    return "image/heif";
  }
  return "image/heic";
}
