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
  videoFile?: File;
  videoBytes?: Uint8Array;
}

export interface VideoCaptureInput extends CaptureInputBase {
  kind: "tap-video";
  videoFile: File;
  videoBytes: Uint8Array;
  // Aliases keep the legacy CaptureInput read shape source-compatible. Video
  // call sites must still branch on `kind` before choosing an analysis path.
  photoFile: File;
  photoBytes: Uint8Array;
  pairedVideoBytes?: Uint8Array;
  pairedVideoName?: string;
}

export type CaptureInput = PhotoCaptureInput | VideoCaptureInput;

export function resolveCaptureInput(file: File, fileBytes: Uint8Array): CaptureInput {
  if (isMP4Video(file, fileBytes)) {
    return {
      kind: "tap-video",
      fileName: file.name,
      fileSize: file.size,
      videoFile: file,
      videoBytes: fileBytes,
      photoFile: file,
      photoBytes: fileBytes
    };
  }

  if (!isCapturePackage(file, fileBytes)) {
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
  const primaryPhotoName =
    resolveSidecarResource(entries, sidecar, "primaryPhoto", isSupportedPhotoName) ??
    resolveUniqueEntry(entries, (name) => {
      const basename = entryBasename(name).toLowerCase();
      return (
        basename === "primary-photo.heic" ||
        basename === "primary-photo.heif" ||
        basename === "primary-photo.jpg" ||
        basename === "primary-photo.jpeg"
      );
    });

  if (!primaryPhotoName || !entries[primaryPhotoName]) {
    throw new Error(
      "Capture package does not contain primary-photo.heic, primary-photo.heif, primary-photo.jpg, or primary-photo.jpeg."
    );
  }

  const pairedVideoName =
    resolveSidecarResource(entries, sidecar, "pairedLivePhotoVideo", isQuickTimeMovieName) ??
    resolveUniqueEntry(
      entries,
      (name) => entryBasename(name).toLowerCase() === "paired-video.mov"
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

function isCapturePackage(file: File, fileBytes: Uint8Array): boolean {
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.toLowerCase();
  return (
    lowerName.endsWith(".tapnap") ||
    lowerName.endsWith(".zip") ||
    lowerType === TAPNAP_CAPTURE_PACKAGE_MIME_TYPE ||
    lowerType === "application/zip" ||
    hasZipMagic(fileBytes)
  );
}

function hasZipMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return false;
  }

  return (
    (bytes[2] === 0x03 && bytes[3] === 0x04) ||
    (bytes[2] === 0x05 && bytes[3] === 0x06) ||
    (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}

interface VerificationExportSidecar {
  resources: Array<{
    role: string;
    filename: string;
  }>;
}

function parseVerificationSidecar(bytes: Uint8Array | undefined): VerificationExportSidecar | null {
  if (!bytes) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !isRecord(value) ||
      value.schemaID !== VERIFICATION_SIDECAR_SCHEMA_ID ||
      value.version !== VERIFICATION_SIDECAR_VERSION ||
      !Array.isArray(value.resources)
    ) {
      return null;
    }

    const resources = value.resources.flatMap((resource) => {
      if (
        !isRecord(resource) ||
        typeof resource.role !== "string" ||
        typeof resource.filename !== "string"
      ) {
        return [];
      }
      return [{ role: resource.role, filename: resource.filename }];
    });
    return { resources };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveSidecarResource(
  entries: Record<string, Uint8Array>,
  sidecar: VerificationExportSidecar | null,
  role: string,
  isAllowedName: (name: string) => boolean
): string | null {
  const filename = sidecar?.resources.find((resource) => resource.role === role)?.filename;
  if (!filename) {
    return null;
  }

  if (entries[filename] && isAllowedName(entryBasename(filename))) {
    return filename;
  }

  const basename = entryBasename(filename);
  if (!isAllowedName(basename)) {
    return null;
  }

  return resolveUniqueEntry(entries, (name) => entryBasename(name) === basename);
}

function resolveUniqueEntry(
  entries: Record<string, Uint8Array>,
  predicate: (name: string) => boolean
): string | null {
  const matches = Object.keys(entries).filter(predicate);
  if (matches.length > 1) {
    throw new Error("Capture package contains ambiguous media resources.");
  }
  return matches[0] ?? null;
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
