import type { DecodedDepthPlane } from "./types";

export interface LibHeifImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface LibHeifImage {
  get_width(): number;
  get_height(): number;
  display(imageData: LibHeifImageData, callback: (displayData: LibHeifImageData | null) => void): void;
  free?(): void;
  is_primary?(): boolean;
}

export type LibHeifModule = Record<string, any> & {
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  HEAP32: Int32Array;
  HeifDecoder: new () => { decoder?: EmbindPointer; decode(bytes: Uint8Array): LibHeifImage[] };
  _malloc(bytes: number): number;
  _free(ptr: number): void;
};

interface EmbindPointer {
  $$?: {
    ptr?: number;
  };
}

interface BoxRange {
  type: string;
  offset: number;
  headerSize: number;
  size: number;
  payloadOffset: number;
  end: number;
}

interface ItemInfo {
  id: number;
  itemType: string;
}

interface ItemReference {
  type: string;
  from: number;
  to: number[];
}

export interface JpegAuxiliaryDepthImage {
  offset: number;
  length: number;
  width: number;
  height: number;
  auxiliaryImageType: string;
}

let libheifPromise: Promise<LibHeifModule> | null = null;

export async function decodeEmbeddedDepthPlane(fileBytes: Uint8Array): Promise<DecodedDepthPlane | null> {
  const heifPlane = await decodeHeifAuxiliaryDepthPlane(fileBytes);
  if (heifPlane) {
    return heifPlane;
  }

  return decodeJpegAuxiliaryDepthPlane(fileBytes);
}

export async function decodeHeifAuxiliaryDepthPlane(fileBytes: Uint8Array): Promise<DecodedDepthPlane | null> {
  const auxiliaryItemId = findHeifAuxiliaryDepthItemId(fileBytes);
  if (auxiliaryItemId === null) {
    return null;
  }

  const libheif = await loadLibheif();
  const decoder = new libheif.HeifDecoder();
  decoder.decode(fileBytes);

  const contextPtr = decoder.decoder?.$$?.ptr;
  if (!contextPtr) {
    throw new Error("libheif did not expose a HEIF context pointer.");
  }

  return decodeImageItemAsLuma(libheif, contextPtr, auxiliaryItemId);
}

export function findHeifAuxiliaryDepthItemId(fileBytes: Uint8Array): number | null {
  const view = new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength);
  const meta = readChildBoxes(view, 0, fileBytes.byteLength).find((box) => box.type === "meta");
  if (!meta) {
    return null;
  }

  const metaChildren = readChildBoxes(view, meta.payloadOffset + 4, meta.end);
  const pitm = metaChildren.find((box) => box.type === "pitm");
  const iinf = metaChildren.find((box) => box.type === "iinf");
  const iref = metaChildren.find((box) => box.type === "iref");
  if (!iinf || !iref) {
    return null;
  }

  const primaryItemId = pitm ? parsePrimaryItemId(view, pitm) : null;
  const itemInfos = new Map(parseItemInfos(view, iinf).map((item) => [item.id, item]));
  const auxiliaryReferences = parseItemReferences(view, iref).filter((reference) => reference.type === "auxl");
  const candidates = auxiliaryReferences
    .map((reference) => itemInfos.get(reference.from))
    .filter((item): item is ItemInfo => Boolean(item))
    .filter((item) => item.itemType === "hvc1" || item.itemType === "grid");

  const primaryCandidates = primaryItemId === null
    ? candidates
    : candidates.filter((item) =>
        auxiliaryReferences.some((reference) => reference.from === item.id && reference.to.includes(primaryItemId))
      );

  return chooseAuxiliaryItem(primaryCandidates) ?? chooseAuxiliaryItem(candidates) ?? null;
}

export async function decodeJpegAuxiliaryDepthPlane(fileBytes: Uint8Array): Promise<DecodedDepthPlane | null> {
  const auxiliaryImage = findJpegAuxiliaryDepthImage(fileBytes);
  if (!auxiliaryImage) {
    return null;
  }

  return decodeJpegImageRangeAsLuma(fileBytes, auxiliaryImage);
}

export function findJpegAuxiliaryDepthImage(fileBytes: Uint8Array): JpegAuxiliaryDepthImage | null {
  if (!isJpegContainer(fileBytes)) {
    return null;
  }

  let offset = 0;
  while (offset + 1 < fileBytes.length) {
    const soiOffset = findMarker(fileBytes, 0xd8, offset);
    if (soiOffset === -1) {
      return null;
    }
    const image = readJpegImage(fileBytes, soiOffset);
    if (image && isDepthAuxiliaryImageType(image.auxiliaryImageType)) {
      return {
        offset: soiOffset,
        length: image.end - soiOffset,
        width: image.width,
        height: image.height,
        auxiliaryImageType: image.auxiliaryImageType
      };
    }
    offset = Math.max(soiOffset + 2, image?.end ?? soiOffset + 2);
  }

  return null;
}

export async function loadLibheif(): Promise<LibHeifModule> {
  libheifPromise ??= import("libheif-js/wasm-bundle.js").then((module) => module.default ?? module);
  return libheifPromise;
}

function decodeImageItemAsLuma(
  libheif: LibHeifModule,
  contextPtr: number,
  itemId: number
): DecodedDepthPlane {
  const handleResultPtr = libheif._malloc(16);
  const handleOutPtr = libheif._malloc(8);
  libheif.HEAPU32[handleOutPtr / 4] = 0;

  let handlePtr = 0;
  try {
    libheif._heif_context_get_image_handle(handleResultPtr, contextPtr, itemId, handleOutPtr);
    assertHeifOk(libheif, handleResultPtr, `Could not get HEIF auxiliary item ${itemId}.`);
    handlePtr = libheif.HEAPU32[handleOutPtr / 4];
    if (!handlePtr) {
      throw new Error(`HEIF auxiliary item ${itemId} did not return an image handle.`);
    }

    return decodeHandleAsLuma(libheif, handlePtr, itemId);
  } finally {
    if (handlePtr) {
      libheif._heif_image_handle_release(handlePtr);
    }
    libheif._free(handleResultPtr);
    libheif._free(handleOutPtr);
  }
}

function decodeHandleAsLuma(libheif: LibHeifModule, handlePtr: number, itemId: number): DecodedDepthPlane {
  const decodeResultPtr = libheif._malloc(16);
  const imageOutPtr = libheif._malloc(8);
  libheif.HEAPU32[imageOutPtr / 4] = 0;

  let imagePtr = 0;
  try {
    libheif._heif_decode_image(
      decodeResultPtr,
      handlePtr,
      imageOutPtr,
      enumValue(libheif.heif_colorspace_monochrome),
      enumValue(libheif.heif_chroma_monochrome),
      0
    );
    assertHeifOk(libheif, decodeResultPtr, `Could not decode HEIF auxiliary item ${itemId}.`);
    imagePtr = libheif.HEAPU32[imageOutPtr / 4];
    if (!imagePtr) {
      throw new Error(`HEIF auxiliary item ${itemId} did not return decoded image data.`);
    }

    const channel = enumValue(libheif.heif_channel_Y);
    const width = libheif._heif_image_get_width(imagePtr, channel);
    const height = libheif._heif_image_get_height(imagePtr, channel);
    const stridePtr = libheif._malloc(4);
    try {
      const planePtr = libheif._heif_image_get_plane_readonly(imagePtr, channel, stridePtr);
      const stride = libheif.HEAP32[stridePtr / 4];
      if (!planePtr || width <= 0 || height <= 0 || stride < width) {
        throw new Error(`HEIF auxiliary item ${itemId} returned an invalid luma plane.`);
      }

      const luma = new Uint8Array(width * height);
      for (let row = 0; row < height; row += 1) {
        const rowStart = planePtr + row * stride;
        luma.set(libheif.HEAPU8.subarray(rowStart, rowStart + width), row * width);
      }

      return { itemId, width, height, luma };
    } finally {
      libheif._free(stridePtr);
    }
  } finally {
    if (imagePtr) {
      libheif._heif_image_release(imagePtr);
    }
    libheif._free(decodeResultPtr);
    libheif._free(imageOutPtr);
  }
}

function enumValue(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "object" && value !== null && "value" in value && typeof value.value === "number") {
    return value.value;
  }
  throw new Error("libheif enum value is unavailable.");
}

function assertHeifOk(libheif: LibHeifModule, errorPtr: number, fallbackMessage: string): void {
  const code = libheif.HEAPU32[errorPtr / 4];
  if (code === 0) {
    return;
  }

  const subcode = libheif.HEAPU32[errorPtr / 4 + 1];
  const messagePtr = libheif.HEAPU32[errorPtr / 4 + 2];
  const message = readCString(libheif.HEAPU8, messagePtr);
  throw new Error(`${fallbackMessage} ${message || `libheif error ${code}:${subcode}`}`);
}

function readCString(heap: Uint8Array, ptr: number): string {
  if (!ptr) {
    return "";
  }
  let end = ptr;
  while (end < heap.length && heap[end] !== 0) {
    end += 1;
  }
  return new TextDecoder().decode(heap.subarray(ptr, end));
}

function chooseAuxiliaryItem(candidates: ItemInfo[]): number | null {
  return candidates.find((item) => item.itemType === "hvc1")?.id ?? candidates[0]?.id ?? null;
}

async function decodeJpegImageRangeAsLuma(
  fileBytes: Uint8Array,
  auxiliaryImage: JpegAuxiliaryDepthImage
): Promise<DecodedDepthPlane> {
  const imageBytes = copyArrayBuffer(fileBytes, auxiliaryImage.offset, auxiliaryImage.length);
  const bitmap = await createImageBitmap(new Blob([imageBytes], { type: "image/jpeg" }));

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("JPEG auxiliary depth canvas 2D context is unavailable.");
    }

    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const luma = new Uint8Array(canvas.width * canvas.height);
    for (let index = 0; index < luma.length; index += 1) {
      luma[index] = imageData.data[index * 4];
    }

    return {
      itemId: auxiliaryImage.offset,
      width: canvas.width,
      height: canvas.height,
      luma
    };
  } finally {
    bitmap.close();
  }
}

function isJpegContainer(fileBytes: Uint8Array): boolean {
  return fileBytes.length >= 2 && fileBytes[0] === 0xff && fileBytes[1] === 0xd8;
}

interface JpegImageMetadata {
  end: number;
  width: number;
  height: number;
  auxiliaryImageType: string;
}

function readJpegImage(fileBytes: Uint8Array, start: number): JpegImageMetadata | null {
  if (start + 4 > fileBytes.length || fileBytes[start] !== 0xff || fileBytes[start + 1] !== 0xd8) {
    return null;
  }

  let offset = start + 2;
  let width = 0;
  let height = 0;
  let auxiliaryImageType = "";

  while (offset + 4 <= fileBytes.length && fileBytes[offset] === 0xff) {
    let markerOffset = offset;
    while (markerOffset < fileBytes.length && fileBytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    if (markerOffset >= fileBytes.length) {
      return null;
    }

    const marker = fileBytes[markerOffset];
    offset = markerOffset + 1;
    if (marker === 0xd9) {
      return width > 0 && height > 0 ? { end: offset, width, height, auxiliaryImageType } : null;
    }
    if (marker === 0xda) {
      const end = findMarker(fileBytes, 0xd9, offset);
      return end !== -1 && width > 0 && height > 0
        ? { end: end + 2, width, height, auxiliaryImageType }
        : null;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }
    if (offset + 2 > fileBytes.length) {
      return null;
    }

    const segmentLength = readU16(fileBytes, offset);
    const payloadOffset = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > fileBytes.length) {
      return null;
    }

    if (marker === 0xe1) {
      auxiliaryImageType ||= readAuxiliaryImageType(fileBytes.subarray(payloadOffset, segmentEnd));
    }
    if (isStartOfFrameMarker(marker) && payloadOffset + 5 < segmentEnd) {
      height = readU16(fileBytes, payloadOffset + 1);
      width = readU16(fileBytes, payloadOffset + 3);
    }

    offset = segmentEnd;
  }

  return null;
}

function readAuxiliaryImageType(payload: Uint8Array): string {
  const text = new TextDecoder().decode(payload);
  return xmlUnescape(
    readXmlElement(text, "apdi:AuxiliaryImageType") ??
    readXmlAttribute(text, "apdi:AuxiliaryImageType") ??
    ""
  ).trim();
}

function readXmlElement(text: string, tagName: string): string | null {
  const openMarker = `<${tagName}>`;
  const closeMarker = `</${tagName}>`;
  const start = text.indexOf(openMarker);
  if (start === -1) {
    return null;
  }
  const contentStart = start + openMarker.length;
  const end = text.indexOf(closeMarker, contentStart);
  return end === -1 ? null : text.slice(contentStart, end);
}

function readXmlAttribute(text: string, attributeName: string): string | null {
  const marker = `${attributeName}=`;
  const start = text.indexOf(marker);
  if (start === -1) {
    return null;
  }
  const quoteOffset = start + marker.length;
  const quote = text[quoteOffset];
  if (quote !== "\"" && quote !== "'") {
    return null;
  }
  const valueStart = quoteOffset + 1;
  const end = text.indexOf(quote, valueStart);
  return end === -1 ? null : text.slice(valueStart, end);
}

function isDepthAuxiliaryImageType(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "disparity" ||
    normalized === "depth" ||
    normalized.endsWith(":aux:disparity") ||
    normalized.endsWith(":aux:depth");
}

function isStartOfFrameMarker(marker: number): boolean {
  return (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function findMarker(fileBytes: Uint8Array, marker: number, start: number): number {
  for (let index = start; index + 1 < fileBytes.length; index += 1) {
    if (fileBytes[index] === 0xff && fileBytes[index + 1] === marker) {
      return index;
    }
  }
  return -1;
}

function readU16(fileBytes: Uint8Array, offset: number): number {
  return (fileBytes[offset] << 8) | fileBytes[offset + 1];
}

function copyArrayBuffer(bytes: Uint8Array, offset: number, length: number): ArrayBuffer {
  const copy = new Uint8Array(length);
  copy.set(bytes.subarray(offset, offset + length));
  return copy.buffer;
}

function xmlUnescape(input: string): string {
  return input
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parsePrimaryItemId(view: DataView, pitm: BoxRange): number | null {
  const version = view.getUint8(pitm.payloadOffset);
  const offset = pitm.payloadOffset + 4;
  if (version === 0) {
    return view.getUint16(offset);
  }
  if (version === 1) {
    return view.getUint32(offset);
  }
  return null;
}

function parseItemInfos(view: DataView, iinf: BoxRange): ItemInfo[] {
  const version = view.getUint8(iinf.payloadOffset);
  let offset = iinf.payloadOffset + 4;
  const count = version === 0 ? view.getUint16(offset) : view.getUint32(offset);
  offset += version === 0 ? 2 : 4;

  const items: ItemInfo[] = [];
  for (const entry of readChildBoxes(view, offset, iinf.end)) {
    if (entry.type !== "infe") {
      continue;
    }
    const entryVersion = view.getUint8(entry.payloadOffset);
    let cursor = entry.payloadOffset + 4;
    let id: number;
    let itemType = "";
    if (entryVersion >= 2) {
      id = entryVersion === 2 ? view.getUint16(cursor) : view.getUint32(cursor);
      cursor += entryVersion === 2 ? 2 : 4;
      cursor += 2;
      itemType = readAscii(view, cursor, 4);
    } else {
      id = view.getUint16(cursor);
    }
    items.push({ id, itemType });
  }

  return items.slice(0, count);
}

function parseItemReferences(view: DataView, iref: BoxRange): ItemReference[] {
  const version = view.getUint8(iref.payloadOffset);
  const idSize = version === 0 ? 2 : 4;
  const references: ItemReference[] = [];

  for (const referenceBox of readChildBoxes(view, iref.payloadOffset + 4, iref.end)) {
    let cursor = referenceBox.payloadOffset;
    const from = readItemId(view, cursor, idSize);
    cursor += idSize;
    const count = view.getUint16(cursor);
    cursor += 2;
    const to: number[] = [];
    for (let index = 0; index < count; index += 1) {
      to.push(readItemId(view, cursor, idSize));
      cursor += idSize;
    }
    references.push({ type: referenceBox.type, from, to });
  }

  return references;
}

function readItemId(view: DataView, offset: number, byteCount: number): number {
  return byteCount === 2 ? view.getUint16(offset) : view.getUint32(offset);
}

function readChildBoxes(view: DataView, start: number, end: number): BoxRange[] {
  const boxes: BoxRange[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = view.getUint32(offset);
    const type = readAscii(view, offset + 4, 4);
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      size = Number(view.getBigUint64(offset + 8));
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    const boxEnd = offset + size;
    if (size < headerSize || boxEnd > end) {
      break;
    }
    boxes.push({
      type,
      offset,
      headerSize,
      size,
      payloadOffset: offset + headerSize,
      end: boxEnd
    });
    offset = boxEnd;
  }
  return boxes;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}
