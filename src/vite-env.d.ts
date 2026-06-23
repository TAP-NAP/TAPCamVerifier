/// <reference types="vite/client" />

declare module "libheif-js/wasm-bundle.js" {
  const libheifModule: Promise<any> | any;
  export default libheifModule;
}
