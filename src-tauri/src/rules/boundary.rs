//! Boundary detection — determines the safety classification of any filesystem path.
//!
//! **Detection order is mandatory. Never change it.**
//!
//! ```text
//! Step 1 — Drive root             → SystemDriveRoot
//! Step 2 — Critical OS path       → CriticalSystemPath
//! Step 3 — Inside project tree    → InsideProjectTree   (ancestor walk)
//! Step 4 — Is project root        → ProjectRoot         (self check)
//! Step 5a — Empty directory       → EmptyFolder
//! Step 5b — User curated folder   → UserCuratedFolder
//! Step 5c — Other named directory → NamedFolder
//! Step 6 — Shortcut file          → Shortcut
//! Step 7 — Default                → LooseFile
//! ```
//!
//! WHY THIS ORDER:
//! - System protection must fire before any project or folder logic.
//! - Project protection fires before descent/classification.
//! - Curated folder protection fires before content merge logic.
//! - Classifier only ever sees truly eligible LooseFile entries.

use crate::rules::folders::{classify_folder, FolderType};
use crate::rules::projects::{check_project, is_project_dir};
use std::path::Path;

/// The safety boundary classification of a filesystem path.
///
/// Every subsystem (scanner, watcher, organizer, classifier) must branch on
/// this enum through `detect_boundary()` and apply the correct action per variant.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BoundaryKind {
    // ── System-level protected zones ─────────────────────────────────────────
    /// Drive root: `C:\`, `D:\`, `/`.
    ///
    /// Action: block all normal organisation logic. Emit a protected warning.
    /// Never auto-organise. Never watch as a normal root. Never scan.
    SystemDriveRoot,

    /// Critical OS-managed directory: `C:\Windows`, `C:\Program Files`,
    /// `/etc`, `/usr`, etc.
    ///
    /// Action: protected. Never move. Never recursively scan for organisation.
    /// Watcher registration must be rejected or downgraded to a no-op.
    CriticalSystemPath,

    // ── Project boundaries ───────────────────────────────────────────────────
    /// The path itself is a project root (contains `.git`, `Cargo.toml`, etc.).
    ///
    /// Action: emit as a single atomic keep/protected item. **Never descend.**
    /// Never classify children. Never move the project folder itself.
    ProjectRoot,

    /// The path is inside a project tree (an ancestor is a project root).
    ///
    /// Action: skip entirely. Never classify. Never move. Never auto-organise.
    InsideProjectTree,

    // ── User-space protected zones ───────────────────────────────────────────
    /// A named directory that appears to be a deliberately curated container.
    ///
    /// Action: protected by default. Do not descend unless
    /// `settings.allow_curated_folder_scan = true`.
    /// Do not merge/flatten unless `settings.allow_curated_folder_merge = true`.
    UserCuratedFolder,

    // ── Safe organisable content ─────────────────────────────────────────────
    /// An empty directory (zero children).
    ///
    /// Action: candidate for deletion if user confirms.
    EmptyFolder,

    /// A named directory that is not a project root, not curated, and not empty.
    ///
    /// Action: reviewable. Not auto-moved. Shown to user for decision.
    NamedFolder,

    /// A loose file eligible for classification and potential move.
    ///
    /// Action: pass to classifier. May be auto-moved if confidence ≥ threshold.
    LooseFile,

    /// A Windows shortcut (`.lnk`) or URL shortcut (`.url`).
    ///
    /// Action: keep. Never moved under any circumstances.
    Shortcut,
}

/// Determines the safety boundary kind for `path`.
///
/// **The detection order below is mandatory and must not be changed.**
/// See module-level documentation for the full rationale.
pub fn detect_boundary(path: &Path, root_path: Option<&Path>) -> BoundaryKind {
    // ── Step 1: Drive root ────────────────────────────────────────────────────
    // Must be first — a drive root is also "a directory", so later checks
    // would misclassify it without this early guard.
    if crate::rules::system::is_drive_root(path) {
        return BoundaryKind::SystemDriveRoot;
    }

    // ── Step 2: Critical OS system path ──────────────────────────────────────
    // Must come before project detection — Windows/system paths don't have
    // project markers but we must never treat them as user space.
    if crate::rules::system::is_critical_system_path(path) {
        return BoundaryKind::CriticalSystemPath;
    }

    // ── Step 3: Inside a project tree (ancestor walk) ─────────────────────────
    // check_project() walks all ancestors. If any ancestor is a project root,
    // this path is an internal file — skip it entirely.
    if check_project(path, root_path).is_some() {
        return BoundaryKind::InsideProjectTree;
    }

    if path.is_dir() {
        // ── Step 4: Project root (self check) ────────────────────────────────
        // is_project_dir() checks the directory itself for project markers.
        if is_project_dir(path) {
            return BoundaryKind::ProjectRoot;
        }

        let ftype = classify_folder(path);
        return match ftype {
            FolderType::Project => BoundaryKind::ProjectRoot,
            FolderType::Empty => BoundaryKind::EmptyFolder,
            FolderType::Resource | FolderType::Unstructured => {
                // ── Step 5b/c: User curated vs ordinary named folder ──────────
                if crate::rules::system::is_user_curated_folder(path) {
                    BoundaryKind::UserCuratedFolder
                } else {
                    BoundaryKind::NamedFolder
                }
            }
        };
    }

    // ── Step 6: Shortcut file ─────────────────────────────────────────────────
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("lnk") || ext.eq_ignore_ascii_case("url") {
            return BoundaryKind::Shortcut;
        }
    }

    // ── Step 7: Default — loose file eligible for classification ──────────────
    BoundaryKind::LooseFile
}
