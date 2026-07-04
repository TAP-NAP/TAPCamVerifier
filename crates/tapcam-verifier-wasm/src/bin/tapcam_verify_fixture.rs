use std::env;
use std::fs;

fn main() {
    let Some(path) = env::args().nth(1) else {
        eprintln!("usage: tapcam-verify-fixture <photo-path> [paired-video-path]");
        std::process::exit(2);
    };
    let paired_video_path = env::args().nth(2);

    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("failed to read {path}: {error}");
            std::process::exit(1);
        }
    };
    let paired_video = paired_video_path.map(|path| {
        fs::read(&path).unwrap_or_else(|error| {
            eprintln!("failed to read {path}: {error}");
            std::process::exit(1);
        })
    });
    let report = tapcam_verifier_wasm::verify_capture_package_bytes(
        &bytes,
        paired_video.as_deref(),
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("report JSON")
    );
}
