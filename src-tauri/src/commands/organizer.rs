use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::commands::ignore::{get_all_rules, is_ignored_by_rules};
use crate::contracts::{ApplyProgress, BuildPlanResult, MoveAction, OpSummary, PlanItem};
use crate::db::DbPool;

fn validate_destination_root(path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|e| {
        format!(
            "Destination path is invalid or inaccessible '{}': {}",
            path.display(),
            e
        )
    })?;

    if !canonical.is_dir() {
        return Err(format!(
            "Destination is not a valid directory: {}",
            canonical.display()
        ));
    }

    if crate::rules::system::is_drive_root(&canonical) {
        return Err(format!(
            "Destination folder cannot be a drive root: {}",
            canonical.display()
        ));
    }

    if crate::rules::system::is_critical_system_path(&canonical) {
        return Err(format!(
            "Destination folder is protected by the operating system: {}",
            canonical.display()
        ));
    }

    Ok(canonical)
}

fn resolve_root_path(item: &PlanItem, fallback_root_path: Option<&str>) -> Result<PathBuf, String> {
    let root_path = item
        .root_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| fallback_root_path.filter(|value| !value.trim().is_empty()))
        .ok_or_else(|| format!("No root path provided for '{}'", item.path))?;

    let root = PathBuf::from(root_path);
    if !root.is_dir() {
        return Err(format!("Root path is not a valid directory: {}", root_path));
    }

    if let (Ok(canonical_root), Ok(canonical_src)) = (
        root.canonicalize(),
        PathBuf::from(&item.path).canonicalize(),
    ) {
        if !canonical_src.starts_with(&canonical_root) {
            return Err(format!(
                "Source path escapes its review root. Root: '{}', Source: '{}'",
                canonical_root.display(),
                canonical_src.display()
            ));
        }
    }

    Ok(root)
}

pub fn build_plan(
    items: Vec<PlanItem>,
    root_path: Option<String>,
    destination_override: Option<String>,
    pool: &DbPool,
) -> Result<BuildPlanResult, String> {
    let fallback_root_path = root_path.as_deref();

    let destination_root = match destination_override
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        Some(p) => Some(validate_destination_root(Path::new(p))?),
        None => None,
    };

    let rules = get_all_rules(pool);

    let mut actions: Vec<MoveAction> = Vec::new();
    let mut skipped_by_rules = 0usize;

    for item in items {
        if !item.checked {
            continue;
        }

        let src = PathBuf::from(&item.path);
        let root = resolve_root_path(&item, fallback_root_path)?;

        if is_ignored_by_rules(&item.path, &rules) {
            skipped_by_rules += 1;
            continue;
        }

        let filename = src
            .file_name()
            .ok_or_else(|| format!("Cannot extract filename from: {}", item.path))?;

        // Unified boundary check — single source of truth for all protection decisions.
        // This ensures the organizer respects the same rules as scanner, watcher, and
        // classifier without duplicating logic.
        //
        // Blocked:
        //   - ProjectRoot / InsideProjectTree  (RULE 1/2 — projects are terminal)
        //   - SystemDriveRoot                  (RULE 4 — drive roots are protected)
        //   - CriticalSystemPath               (RULE 5 — OS dirs are protected)
        //   - Shortcut                         (RULE 8 — .lnk/.url never moved)
        //
        // UserCuratedFolder is NOT blocked here because the user has explicitly
        // selected this item in the review UI — that constitutes informed consent.
        // The curated protection applies to *automatic* descent, not user-initiated moves.
        {
            use crate::rules::boundary::{detect_boundary, BoundaryKind};
            let boundary = detect_boundary(&src, Some(root.as_path()));
            if matches!(
                boundary,
                BoundaryKind::ProjectRoot
                    | BoundaryKind::InsideProjectTree
                    | BoundaryKind::SystemDriveRoot
                    | BoundaryKind::CriticalSystemPath
                    | BoundaryKind::Shortcut
            ) {
                skipped_by_rules += 1;
                continue;
            }
        }
        // Resolve effective bucket path using organization_mode from settings.
        // Simple mode: "Documents/Finance" → "Documents" (top-level only).
        // Structured mode: "Documents/Finance" → "Documents/Finance" (full path).
        let effective_bucket = {
            let org_mode = crate::commands::settings::get_organization_mode(pool);
            if org_mode == "simple" {
                item.bucket
                    .split('/')
                    .next()
                    .unwrap_or(&item.bucket)
                    .to_string()
            } else {
                item.bucket.clone()
            }
        };

        let dest_root = destination_root.clone().unwrap_or_else(|| root.clone());
        let dest = effective_bucket
            .split('/')
            .fold(dest_root, |acc, part| acc.join(part))
            .join(filename);

        actions.push(MoveAction {
            path: item.path,
            destination_path: dest.to_string_lossy().into_owned(),
            root_path: Some(root.to_string_lossy().into_owned()),
        });
    }

    Ok(BuildPlanResult {
        actions,
        skipped_by_rules,
    })
}

#[tauri::command]
pub fn build_plan_cmd(
    items: Vec<PlanItem>,
    root_path: String,
    destination_override: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<BuildPlanResult, String> {
    build_plan(items, Some(root_path), destination_override, pool.inner())
}

fn get_unique_path(dest: &PathBuf) -> PathBuf {
    let mut final_path = dest.clone();
    let mut counter = 1u32;
    while final_path.exists() {
        let stem = dest.file_stem().unwrap_or_default().to_string_lossy();
        let ext = dest
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        final_path = dest.with_file_name(format!("{}_{}{}", stem, counter, ext));
        counter += 1;
    }
    final_path
}

pub async fn apply_plan(
    app: AppHandle,
    pool: DbPool,
    actions: Vec<MoveAction>,
) -> Result<OpSummary, String> {
    if actions.is_empty() {
        return Err("No actions provided".to_string());
    }

    for action in &actions {
        let dest_path = PathBuf::from(&action.destination_path);
        let source_root = action
            .root_path
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(&action.path)
                    .parent()
                    .map(|parent| parent.to_path_buf())
                    .unwrap_or_else(|| PathBuf::from(&action.path))
            });
        let boundary_root = source_root.parent().unwrap_or(&source_root);

        if dest_path.starts_with(boundary_root) {
            crate::commands::validate_path_within_root(boundary_root, &dest_path)?;
        }
    }

    let operation_id = Uuid::new_v4().to_string();
    let pool_clone = pool.clone();
    let op_id_clone = operation_id.clone();

    let summary = tokio::task::spawn_blocking(move || -> Result<OpSummary, String> {
        let total = actions.len();
        let mut move_plan: Vec<(i64, PathBuf, PathBuf)> = Vec::with_capacity(total);

        {
            let mut conn = pool_clone.get().map_err(|e| e.to_string())?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;

            tx.execute(
                "INSERT INTO operations (operation_id, status) VALUES (?1, 'pending')",
                rusqlite::params![&op_id_clone],
            )
            .map_err(|e| e.to_string())?;

            for action in &actions {
                let src = PathBuf::from(&action.path);
                let dst = get_unique_path(&PathBuf::from(&action.destination_path));
                let dst_str = dst.to_string_lossy().to_string();

                tx.execute(
                    "INSERT INTO file_moves
                     (operation_id, source_path, destination_path, action, status)
                     VALUES (?1, ?2, ?3, 'move', 'pending')",
                    rusqlite::params![&op_id_clone, &action.path, &dst_str],
                )
                .map_err(|e| e.to_string())?;

                let row_id = tx.last_insert_rowid();
                move_plan.push((row_id, src, dst));
            }

            tx.commit().map_err(|e| e.to_string())?;
        }

        let mut move_results: Vec<(i64, bool, Option<String>)> = Vec::with_capacity(total);
        let mut successful = 0usize;
        let mut failed = 0usize;

        for (index, (row_id, src, dst)) in move_plan.iter().enumerate() {
            if let Some(parent) = dst.parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    move_results.push((
                        *row_id,
                        false,
                        Some(format!("Cannot create destination directory: {}", e)),
                    ));
                    failed += 1;
                    continue;
                }
            }

            let move_result = crate::commands::move_path(src, dst);
            let success = move_result.is_ok();
            let error_message = move_result.err();

            if success {
                successful += 1;
            } else {
                failed += 1;
            }

            move_results.push((*row_id, success, error_message));

            let _ = app.emit(
                "apply-progress",
                ApplyProgress {
                    done: index + 1,
                    total,
                },
            );
        }

        {
            let mut conn = pool_clone.get().map_err(|e| e.to_string())?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;

            for (row_id, success, err_msg) in &move_results {
                let status = if *success { "completed" } else { "failed" };
                tx.execute(
                    "UPDATE file_moves
                     SET status = ?1, error_message = ?2
                     WHERE id = ?3",
                    rusqlite::params![status, err_msg, row_id],
                )
                .map_err(|e| e.to_string())?;
            }

            let op_status = if failed == 0 {
                "completed"
            } else if successful == 0 {
                "failed"
            } else {
                "partial"
            };

            tx.execute(
                "UPDATE operations SET status = ?1 WHERE operation_id = ?2",
                rusqlite::params![op_status, &op_id_clone],
            )
            .map_err(|e| e.to_string())?;

            tx.commit().map_err(|e| e.to_string())?;
        }

        Ok(OpSummary {
            operation_id: op_id_clone,
            total,
            successful,
            failed,
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(summary)
}

#[tauri::command]
pub async fn apply_plan_cmd(
    app: AppHandle,
    pool: State<'_, DbPool>,
    actions: Vec<MoveAction>,
) -> Result<OpSummary, String> {
    apply_plan(app, pool.inner().clone(), actions).await
}

/// Phase 5 alias: execute_moves accepts PlanItems + an optional session_id hint,
/// builds the plan internally, then executes it in one call.
#[tauri::command]
pub async fn execute_moves(
    app: AppHandle,
    pool: State<'_, DbPool>,
    items: Vec<crate::contracts::PlanItem>,
    session_id: Option<String>,
) -> Result<OpSummary, String> {
    let _ = session_id; // session_id reserved for future operation labelling
    let destination_override = crate::commands::settings::get_destination_override(pool.inner());
    let plan = build_plan(items, None, destination_override, pool.inner())?;
    if plan.actions.is_empty() {
        return Ok(OpSummary {
            operation_id: String::new(),
            total: 0,
            successful: 0,
            failed: 0,
        });
    }
    apply_plan(app, pool.inner().clone(), plan.actions).await
}
