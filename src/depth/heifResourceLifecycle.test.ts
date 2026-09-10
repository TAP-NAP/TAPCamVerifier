import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeHeifAuxiliaryDepthPlane, type LibHeifModule } from "./heifDepthDecoder";
import { decodeHeifPrimaryRgba } from "../original/heifPrimaryDecoder";

const libheif = vi.hoisted(() => ({} as LibHeifModule));
vi.mock("libheif-js/wasm-bundle.js", () => ({ default: libheif }));
let failure: string;
let allocations: Set<number>;
let handles: Set<number>;
let contexts: Set<number>;
let decodedImages: Set<number>;
let topLevelImages: Set<number>;

beforeEach(() => {
  failure = "";
  allocations = new Set(); handles = new Set(); contexts = new Set();
  decodedImages = new Set(); topLevelImages = new Set();
  const heap = new ArrayBuffer(4096);
  let allocationIndex = 0;
  Object.assign(libheif, {
    HEAPU8: new Uint8Array(heap), HEAPU32: new Uint32Array(heap), HEAP32: new Int32Array(heap),
    HeifDecoder: class {
      decoder: { $$: { ptr: number } } | null = null;
      decode() {
        this.decoder = { $$: { ptr: failure === "no-context" ? 0 : 64 } };
        contexts.add(this.decoder.$$.ptr);
        if (failure === "decode") throw new Error("decode");
        if (failure === "empty") return [];
        return [1, 2].map((id) => {
          topLevelImages.add(id);
          return {
            free: () => { expect(topLevelImages.delete(id)).toBe(true); },
            is_primary: () => id === 2,
            get_width: () => {
              if (failure === "width") throw new Error("width");
              return failure === "invalid-dimensions" ? 0 : failure === "rgba-allocation" ? Infinity : 2;
            },
            get_height: () => 1,
            display: (data: { data: Uint8ClampedArray }, callback: (data: unknown) => void) => {
              if (failure === "display-throw") throw new Error("display");
              data.data.set([1, 2, 3, 255, 4, 5, 6, 255]);
              callback(failure === "display-null" ? null : data);
            }
          };
        });
      }
    },
    heif_context_free: (context: { $$: { ptr: number } }) => {
      expect(topLevelImages.size).toBe(0);
      expect(contexts.delete(context.$$.ptr)).toBe(true);
    },
    _malloc: () => {
      allocationIndex += 1;
      if (failure === `malloc-${allocationIndex}`) throw new Error("allocation failed");
      if (failure === `null-malloc-${allocationIndex}`) return 0;
      const pointer = 128 + allocationIndex * 16;
      allocations.add(pointer);
      return pointer;
    },
    _free: (pointer: number) => { expect(allocations.delete(pointer)).toBe(true); },
    _heif_context_get_image_handle: (result: number, _context: number, _item: number, out: number) => {
      handles.add(400);
      libheif.HEAPU32[out / 4] = 400;
      libheif.HEAPU32[result / 4] = failure === "handle" ? 1 : 0;
    },
    _heif_image_handle_release: (pointer: number) => { expect(handles.delete(pointer)).toBe(true); },
    _heif_decode_image: (result: number, _handle: number, out: number) => {
      decodedImages.add(500);
      libheif.HEAPU32[out / 4] = 500;
      libheif.HEAPU32[result / 4] = failure === "image" ? 1 : 0;
    },
    _heif_image_release: (pointer: number) => { expect(decodedImages.delete(pointer)).toBe(true); },
    _heif_image_get_width: () => 2,
    _heif_image_get_height: () => 2,
    _heif_image_get_plane_readonly: (_image: number, _channel: number, stride: number) => {
      libheif.HEAP32[stride / 4] = failure === "stride" ? 1 : 3;
      libheif.HEAPU8.set([1, 2, 9, 3, 4, 9], 1000);
      return 1000;
    },
    heif_colorspace_monochrome: 2, heif_chroma_monochrome: 0, heif_channel_Y: 0
  });
});

function expectReleased(): void {
  expect([...allocations, ...handles, ...contexts, ...decodedImages, ...topLevelImages]).toEqual([]);
}

describe("HEIF decoder resource ownership", () => {
  it("copies primary pixels before releasing every image and the context", async () => {
    const image = await decodeHeifPrimaryRgba(fixture());
    expect(image).toEqual({ width: 2, height: 1, rgba: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]) });
    expectReleased();
  });
  it("releases the context when no primary images are returned", async () => {
    failure = "empty";
    await expect(decodeHeifPrimaryRgba(fixture())).resolves.toBeNull();
    expectReleased();
  });
  it.each(["decode", "width", "invalid-dimensions", "rgba-allocation", "display-throw", "display-null"])(
    "releases primary resources after %s", async (stage) => {
      failure = stage;
      await expect(decodeHeifPrimaryRgba(fixture())).rejects.toThrow();
      expectReleased();
    }
  );
  it("copies the auxiliary luma plane before releasing all native resources", async () => {
    expect(await decodeHeifAuxiliaryDepthPlane(fixture())).toEqual({
      itemId: 2, width: 2, height: 2, luma: new Uint8Array([1, 2, 3, 4])
    });
    expectReleased();
  });
  it.each(["decode", "no-context", "handle", "image", "stride", "malloc-2", "malloc-4", "malloc-5", "null-malloc-2", "null-malloc-4", "null-malloc-5"])(
    "releases auxiliary resources after %s", async (stage) => {
      failure = stage;
      await expect(decodeHeifAuxiliaryDepthPlane(fixture())).rejects.toThrow();
      expectReleased();
    }
  );
});

function fixture(): Uint8Array {
  const box = (type: string, ...parts: Uint8Array[]): Uint8Array => {
    const bytes = new Uint8Array(8 + parts.reduce((sum, part) => sum + part.length, 0));
    new DataView(bytes.buffer).setUint32(0, bytes.length);
    bytes.set(new TextEncoder().encode(type), 4);
    let offset = 8;
    parts.forEach((part) => { bytes.set(part, offset); offset += part.length; });
    return bytes;
  };
  const ftyp = box("ftyp", new Uint8Array(4));
  const meta = box("meta", new Uint8Array(4),
    box("pitm", new Uint8Array([0, 0, 0, 0, 0, 1])),
    box("iinf", new Uint8Array([0, 0, 0, 0, 0, 1]),
      box("infe", new Uint8Array([2, 0, 0, 0, 0, 2, 0, 0, 104, 118, 99, 49]))),
    box("iref", new Uint8Array(4), box("auxl", new Uint8Array([0, 2, 0, 1, 0, 1]))));
  return new Uint8Array([...ftyp, ...meta]);
}
