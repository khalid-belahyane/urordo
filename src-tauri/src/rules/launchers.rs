use std::path::Path;

pub enum ClassifyResult {
    Protected(&'static str),
    Standard(String),
}

pub fn check_launcher(path: &Path) -> Option<ClassifyResult> {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("lnk") || ext.eq_ignore_ascii_case("url") {
            return Some(ClassifyResult::Protected("Launcher"));
        }
    }
    None
}
