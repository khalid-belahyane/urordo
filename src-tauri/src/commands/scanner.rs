use crate::contracts::{FileEntry, ScanProgress, ScanResult};
use crate::db::DbPool;
use tauri::{AppHandle, Emitter, State};
// No extra folder imports strictly necessary as they live inside BoundaryKind now
/// Scans the DIRECT children of `path` only — never descends.
///
/// ProjectFolders are emitted as single atomic units with action:keep.
/// EmptyFolders are emitted with action:delete.
/// NamedFolders are emitted with action:review.
/// LooseFiles are emitted with category "Loose" for the classifier to enrich.
/// Shortcuts are emitted with action:keep and category "Launcher".
///
/// RULE 1: ProjectFolders are never descended into.
/// RULE 2: Shortcuts are never moved.
/// RULE 3: Files inside project trees are skipped at the scanner level.
#[tauri::command]
pub async fn scan_directory(
    app: AppHandle,
    pool: State<'_, DbPool>,
    path: String,
) -> Result<ScanResult, String> {
    // License check: free users get 500 entries per scan
    let mut limit = 500usize;
    if let Ok(conn) = pool.get() {
        if let Ok(mut stmt) = conn.prepare("SELECT is_valid FROM license_key WHERE id = 1") {
            if let Ok(is_valid) = stmt.query_row([], |row| row.get::<_, bool>(0)) {
                if is_valid {
                    limit = usize::MAX;
                }
            }
        }
    }

    // Clear the project cache so stale .git detections don't persist across scans
    crate::rules::projects::clear_project_cache();

    let validated = crate::commands::validate_scan_path(&path)?;
    let ignore_rules = crate::commands::ignore::get_all_rules(pool.inner());
    let root_boundary = crate::rules::boundary::detect_boundary(&validated, None);

    let root_boundary_label = match root_boundary {
        crate::rules::boundary::BoundaryKind::SystemDriveRoot => "system_drive_root",
        crate::rules::boundary::BoundaryKind::CriticalSystemPath => "critical_system_path",
        crate::rules::boundary::BoundaryKind::ProjectRoot => "project_root",
        crate::rules::boundary::BoundaryKind::InsideProjectTree => "inside_project_tree",
        crate::rules::boundary::BoundaryKind::UserCuratedFolder => "user_curated_folder",
        crate::rules::boundary::BoundaryKind::EmptyFolder => "empty_folder",
        crate::rules::boundary::BoundaryKind::NamedFolder => "named_folder",
        crate::rules::boundary::BoundaryKind::LooseFile => "loose_file",
        crate::rules::boundary::BoundaryKind::Shortcut => "shortcut",
    }
    .to_string();

    log::info!(
        "[scanner] START path='{}' limit={}",
        validated.display(),
        limit
    );

    let files = tokio::task::spawn_blocking(move || -> Result<ScanResult, String> {
        let entries = std::fs::read_dir(&validated)
            .map_err(|e| format!("Cannot read directory '{}': {}", validated.display(), e))?;

        let mut result: Vec<FileEntry> = Vec::new();
        let mut truncated = false;

        // ── Diagnostic counters ──────────────────────────────────────────────
        let mut enumerated: usize = 0;
        let mut skipped: usize = 0;
        let mut inaccessible: usize = 0;

        for entry_result in entries {
            if result.len() >= limit {
                log::debug!("[scanner] limit={} reached, stopping early", limit);
                truncated = true;
                break;
            }

            enumerated += 1;

            let entry = match entry_result {
                Ok(e) => e,
                Err(e) => {
                    inaccessible += 1;
                    log::warn!("[scanner] INACCESSIBLE entry — OS error: {}", e);
                    continue;
                }
            };

            let entry_path = entry.path();
            let name = entry_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            // Skip known metadata/system filenames before we do any deeper work.
            if crate::rules::system::is_known_system_filename(&name) {
                skipped += 1;
                log::debug!("[scanner] SKIP hidden/system '{}'", entry_path.display());
                continue;
            }

            // Skip entries matching active ignore rules
            if crate::commands::ignore::is_ignored_by_rules(
                &entry_path.to_string_lossy(),
                &ignore_rules,
            ) {
                skipped += 1;
                log::debug!("[scanner] SKIP ignore-rule '{}'", entry_path.display());
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(e) => {
                    inaccessible += 1;
                    log::warn!(
                        "[scanner] INACCESSIBLE metadata '{}' — {}",
                        entry_path.display(),
                        e
                    );
                    continue;
                }
            };

            if crate::rules::system::has_hidden_or_system_attributes(&metadata) {
                skipped += 1;
                log::debug!(
                    "[scanner] SKIP hidden/system attributes '{}'",
                    entry_path.display()
                );
                continue;
            }

            let size = if metadata.is_file() {
                metadata.len()
            } else {
                0
            };
            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let extension = entry_path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let parent_folder = entry_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new(""))
                .to_string_lossy()
                .to_string();

            let is_dir = metadata.is_dir();

            // Classify the entry using the global boundary system
            let kind =
                crate::rules::boundary::detect_boundary(&entry_path, Some(validated.as_path()));

            // Skip any path that is inside a protected zone.
            // System/drive-root entries should not reach here because validate_scan_path
            // blocks those roots, but we guard defensively anyway.
            match kind {
                crate::rules::boundary::BoundaryKind::InsideProjectTree => {
                    skipped += 1;
                    log::debug!(
                        "[scanner] SKIP InsideProjectTree '{}'",
                        entry_path.display()
                    );
                    continue;
                }
                crate::rules::boundary::BoundaryKind::SystemDriveRoot => {
                    skipped += 1;
                    log::warn!(
                        "[scanner] SKIP SystemDriveRoot '{}' (defensive guard)",
                        entry_path.display()
                    );
                    continue;
                }
                crate::rules::boundary::BoundaryKind::CriticalSystemPath => {
                    skipped += 1;
                    log::warn!(
                        "[scanner] SKIP CriticalSystemPath '{}' (defensive guard)",
                        entry_path.display()
                    );
                    continue;
                }
                _ => {}
            }

            // Map BoundaryKind → FileEntry.category (matches what Review.jsx expects)
            let category = match kind {
                crate::rules::boundary::BoundaryKind::ProjectRoot => {
                    log::debug!("[scanner] ACCEPT ProjectRoot '{}'", entry_path.display());
                    "Project"
                }
                crate::rules::boundary::BoundaryKind::EmptyFolder => {
                    log::debug!("[scanner] ACCEPT EmptyFolder '{}'", entry_path.display());
                    "Empty"
                }
                crate::rules::boundary::BoundaryKind::NamedFolder => {
                    log::debug!("[scanner] ACCEPT NamedFolder '{}'", entry_path.display());
                    "Mixed"
                }
                // UserCuratedFolder: surfaces to the UI as "Curated" so it can be
                // shown with a distinct protected badge rather than treated as Loose.
                crate::rules::boundary::BoundaryKind::UserCuratedFolder => {
                    log::debug!(
                        "[scanner] ACCEPT UserCuratedFolder '{}' (needs approval)",
                        entry_path.display()
                    );
                    "Curated"
                }
                crate::rules::boundary::BoundaryKind::Shortcut => {
                    log::debug!("[scanner] ACCEPT Shortcut '{}'", entry_path.display());
                    "Launcher"
                }
                // SystemDriveRoot / CriticalSystemPath are handled above; these arms
                // are unreachable but required for exhaustiveness.
                crate::rules::boundary::BoundaryKind::SystemDriveRoot
                | crate::rules::boundary::BoundaryKind::CriticalSystemPath => "Protected",
                _ => "Loose",
            };

            result.push(FileEntry {
                path: entry_path.to_string_lossy().to_string(),
                name,
                extension,
                size,
                modified_at,
                parent_folder,
                is_dir,
                category: category.to_string(),
            });

            if result.len() % 25 == 0 {
                let _ = app.emit(
                    "scan-progress",
                    ScanProgress {
                        scanned: result.len() as u32,
                        total: None,
                    },
                );
            }
        }

        let _ = app.emit(
            "scan-progress",
            ScanProgress {
                scanned: result.len() as u32,
                total: None,
            },
        );

        let path_str = validated.to_string_lossy().to_string();
        log::info!(
            "[scanner] DONE path='{}' enumerated={} visible={} skipped={} inaccessible={}",
            path_str,
            enumerated,
            result.len(),
            skipped,
            inaccessible
        );

        Ok(ScanResult {
            path: path_str,
            files: result,
            root_boundary: root_boundary_label,
            enumerated_count: enumerated,
            skipped_count: skipped,
            inaccessible_count: inaccessible,
            truncated,
        })
    })
    .await
    .map_err(|e| format!("Scanner task failed: {}", e))??;

    Ok(files)
}
