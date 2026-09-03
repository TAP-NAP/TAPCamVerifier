use std::env;
use std::fs;

fn main() {
    let mut args = env::args().skip(1);
    let Some(path) = args.next() else {
        eprintln!(
            "usage: tapcam-verify-fixture <photo-path> <actual-depth-present:0|1> [paired-video-path]"
        );
        std::process::exit(2);
    };
    let actual_depth_present = match args.next().as_deref() {
        Some("0") => false,
        Some("1") => true,
        _ => {
            eprintln!(
                "usage: tapcam-verify-fixture <photo-path> <actual-depth-present:0|1> [paired-video-path]"
            );
            std::process::exit(2);
        }
    };
    let paired_video_path = args.next();
    if args.next().is_some() {
        eprintln!(
            "usage: tapcam-verify-fixture <photo-path> <actual-depth-present:0|1> [paired-video-path]"
        );
        std::process::exit(2);
    }

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
        actual_depth_present,
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("report JSON")
    );
}
