use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use tauri::State;

use crate::contracts::IgnoreRule;

#[tauri::command]
pub async fn get_ignore_rules_cmd(
    pool: State<'_, Pool<SqliteConnectionManager>>,
) -> Result<Vec<IgnoreRule>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, rule_type, value, created_at FROM ignore_rules ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rules = stmt
        .query_map([], |row| {
            Ok(IgnoreRule {
                id: row.get(0)?,
                rule_type: row.get(1)?,
                value: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(rules)
}

#[tauri::command]
pub async fn add_ignore_rule_cmd(
    rule_type: String,
    value: String,
    pool: State<'_, Pool<SqliteConnectionManager>>,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO ignore_rules (rule_type, value) VALUES (?1, ?2)",
        rusqlite::params![rule_type, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_ignore_rule_cmd(
    id: i64,
    pool: State<'_, Pool<SqliteConnectionManager>>,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM ignore_rules WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// Helper to retrieve all active ignore rules from the database
pub fn get_all_rules(pool: &Pool<SqliteConnectionManager>) -> Vec<IgnoreRule> {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let mut stmt = match conn.prepare("SELECT id, rule_type, value, created_at FROM ignore_rules") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    stmt.query_map([], |row| {
        Ok(IgnoreRule {
            id: row.get(0).unwrap_or(0),
            rule_type: row.get(1).unwrap_or_default(),
            value: row.get(2).unwrap_or_default(),
            created_at: row.get(3).unwrap_or_default(),
        })
    })
    .map(|iter| iter.filter_map(Result::ok).collect())
    .unwrap_or_default()
}

pub fn is_ignored_by_rules(path_str: &str, rules: &[IgnoreRule]) -> bool {
    let path_lower = path_str.to_lowercase();

    for rule in rules {
        let val_lower = rule.value.to_lowercase();

        match rule.rule_type.as_str() {
            "extension" => {
                if path_lower.ends_with(&val_lower) {
                    return true;
                }
            }
            "folder" => {
                if path_lower.contains(&val_lower) {
                    return true;
                }
            }
            "keyword" => {
                let filename = std::path::Path::new(path_str)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase();
                if filename.contains(&val_lower) {
                    return true;
                }
            }
            _ => {}
        }
    }

    false
}

// Helper to check if a path is ignored (lazy load).
// Delegates to get_all_rules + is_ignored_by_rules to avoid duplicated matching logic.
pub fn is_ignored(path_str: &str, pool: &Pool<SqliteConnectionManager>) -> bool {
    let rules = get_all_rules(pool);
    is_ignored_by_rules(path_str, &rules)
}
