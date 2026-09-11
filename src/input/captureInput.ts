import { unzipSync, type Unzipped } from "fflate";

export const TAPNAP_CAPTURE_PACKAGE_MIME_TYPE =
  "application/vnd.tapnap.capture-package+zip";

const VERIFICATION_SIDECAR_SCHEMA_ID =
  "urn:tapnap:tapcam:verification-export:v1";
const VERIFICATION_SIDECAR_VERSION = 1;
export const MAX_CAPTURE_INPUT_BYTES = 512 * 1024 * 1024;
const MAX_CAPTURE_PACKAGE_ENTRIES = 16;
const MAX_CAPTURE_RESOURCE_BYTES = 384 * 1024 * 1024;
const MAX_CAPTURE_EXTRACTED_BYTES = 512 * 1024 * 1024;
const MAX_VERIFICATION_SIDECAR_BYTES = 256 * 1024;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_MINIMUM_VERSION = 10;
const ZIP_MAXIMUM_SUPPORTED_VERSION = 20;

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

export async function readCaptureInput(file: File): Promise<CaptureInput> {
  assertCaptureInputSize(file.size);
  return resolveCaptureInput(file, new Uint8Array(await file.arrayBuffer()));
}

function assertCaptureInputSize(byteLength: number): void {
  if (byteLength > MAX_CAPTURE_INPUT_BYTES) {
    throw new Error("Capture exceeds the 512 MiB browser input limit.");
  }
}

export function resolveCaptureInput(file: File, fileBytes: Uint8Array): CaptureInput {
  assertCaptureInputSize(fileBytes.byteLength);
  if (!isCapturePackage(file) && isMP4Video(file, fileBytes)) {
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
  if (sidecar.packageKind === "tapVideo") {
    const videoName = resolveSidecarResource(entries, sidecar, "primaryVideo");
    if (!videoName) throw invalidSidecarError();
    const videoBytes = entries[videoName];
    return {
      kind: "tap-video",
      fileName: file.name,
      fileSize: file.size,
      videoFile: new File([videoBytes], videoName, { type: "video/mp4" }),
      videoBytes
    };
  }
  const primaryPhotoName = resolveSidecarResource(
    entries,
    sidecar,
    "primaryPhoto"
  );

  if (!primaryPhotoName) {
    throw new Error("Capture package requires a valid current v1 sidecar.");
  }

  const pairedVideoName = resolveSidecarResource(
    entries,
    sidecar,
    "pairedLivePhotoVideo",
    true
  );
  const photoBytes = entries[primaryPhotoName];
  const pairedVideoBytes = pairedVideoName ? entries[pairedVideoName] : undefined;
  const photoFileName = primaryPhotoName;

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
  validateZipContainer(fileBytes);
  let entryCount = 0;
  let extractedBytes = 0;
  const entryNames = new Set<string>();
  const entries = unzipSync(fileBytes, {
    filter: (entry) => {
      entryCount += 1;
      if (entryCount > MAX_CAPTURE_PACKAGE_ENTRIES) {
        throw new Error("Capture package contains too many entries.");
      }
      if (entryNames.has(entry.name)) {
        throw invalidSidecarError();
      }
      entryNames.add(entry.name);

      const isSidecar = entry.name === "tapcam-export.json";
      if (!isSidecar && !isRootEntryName(entry.name)) {
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
  return entries;
}

function isCapturePackage(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.toLowerCase();
  return lowerName.endsWith(".tapnap") || lowerType === TAPNAP_CAPTURE_PACKAGE_MIME_TYPE;
}

interface VerificationExportSidecar {
  packageKind: "stillPhoto" | "livePhotoPackage" | "tapVideo";
  resources: Array<{
    role: "primaryPhoto" | "pairedLivePhotoVideo" | "primaryVideo";
    filename: string;
  }>;
}

function parseVerificationSidecar(bytes: Uint8Array | undefined): VerificationExportSidecar {
  if (!bytes) {
    throw new Error("Capture package requires a valid current v1 sidecar.");
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalidSidecarError();
  }

  if (!isRecord(value) || value.schemaID !== VERIFICATION_SIDECAR_SCHEMA_ID ||
      value.version !== VERIFICATION_SIDECAR_VERSION || !Array.isArray(value.resources)) {
    throw invalidSidecarError();
  }
  // The unsigned sidecar locates bytes only. Labels, ordering, MIME descriptions,
  // package kind, and additional fields do not supply verification evidence.
  const resources: VerificationExportSidecar["resources"] = [];
  for (const resource of value.resources) {
    if (!isRecord(resource) || typeof resource.role !== "string" || !isRootEntryName(resource.filename)) {
      throw invalidSidecarError();
    }
    if (!["primaryPhoto", "primaryVideo", "pairedLivePhotoVideo"].includes(resource.role)) continue;
    if (resources.some((entry) => entry.role === resource.role || entry.filename === resource.filename)) throw invalidSidecarError();
    resources.push({ role: resource.role as VerificationExportSidecar["resources"][number]["role"], filename: resource.filename });
  }
  const video = resources.some((resource) => resource.role === "primaryVideo");
  const photo = resources.some((resource) => resource.role === "primaryPhoto");
  const paired = resources.some((resource) => resource.role === "pairedLivePhotoVideo");
  if (video === photo || (video && paired)) throw invalidSidecarError();
  return { packageKind: video ? "tapVideo" : paired ? "livePhotoPackage" : "stillPhoto", resources };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRootEntryName(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0");
}

function invalidSidecarError(): Error {
  return new Error("Capture package requires a valid current v1 sidecar.");
}

function resolveSidecarResource(
  entries: Record<string, Uint8Array>,
  sidecar: VerificationExportSidecar,
  role: string,
  optional = false
): string | null {
  const filename = sidecar?.resources.find((resource) => resource.role === role)?.filename;
  if (!filename) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(entries, filename)) {
    if (optional) return null;
    throw invalidSidecarError();
  }
  if (!optional && entries[filename].byteLength === 0) throw invalidSidecarError();
  return filename;
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

function validateZipContainer(bytes: Uint8Array): void {
  if (bytes.byteLength < 22 || readUint32(bytes, 0) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Capture package is not a valid ZIP archive.");
  }

  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(bytes, eocdOffset + 10);
  const centralDirectoryLength = readUint32(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readUint32(bytes, eocdOffset + 16);
  const commentLength = readUint16(bytes, eocdOffset + 20);
  if (
    readUint16(bytes, eocdOffset + 4) !== 0 ||
    readUint16(bytes, eocdOffset + 6) !== 0 ||
    readUint16(bytes, eocdOffset + 8) !== entryCount ||
    entryCount === 0 ||
    entryCount > MAX_CAPTURE_PACKAGE_ENTRIES ||
    centralDirectoryOffset === 0xffffffff ||
    centralDirectoryLength === 0xffffffff ||
    centralDirectoryOffset + centralDirectoryLength !== eocdOffset ||
    eocdOffset + 22 + commentLength !== bytes.byteLength
  ) {
    throw new Error("Capture package is not a valid ZIP archive.");
  }

  let centralOffset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, centralOffset) !== ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      throw new Error("Capture package is not a valid ZIP archive.");
    }
    const version = readUint16(bytes, centralOffset + 6);
    const flags = readUint16(bytes, centralOffset + 8);
    const compression = readUint16(bytes, centralOffset + 10);
    const checksum = readUint32(bytes, centralOffset + 16);
    const compressedLength = readUint32(bytes, centralOffset + 20);
    const uncompressedLength = readUint32(bytes, centralOffset + 24);
    const nameLength = readUint16(bytes, centralOffset + 28);
    const extraLength = readUint16(bytes, centralOffset + 30);
    const entryCommentLength = readUint16(bytes, centralOffset + 32);
    const localOffset = readUint32(bytes, centralOffset + 42);
    const centralHeaderLength = 46 + nameLength + extraLength + entryCommentLength;
    if (
      version < ZIP_MINIMUM_VERSION ||
      version > ZIP_MAXIMUM_SUPPORTED_VERSION ||
      (flags & 1) !== 0 ||
      (compression !== 0 && compression !== 8) ||
      compressedLength === 0xffffffff ||
      uncompressedLength === 0xffffffff ||
      nameLength === 0 ||
      readUint16(bytes, centralOffset + 34) !== 0 ||
      localOffset === 0xffffffff ||
      centralOffset + centralHeaderLength > eocdOffset ||
      localOffset + 30 > centralDirectoryOffset ||
      readUint32(bytes, localOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE ||
      readUint16(bytes, localOffset + 4) !== version ||
      readUint16(bytes, localOffset + 6) !== flags ||
      readUint16(bytes, localOffset + 8) !== compression ||
      readUint16(bytes, localOffset + 26) !== nameLength
    ) {
      throw new Error("Capture package is not a valid ZIP archive.");
    }

    const localExtraLength = readUint16(bytes, localOffset + 28);
    const localDataOffset = localOffset + 30 + nameLength + localExtraLength;
    if (
      localDataOffset + compressedLength > centralDirectoryOffset ||
      ((flags & 8) === 0 && (
        readUint32(bytes, localOffset + 14) !== checksum ||
        readUint32(bytes, localOffset + 18) !== compressedLength ||
        readUint32(bytes, localOffset + 22) !== uncompressedLength
      )) ||
      !equalBytes(
        bytes.subarray(localOffset + 30, localOffset + 30 + nameLength),
        bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength)
      )
    ) {
      throw new Error("Capture package is not a valid ZIP archive.");
    }
    centralOffset += centralHeaderLength;
  }

  if (centralOffset !== eocdOffset) {
    throw new Error("Capture package is not a valid ZIP archive.");
  }
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimumOffset = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (
      readUint32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE &&
      offset + 22 + readUint16(bytes, offset + 20) === bytes.byteLength
    ) {
      return offset;
    }
  }
  throw new Error("Capture package is not a valid ZIP archive.");
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw new Error("Capture package is not a valid ZIP archive.");
  }
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new Error("Capture package is not a valid ZIP archive.");
  }
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
