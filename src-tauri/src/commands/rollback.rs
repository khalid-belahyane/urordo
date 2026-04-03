use crate::db::DbPool;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Emitter, State};

use crate::contracts::{RollbackProgress, RollbackResult};

/// Phase 5 alias: rollback_session rolls back all moves in a given session_id
/// (equivalent to operation_id in the existing rollback system).
#[tauri::command]
pub async fn rollback_session(
    app: AppHandle,
    pool: State<'_, DbPool>,
    session_id: String,
) -> Result<RollbackResult, String> {
    rollback_moves_cmd(app, pool, Some(vec![session_id]), None).await
}

/// Revert one or more file moves.
///
/// Priority of parameters:
///   1. `item_ids` (Vec<i64>) — selectively revert specific `file_moves.id` rows.
///   2. `operation_id` (Vec<String>) — revert all completed moves in those operations.
///   3. Neither provided — revert the most recent operation.
///
/// Note: the frontend sends `operationId` (singular camelCase), which Tauri
/// deserialises as `operation_id` (snake_case Vec<String>).
#[tauri::command]
pub async fn rollback_moves_cmd(
    app: AppHandle,
    pool: State<'_, DbPool>,
    operation_id: Option<Vec<String>>,
    item_ids: Option<Vec<i64>>,
) -> Result<RollbackResult, String> {
    let pool_clone = pool.inner().clone();

    let res = tokio::task::spawn_blocking(move || -> Result<RollbackResult, String> {
        let conn = pool_clone.get().map_err(|e| e.to_string())?;

        // ── Step 1: Collect rows to revert ──────────────────────────────────────
        // (id, operation_id, source_path, destination_path)
        let to_revert: Vec<(i64, String, String, String)> = if let Some(ref ids) = item_ids {
            // Per-file selective rollback
            if ids.is_empty() {
                return Ok(RollbackResult {
                    success: true,
                    status: "noop".to_string(),
                    total_requested: 0,
                    reverted_count: 0,
                    missing_count: 0,
                });
            }
            let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let query = format!(
                "SELECT id, operation_id, source_path, destination_path
                 FROM file_moves
                 WHERE id IN ({}) AND status = 'completed'",
                placeholders
            );
            let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params_from_iter(ids.iter()), |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3).unwrap_or_default(),
                    ))
                })
                .map_err(|e| e.to_string())?;
            rows.filter_map(|r| r.ok()).collect()
        } else if let Some(ref op_ids) = operation_id {
            // Full operation rollback
            if op_ids.is_empty() {
                return Ok(RollbackResult {
                    success: true,
                    status: "noop".to_string(),
                    total_requested: 0,
                    reverted_count: 0,
                    missing_count: 0,
                });
            }
            let placeholders = op_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let query = format!(
                "SELECT id, operation_id, source_path, destination_path
                 FROM file_moves
                 WHERE operation_id IN ({}) AND status = 'completed'",
                placeholders
            );
            let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params_from_iter(op_ids.iter()), |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3).unwrap_or_default(),
                    ))
                })
                .map_err(|e| e.to_string())?;
            rows.filter_map(|r| r.ok()).collect()
        } else {
            // Default: most recent completed operation
            let query = "SELECT id, operation_id, source_path, destination_path
                         FROM file_moves
                         WHERE operation_id = (
                             SELECT operation_id FROM operations
                             WHERE status = 'completed' OR status = 'partial'
                             ORDER BY created_at DESC LIMIT 1
                         ) AND status = 'completed'";
            let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3).unwrap_or_default(),
                    ))
                })
                .map_err(|e| e.to_string())?;
            rows.filter_map(|r| r.ok()).collect()
        };

        let total_requested = to_revert.len();
        let mut reverted_count = 0usize;
        let mut missing_count = 0usize;

        // ── Step 2: Perform rollback moves ───────────────────────────────────────
        for (id, op_id, src_str, dest_str) in to_revert {
            let dest_path = PathBuf::from(&dest_str);
            let src_path = PathBuf::from(&src_str);

            let (success, new_status) = if dest_str.is_empty() || !dest_path.exists() {
                missing_count += 1;
                // Mark as rolled_back anyway so the UI reflects it was attempted
                (false, "rollback_failed")
            } else {
                // Ensure the original directory still exists
                if let Some(parent) = src_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }

                let moved = crate::commands::move_path(&dest_path, &src_path).is_ok();

                if moved {
                    reverted_count += 1;
                    (true, "rolled_back")
                } else {
                    missing_count += 1;
                    (false, "rollback_failed")
                }
            };

            // Update this row's status
            let _ = conn.execute(
                "UPDATE file_moves SET status = ?1 WHERE id = ?2",
                rusqlite::params![new_status, id],
            );

            // After each file update, check if all moves in this operation have reached
            // a terminal state (rolled_back or rollback_failed). Runs regardless of
            // whether this individual move succeeded, so operations are always settled.
            let remaining_completed: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM file_moves WHERE operation_id = ?1 AND status = 'completed'",
                    rusqlite::params![&op_id],
                    |row| row.get(0),
                )
                .unwrap_or(1);

            if remaining_completed == 0 {
                let failed_count: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM file_moves WHERE operation_id = ?1 AND status = 'rollback_failed'",
                        rusqlite::params![&op_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);
                let op_status = if failed_count == 0 { "rolled_back" } else { "partial_rollback" };
                let _ = conn.execute(
                    "UPDATE operations SET status = ?1 WHERE operation_id = ?2",
                    rusqlite::params![op_status, &op_id],
                );
            }

            let _ = app.emit("rollback-progress", RollbackProgress {
                id,
                success,
                original_path: src_str.clone(),
            });
        }

        let status = if total_requested == 0 {
            "noop"
        } else if missing_count == 0 {
            "rolled_back"
        } else if reverted_count == 0 {
            "rollback_failed"
        } else {
            "partial_rollback"
        };

        Ok(RollbackResult {
            success: matches!(status, "noop" | "rolled_back"),
            status: status.to_string(),
            total_requested,
            reverted_count,
            missing_count,
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(res)
}
