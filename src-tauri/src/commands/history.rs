use crate::db::DbPool;
use tauri::State;

use crate::contracts::{HistoryResult, MoveLog, MoveLogEntry, OperationLog};

#[tauri::command]
pub async fn list_history_cmd(
    pool: State<'_, DbPool>,
    page: Option<i64>,
    per_page: Option<i64>,
) -> Result<HistoryResult, String> {
    let pg = page.unwrap_or(1).max(1);
    let pp = per_page.unwrap_or(20).clamp(1, 100);
    let offset = (pg - 1) * pp;

    let conn = pool.get().map_err(|e| e.to_string())?;

    // Total pages
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM operations", [], |row| row.get(0))
        .unwrap_or(0);
    let total_pages = (count + pp - 1) / pp;

    let mut stmt = conn.prepare("SELECT operation_id, status, created_at FROM operations ORDER BY created_at DESC LIMIT ?1 OFFSET ?2").map_err(|e| e.to_string())?;

    let mut operations = Vec::new();
    let rows = stmt
        .query_map([pp, offset], |row| {
            Ok(OperationLog {
                operation_id: row.get(0)?,
                status: row.get(1)?,
                created_at: row.get(2)?,
                moves: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?;

    for r in rows {
        if let Ok(op) = r {
            operations.push(op);
        }
    }

    if operations.is_empty() {
        return Ok(HistoryResult {
            total_pages,
            items: vec![],
        });
    }

    // Now fetch nested moves using IN clause
    let op_ids: Vec<String> = operations.iter().map(|o| o.operation_id.clone()).collect();
    let placeholders = op_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!("SELECT id, operation_id, source_path, destination_path, action, status FROM file_moves WHERE operation_id IN ({})", placeholders);

    let mut moves_stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut moves_rows = moves_stmt
        .query(rusqlite::params_from_iter(op_ids.iter()))
        .map_err(|e| e.to_string())?;

    while let Ok(Some(row)) = moves_rows.next() {
        let id: i64 = row.get(0).unwrap_or(0);
        let op_id: String = row.get(1).unwrap_or_default();
        let src: String = row.get(2).unwrap_or_default();
        let dest: String = row.get(3).unwrap_or_default();
        let action: String = row.get(4).unwrap_or_default();
        let status: String = row.get(5).unwrap_or_default();

        if let Some(op) = operations.iter_mut().find(|o| o.operation_id == op_id) {
            op.moves.push(MoveLog {
                id,
                source_path: src,
                destination_path: Some(dest),
                action,
                status,
            });
        }
    }

    Ok(HistoryResult {
        total_pages,
        items: operations,
    })
}

/// Returns recent move_log entries (up to `limit`).
/// Reads from the move_log view which joins file_moves + operations.
#[tauri::command]
pub async fn get_move_log(
    pool: State<'_, DbPool>,
    limit: Option<i64>,
) -> Result<Vec<MoveLogEntry>, String> {
    let n = limit.unwrap_or(50).clamp(1, 500);
    let conn = pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, original_path, destination_path,
                    bucket, confidence, layer, timestamp, rolled_back
             FROM move_log
             ORDER BY timestamp DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([n], |row| {
            Ok(MoveLogEntry {
                id: row.get(0)?,
                session_id: row.get(1)?,
                original_path: row.get(2)?,
                destination_path: row.get(3)?,
                bucket: row.get(4)?,
                confidence: row.get(5)?,
                layer: row.get(6)?,
                timestamp: row.get(7)?,
                rolled_back: row.get::<_, i64>(8).map(|v| v != 0).unwrap_or(false),
            })
        })
        .map_err(|e| e.to_string())?;

    let entries: Vec<MoveLogEntry> = rows.filter_map(|r| r.ok()).collect();
    Ok(entries)
}
