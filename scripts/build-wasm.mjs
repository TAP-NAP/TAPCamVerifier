import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "crates/tapcam-verifier-wasm/Cargo.toml");
const wasmSource = resolve(
  root,
  "crates/tapcam-verifier-wasm/target/wasm32-unknown-unknown/release/tapcam_verifier_wasm.wasm"
);
const wasmTarget = resolve(root, "public/wasm/tapcam_verifier_wasm.wasm");

await run("cargo", [
  "build",
  "--manifest-path",
  manifestPath,
  "--release",
  "--target",
  "wasm32-unknown-unknown"
]);

await mkdir(dirname(wasmTarget), { recursive: true });
await copyFile(wasmSource, wasmTarget);

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit"
    });

    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}
