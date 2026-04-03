//! System path safety layer — single source of truth for protected path detection.
//!
//! Every subsystem (scanner, watcher, organizer, classifier) imports from this module.
//! No duplicated protection logic exists elsewhere.
//!
//! Detection priority (must be checked in this exact order by boundary.rs):
//!   1. Drive root           → BoundaryKind::SystemDriveRoot
//!   2. Critical OS path     → BoundaryKind::CriticalSystemPath
//!   3. Project root / tree  → BoundaryKind::ProjectRoot / InsideProjectTree
//!   4. User curated folder  → BoundaryKind::UserCuratedFolder
//!   5. Everything else      → EmptyFolder / NamedFolder / LooseFile / Shortcut

use std::fs::Metadata;
use std::path::Path;

// ─────────────────────────────────────────────────────────────────────────────
// Drive root detection
// ─────────────────────────────────────────────────────────────────────────────

/// Returns `true` if `path` is a drive root.
///
/// Examples that return `true`:
/// - `C:\`  `D:\`  (Windows — Prefix + RootDir, no further components)
/// - `C:`           (Windows — bare drive letter, no slash)
/// - `/`            (Unix filesystem root)
///
/// Examples that return `false`:
/// - `C:\Users`
/// - `C:\Windows\System32`
/// - `/home/alice`
pub fn is_drive_root(path: &Path) -> bool {
    use std::path::Component;
    let mut components = path.components();
    match (components.next(), components.next(), components.next()) {
        // Windows: "C:\" — Prefix + RootDir, nothing after
        (Some(Component::Prefix(_)), Some(Component::RootDir), None) => true,
        // Windows: "C:" — bare drive letter only
        (Some(Component::Prefix(_)), None, _) => true,
        // Unix: "/" — RootDir only
        (Some(Component::RootDir), None, _) => true,
        _ => false,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Critical OS system directory detection
// ─────────────────────────────────────────────────────────────────────────────

/// Returns `true` if `path` **is** or **descends from** a critical OS-managed
/// system directory.
///
/// These directories must never be auto-organised, scanned for organisation,
/// or registered as watch targets.
///
/// The check is platform-aware and case-insensitive on Windows.
pub fn is_critical_system_path(path: &Path) -> bool {
    // ── Windows ──────────────────────────────────────────────────────────────
    #[cfg(target_os = "windows")]
    {
        // Normalise to lowercase + canonical backslashes for safe comparison.
        // canonicalize() on Windows returns extended-length paths like "\\?\C:\Windows".
        // Strip that prefix before matching so "\\?\C:\Windows" == "C:\Windows".
        let raw = path.to_string_lossy().to_lowercase().replace('/', "\\");
        let s = raw.strip_prefix("\\\\?\\").unwrap_or(&raw);
        // Trim any trailing backslash so prefix matching works cleanly
        let s = s.trim_end_matches('\\');

        const CRITICAL: &[&str] = &[
            "c:\\windows",
            "c:\\program files",
            "c:\\program files (x86)",
            "c:\\programdata",
            "c:\\users\\default",
            "c:\\recovery",
            "c:\\system volume information",
            "c:\\$recycle.bin",
            "c:\\boot",
            "c:\\efi",
        ];

        for prefix in CRITICAL {
            // Exact match OR path starts with "<prefix>\" (descendant)
            if s == *prefix || s.starts_with(&format!("{}\\", prefix)) {
                return true;
            }
        }
    }

    // ── macOS ─────────────────────────────────────────────────────────────────
    #[cfg(target_os = "macos")]
    {
        let s = path.to_string_lossy();
        let s = s.trim_end_matches('/');

        const CRITICAL: &[&str] = &[
            "/bin", "/cores", "/dev", "/etc", "/private", "/sbin", "/System", "/usr", "/var",
        ];

        for prefix in CRITICAL {
            if s == *prefix || s.starts_with(&format!("{}/", prefix)) {
                return true;
            }
        }
    }

    // ── Linux / other Unix ────────────────────────────────────────────────────
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let s = path.to_string_lossy();
        let s = s.trim_end_matches('/');

        const CRITICAL: &[&str] = &[
            "/bin", "/boot", "/dev", "/etc", "/lib", "/lib64", "/proc", "/run", "/sbin", "/snap",
            "/sys", "/usr", "/var",
        ];

        for prefix in CRITICAL {
            if s == *prefix || s.starts_with(&format!("{}/", prefix)) {
                return true;
            }
        }
    }

    false
}

/// Returns `true` when a filename is a hidden/metadata/system entry that should
/// never be surfaced as normal user content.
pub fn is_known_system_filename(name: &str) -> bool {
    if name.starts_with('.') || name.starts_with('$') {
        return true;
    }

    matches!(
        name.to_ascii_lowercase().as_str(),
        "desktop.ini" | "thumbs.db" | "ehthumbs.db" | "iconcache.db" | ".ds_store"
    )
}

/// Returns `true` when the OS metadata marks this entry as hidden/system.
pub fn has_hidden_or_system_attributes(metadata: &Metadata) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;

        let attrs = metadata.file_attributes();
        return attrs & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM) != 0;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = metadata;
        false
    }
}

/// Returns `true` when an entry should be hidden from scan/watch flows because
/// it is a known metadata filename or carries hidden/system attributes.
pub fn is_hidden_or_system_entry(path: &Path, metadata: Option<&Metadata>) -> bool {
    let is_hidden_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(is_known_system_filename)
        .unwrap_or(false);

    is_hidden_name
        || metadata
            .map(has_hidden_or_system_attributes)
            .unwrap_or(false)
}

// ─────────────────────────────────────────────────────────────────────────────
// User-curated folder detection
// ─────────────────────────────────────────────────────────────────────────────

/// Returns `true` if `path` looks like a user-curated organisational container.
///
/// A curated folder is one the user has **deliberately named and maintains**.
/// By default such folders are protected: the system will not automatically
/// descend into them, merge their contents, or flatten their structure.
///
/// Two heuristics trigger protection (either one is sufficient):
///
/// 1. **Contains subdirectories** — an internal hierarchy implies intentional
///    organisation that should not be disturbed.
/// 2. **Name matches a known curation pattern** — personal, archival, and
///    year-labelled folders are treated as curated by convention.
///
/// This function is **not** called for drive roots, critical system paths, or
/// project roots — those are detected earlier in the pipeline.
pub fn is_user_curated_folder(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }

    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n.to_lowercase(),
        None => return false,
    };

    // Hidden or OS-prefixed entries are not curated user folders
    if name.starts_with('.') || name.starts_with('$') {
        return false;
    }

    // Heuristic 1: folder contains at least one subdirectory → structural container
    let has_subdirs = std::fs::read_dir(path)
        .ok()
        .map(|entries| entries.flatten().any(|e| e.path().is_dir()))
        .unwrap_or(false);

    if has_subdirs {
        return true;
    }

    // Heuristic 2: well-known curation name patterns
    const CURATED_NAMES: &[&str] = &[
        // Personal / life
        "backup",
        "backups",
        "archive",
        "archives",
        "old",
        "saved",
        "personal",
        "private",
        "family",
        // Professional
        "work",
        "clients",
        "projects",
        "portfolio",
        "invoices",
        "contracts",
        "proposals",
        "reports",
        // Creative / media
        "photos",
        "pictures",
        "videos",
        "music",
        "audio",
        "design",
        "art",
        "writing",
        "creative",
        // Academic
        "school",
        "college",
        "university",
        "courses",
        "notes",
        // Finance
        "finance",
        "taxes",
        "bills",
        "receipts",
        "budget",
        // Travel
        "travel",
        "trips",
        "vacation",
        // General organisation
        "documents",
        "files",
        "resources",
        "assets",
    ];

    if CURATED_NAMES.contains(&name.as_str()) {
        return true;
    }

    // Year-labelled folders (2000–2035) are treated as archival containers
    if name.len() == 4 {
        if let Ok(year) = name.parse::<u32>() {
            if (2000..=2035).contains(&year) {
                return true;
            }
        }
    }

    false
}

/// Returns `true` when `path` lives inside a curated ancestor that sits below
/// the selected root. The root itself is treated as an explicit user choice and
/// therefore does not trigger this protection.
pub fn is_inside_user_curated_ancestor(path: &Path, root: &Path) -> bool {
    let mut current = path.parent();

    while let Some(candidate) = current {
        if candidate == root {
            break;
        }

        if !candidate.starts_with(root) {
            break;
        }

        if is_user_curated_folder(candidate) {
            return true;
        }

        current = candidate.parent();
    }

    false
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    // ── Drive root tests ─────────────────────────────────────────────────────

    #[test]
    #[cfg(target_os = "windows")]
    fn drive_root_windows_backslash() {
        assert!(is_drive_root(Path::new("C:\\")));
        assert!(is_drive_root(Path::new("D:\\")));
        assert!(is_drive_root(Path::new("E:\\")));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn drive_root_windows_rejects_subdirs() {
        assert!(!is_drive_root(Path::new("C:\\Users")));
        assert!(!is_drive_root(Path::new("C:\\Windows")));
        assert!(!is_drive_root(Path::new("C:\\Windows\\System32")));
        assert!(!is_drive_root(Path::new("C:\\Users\\Alice\\Desktop")));
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn drive_root_unix_root() {
        assert!(is_drive_root(Path::new("/")));
    }

    #[test]
    fn known_system_filenames_are_blocked() {
        assert!(is_known_system_filename("desktop.ini"));
        assert!(is_known_system_filename("Thumbs.db"));
        assert!(is_known_system_filename(".DS_Store"));
        assert!(!is_known_system_filename("report.docx"));
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn drive_root_unix_rejects_subdirs() {
        assert!(!is_drive_root(Path::new("/home")));
        assert!(!is_drive_root(Path::new("/home/alice")));
        assert!(!is_drive_root(Path::new("/usr/bin")));
    }

    // ── Critical system path tests ───────────────────────────────────────────

    #[test]
    #[cfg(target_os = "windows")]
    fn critical_system_windows_direct() {
        assert!(is_critical_system_path(Path::new("C:\\Windows")));
        assert!(is_critical_system_path(Path::new("C:\\Program Files")));
        assert!(is_critical_system_path(Path::new(
            "C:\\Program Files (x86)"
        )));
        assert!(is_critical_system_path(Path::new("C:\\ProgramData")));
        assert!(is_critical_system_path(Path::new("C:\\Recovery")));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn critical_system_windows_descendant() {
        assert!(is_critical_system_path(Path::new("C:\\Windows\\System32")));
        assert!(is_critical_system_path(Path::new(
            "C:\\Windows\\SysWOW64\\drivers"
        )));
        assert!(is_critical_system_path(Path::new(
            "C:\\Program Files\\Steam"
        )));
        assert!(is_critical_system_path(Path::new(
            "C:\\Program Files (x86)\\Adobe"
        )));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn critical_system_windows_safe_paths() {
        assert!(!is_critical_system_path(Path::new(
            "C:\\Users\\Alice\\Desktop"
        )));
        assert!(!is_critical_system_path(Path::new(
            "C:\\Users\\Alice\\Documents"
        )));
        assert!(!is_critical_system_path(Path::new(
            "C:\\Users\\Alice\\Downloads"
        )));
        assert!(!is_critical_system_path(Path::new("D:\\Projects")));
        assert!(!is_critical_system_path(Path::new("D:\\MyFiles")));
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn critical_system_unix_safe_paths() {
        assert!(!is_critical_system_path(Path::new("/home/alice")));
        assert!(!is_critical_system_path(Path::new("/home/alice/Documents")));
        assert!(!is_critical_system_path(Path::new("/tmp")));
    }
}
