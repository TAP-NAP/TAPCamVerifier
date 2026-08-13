/// <reference types="vite/client" />

declare module "three/examples/jsm/libs/zstddec.module.js" {
  export class ZSTDDecoder {
    init(): Promise<void>;
    decode(data: Uint8Array, uncompressedSize?: number): Uint8Array;
  }
}

declare module "libheif-js/wasm-bundle.js" {
  const libheifModule: Promise<any> | any;
  export default libheifModule;
}
