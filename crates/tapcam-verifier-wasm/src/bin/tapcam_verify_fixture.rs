use std::env;
use std::fs;

fn main() {
    let Some(path) = env::args().nth(1) else {
        eprintln!("usage: tapcam-verify-fixture <photo-path>");
        std::process::exit(2);
    };

    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("failed to read {path}: {error}");
            std::process::exit(1);
        }
    };
    let report = tapcam_verifier_wasm::verify_heic_bytes(&bytes);
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("report JSON")
    );
}
