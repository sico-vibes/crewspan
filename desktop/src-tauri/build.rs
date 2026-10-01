fn main() {
    // CI populates desktop/stage before packaging. Keep local `cargo check`
    // usable before staging has run; the empty directory itself is not shipped.
    let stage = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap())
        .parent()
        .expect("src-tauri lives in desktop/")
        .join("stage");
    if !stage.exists() {
        std::fs::create_dir_all(&stage).expect("create empty desktop stage placeholder");
    }
    tauri_build::build()
}
