import { unzipSync } from "fflate";

export type CaptureInputKind = "single-photo" | "live-photo-zip";

export interface CaptureInput {
  kind: CaptureInputKind;
  fileName: string;
  fileSize: number;
  photoFile: File;
  photoBytes: Uint8Array;
  pairedVideoBytes?: Uint8Array;
  pairedVideoName?: string;
}

export function resolveCaptureInput(file: File, fileBytes: Uint8Array): CaptureInput {
  if (!isZipFile(file, fileBytes)) {
    return {
      kind: "single-photo",
      fileName: file.name,
      fileSize: file.size,
      photoFile: file,
      photoBytes: fileBytes
    };
  }

  const entries = unzipSync(fileBytes);
  const sidecar = parseVerificationSidecar(entries["tapcam-export.json"]);
  const primaryPhotoName =
    resolveEntryName(entries, resourceFilename(sidecar, "primaryPhoto")) ??
    findEntryName(entries, (name) => {
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
      "Live Photo ZIP does not contain primary-photo.heic, primary-photo.heif, primary-photo.jpg, or primary-photo.jpeg."
    );
  }

  const pairedVideoName =
    resolveEntryName(entries, resourceFilename(sidecar, "pairedLivePhotoVideo")) ??
    findEntryName(entries, (name) => entryBasename(name).toLowerCase() === "paired-video.mov");
  const photoBytes = entries[primaryPhotoName];
  const pairedVideoBytes = pairedVideoName ? entries[pairedVideoName] : undefined;
  const photoFileName = entryBasename(primaryPhotoName);

  return {
    kind: "live-photo-zip",
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

function isZipFile(file: File, fileBytes: Uint8Array): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    (fileBytes.length >= 4 &&
      fileBytes[0] === 0x50 &&
      fileBytes[1] === 0x4b &&
      fileBytes[2] === 0x03 &&
      fileBytes[3] === 0x04)
  );
}

interface VerificationExportSidecar {
  resources?: Array<{
    role?: string;
    filename?: string;
    mediaType?: string;
  }>;
}

function parseVerificationSidecar(bytes: Uint8Array | undefined): VerificationExportSidecar | null {
  if (!bytes) {
    return null;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as VerificationExportSidecar;
  } catch {
    return null;
  }
}

function resourceFilename(sidecar: VerificationExportSidecar | null, role: string): string | null {
  return sidecar?.resources?.find((resource) => resource.role === role)?.filename ?? null;
}

function resolveEntryName(entries: Record<string, Uint8Array>, filename: string | null): string | null {
  if (!filename) {
    return null;
  }
  if (entries[filename]) {
    return filename;
  }
  return findEntryName(entries, (name) => entryBasename(name) === filename);
}

function findEntryName(
  entries: Record<string, Uint8Array>,
  predicate: (name: string) => boolean
): string | null {
  return Object.keys(entries).find(predicate) ?? null;
}

function entryBasename(name: string): string {
  return name.split("/").filter(Boolean).at(-1) ?? name;
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
