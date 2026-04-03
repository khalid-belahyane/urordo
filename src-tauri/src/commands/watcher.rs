use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use chrono::Utc;
use jwalk::WalkDir;
use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use tauri::{Emitter, Manager};

use crate::contracts::{PendingFile, PlanItem, WatchedFolder, WatcherEvent, WatcherStatus};

pub struct WatcherEngine {
    watchers: Arc<Mutex<HashMap<String, Box<dyn std::any::Any + Send + Sync>>>>,
    paused: Arc<AtomicBool>,
}

impl WatcherEngine {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
            paused: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::SeqCst);
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    pub fn start_watching(
        &self,
        folder_path: String,
        watcher_id: i64,
        app_handle: tauri::AppHandle,
    ) -> Result<(), String> {
        let path = PathBuf::from(&folder_path);
        let app = app_handle.clone();
        let watcher_root = folder_path.clone();
        let paused = self.paused.clone();
        let (tx, rx) = std::sync::mpsc::channel();

        let mut debouncer =
            new_debouncer(std::time::Duration::from_secs(2), tx).map_err(|e| e.to_string())?;

        debouncer
            .watcher()
            .watch(&path, RecursiveMode::Recursive)
            .map_err(|e| format!("Cannot watch {:?}: {}", path, e))?;

        std::thread::spawn(move || {
            for result in rx {
                match result {
                    Ok(events) => {
                        for event in events {
                            let path = event.path;
                            if !path.exists() || path.is_dir() || is_hidden_path(&path) {
                                continue;
                            }

                            use r2d2::Pool;
                            use r2d2_sqlite::SqliteConnectionManager;

                            let Some(pool_state) = app.try_state::<Pool<SqliteConnectionManager>>()
                            else {
                                continue;
                            };

                            let pool = pool_state.inner().clone();
                            let path_str = path.to_string_lossy().to_string();
                            if crate::commands::ignore::is_ignored(&path_str, &pool) {
                                continue;
                            }

                            use crate::rules::boundary::{detect_boundary, BoundaryKind};
                            let watcher_root_path = Path::new(&watcher_root);
                            if is_inside_curated_subtree(&path, watcher_root_path) {
                                continue;
                            }
                            let boundary = detect_boundary(&path, Some(watcher_root_path));
                            // RULE 1/2: projects, RULE 4/5: system/drive roots — skip all of these.
                            if matches!(
                                boundary,
                                BoundaryKind::InsideProjectTree
                                    | BoundaryKind::ProjectRoot
                                    | BoundaryKind::SystemDriveRoot
                                    | BoundaryKind::CriticalSystemPath
                                    | BoundaryKind::UserCuratedFolder
                            ) {
                                continue;
                            }

                            record_watcher_activity(watcher_id, &pool);

                            let (auto_organise, mode) = get_watcher_settings(watcher_id, &pool);
                            let is_paused = paused.load(Ordering::SeqCst);

                            if is_paused || !auto_organise || mode == "review" {
                                let event_type = if is_paused { "paused" } else { "created" };
                                queue_for_review(
                                    &app,
                                    &pool,
                                    watcher_id,
                                    &watcher_root,
                                    &path,
                                    event_type,
                                );
                                continue;
                            }

                            let app_handle_clone = app.clone();
                            let pool_clone = pool.clone();
                            let watcher_root_clone = watcher_root.clone();
                            tauri::async_runtime::spawn(async move {
                                handle_auto_organise_file(
                                    app_handle_clone,
                                    pool_clone,
                                    watcher_id,
                                    watcher_root_clone,
                                    path_str,
                                )
                                .await;
                            });
                        }
                    }
                    Err(error) => {
                        eprintln!("[watcher] Error: {:?}", error);
                    }
                }
            }
        });

        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;
        watchers.insert(folder_path, Box::new(debouncer));
        Ok(())
    }

    pub fn stop_watching(&self, folder_path: &str) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;
        watchers.remove(folder_path);
        Ok(())
    }
}

fn is_hidden_path(path: &Path) -> bool {
    let metadata = std::fs::metadata(path).ok();
    crate::rules::system::is_hidden_or_system_entry(path, metadata.as_ref())
}

fn is_inside_curated_subtree(path: &Path, watcher_root: &Path) -> bool {
    crate::rules::system::is_inside_user_curated_ancestor(path, watcher_root)
}

fn record_watcher_activity(
    watcher_id: i64,
    pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
) {
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "UPDATE watched_folders
             SET files_processed = files_processed + 1,
                 last_activity = datetime('now')
             WHERE id = ?1",
            rusqlite::params![watcher_id],
        );
    }
}

fn queue_pending_file(
    watcher_id: i64,
    path: &Path,
    pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
) {
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO watcher_pending_files (watcher_id, path) VALUES (?1, ?2)",
            rusqlite::params![watcher_id, path.to_string_lossy().to_string()],
        );
    }
}

fn emit_watcher_event(
    app: &tauri::AppHandle,
    watcher_id: i64,
    watcher_root: &str,
    path: &Path,
    event_type: &str,
) {
    let filename = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let payload = WatcherEvent {
        event_type: event_type.to_string(),
        path: path.to_string_lossy().to_string(),
        filename: filename.clone(),
        watcher_id,
        root_path: watcher_root.to_string(),
        timestamp: Utc::now().to_rfc3339(),
    };

    let _ = app.emit("watcher-event", &payload);

    use tauri_plugin_notification::NotificationExt;

    let watcher_name = watcher_root
        .split(&['/', '\\'][..])
        .last()
        .unwrap_or(watcher_root);
    app.notification()
        .builder()
        .title("urordo")
        .body(format!("New file in {}: {}", watcher_name, filename))
        .show()
        .ok();
}

fn queue_for_review(
    app: &tauri::AppHandle,
    pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
    watcher_id: i64,
    watcher_root: &str,
    path: &Path,
    event_type: &str,
) {
    queue_pending_file(watcher_id, path, pool);
    emit_watcher_event(app, watcher_id, watcher_root, path, event_type);

    if let Some(engine) = app.try_state::<WatcherEngine>() {
        let _ = sync_watcher_status(app, pool, &engine);
    }
}

async fn handle_auto_organise_file(
    app: tauri::AppHandle,
    pool: r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
    watcher_id: i64,
    watcher_root: String,
    file_path: String,
) {
    match crate::commands::classifier::classify_batch_inner(
        &pool,
        vec![file_path.clone()],
        Some(&watcher_root),
    )
    .await
    {
        Ok(classifications) => {
            let destination_override = crate::commands::settings::get_destination_override(&pool);
            // Use the configured auto_move_threshold — files above this confidence are
            // auto-moved; files below it are pushed to the review queue.
            let auto_move_threshold = crate::commands::settings::get_auto_move_threshold(&pool);

            let mut review_paths: Vec<String> = Vec::new();
            let mut plan_items: Vec<PlanItem> = Vec::new();

            for classification in classifications {
                // RULE 1/2: keep actions (projects, shortcuts) never go to plan_items
                if classification.action == "move"
                    && classification.confidence >= auto_move_threshold
                {
                    plan_items.push(PlanItem {
                        path: classification.path,
                        bucket: classification.bucket,
                        checked: true,
                        root_path: Some(watcher_root.clone()),
                    });
                } else {
                    review_paths.push(classification.path);
                }
            }

            if !plan_items.is_empty() {
                match crate::commands::organizer::build_plan(
                    plan_items,
                    None,
                    destination_override,
                    &pool,
                ) {
                    Ok(plan) if !plan.actions.is_empty() => {
                        match crate::commands::organizer::apply_plan(
                            app.clone(),
                            pool.clone(),
                            plan.actions,
                        )
                        .await
                        {
                            Ok(summary) => {
                                if let Ok(conn) = pool.get() {
                                    let _ = conn.execute(
                                        "INSERT INTO auto_organise_log (watcher_id, operation_id, files_moved, status)
                                         VALUES (?1, ?2, ?3, 'completed')",
                                        rusqlite::params![
                                            watcher_id,
                                            summary.operation_id,
                                            summary.successful as i64
                                        ],
                                    );
                                }
                            }
                            Err(error) => {
                                eprintln!("[watcher] Auto-organise failed: {}", error);
                                review_paths.push(file_path.clone());
                            }
                        }
                    }
                    Ok(_) => {}
                    Err(error) => {
                        eprintln!("[watcher] Could not build auto-organise plan: {}", error);
                        review_paths.push(file_path.clone());
                    }
                }
            }

            for review_path in review_paths {
                let review_path_buf = PathBuf::from(&review_path);
                if review_path_buf.exists() {
                    queue_for_review(
                        &app,
                        &pool,
                        watcher_id,
                        &watcher_root,
                        &review_path_buf,
                        "review_required",
                    );
                }
            }
        }
        Err(error) => {
            eprintln!("[watcher] Classification failed: {}", error);
            let path = PathBuf::from(&file_path);
            if path.exists() {
                queue_for_review(
                    &app,
                    &pool,
                    watcher_id,
                    &watcher_root,
                    &path,
                    "review_required",
                );
            }
        }
    }

    if let Some(engine) = app.try_state::<WatcherEngine>() {
        let _ = sync_watcher_status(&app, &pool, &engine);
    }
}

fn get_watcher_settings(
    watcher_id: i64,
    pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
) -> (bool, String) {
    if let Ok(conn) = pool.get() {
        if let Ok(mut stmt) = conn
            .prepare("SELECT auto_organise, auto_organise_mode FROM watched_folders WHERE id = ?1")
        {
            if let Ok(mut rows) = stmt.query(rusqlite::params![watcher_id]) {
                if let Ok(Some(row)) = rows.next() {
                    let auto_organise: bool = row.get(0).unwrap_or(false);
                    let mode: String = row.get(1).unwrap_or("review".to_string());
                    return (auto_organise, mode);
                }
            }
        }
    }

    (false, "review".to_string())
}

fn seed_pending_files(
    folder_path: &str,
    watcher_id: i64,
    pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
) {
    let root_path_string = folder_path.to_string();
    let walk = WalkDir::new(folder_path)
        .skip_hidden(true)
        .process_read_dir(move |_, _, _, children| {
            children.retain(|dir_entry_result| {
                if let Ok(dir_entry) = dir_entry_result {
                    if dir_entry.file_type().is_dir() {
                        use crate::rules::boundary::{detect_boundary, BoundaryKind};
                        let root_path = Path::new(&root_path_string);
                        let b = detect_boundary(&dir_entry.path(), Some(root_path));
                        // RULE 1/2: project tree + RULE 4/5: system/drive roots.
                        // UserCuratedFolder is also blocked from recursive seeding by default.
                        if matches!(
                            b,
                            BoundaryKind::ProjectRoot
                                | BoundaryKind::InsideProjectTree
                                | BoundaryKind::SystemDriveRoot
                                | BoundaryKind::CriticalSystemPath
                                | BoundaryKind::UserCuratedFolder
                        ) {
                            return false;
                        }
                    }
                }
                true
            });
        });

    for entry in walk.into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() || is_hidden_path(&path) {
            continue;
        }

        let path_str = path.to_string_lossy().to_string();
        if crate::commands::ignore::is_ignored(&path_str, pool) {
            continue;
        }

        use crate::rules::boundary::{detect_boundary, BoundaryKind};
        let root_path = Path::new(folder_path);
        if is_inside_curated_subtree(&path, root_path) {
            continue;
        }
        let b = detect_boundary(&path, Some(root_path));
        if matches!(
            b,
            BoundaryKind::InsideProjectTree
                | BoundaryKind::ProjectRoot
                | BoundaryKind::SystemDriveRoot
                | BoundaryKind::CriticalSystemPath
                | BoundaryKind::UserCuratedFolder
        ) {
            continue;
        }

        queue_pending_file(watcher_id, &path, pool);
    }
}

fn get_pending_files(
    pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
) -> Result<Vec<PendingFile>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT wpf.id, wpf.path, wpf.watcher_id, wf.path
             FROM watcher_pending_files wpf
             JOIN watched_folders wf ON wf.id = wpf.watcher_id
             WHERE wf.is_active = 1
             ORDER BY wpf.detected_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(i64, String, i64, String)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();

    let mut pending = Vec::new();
    let mut to_delete = Vec::new();

    for (id, path_str, watcher_id, root_path) in rows {
        if !Path::new(&path_str).exists() {
            to_delete.push(id);
            continue;
        }

        if is_inside_curated_subtree(Path::new(&path_str), Path::new(&root_path)) {
            to_delete.push(id);
            continue;
        }

        if is_hidden_path(Path::new(&path_str)) {
            to_delete.push(id);
            continue;
        }

        if crate::commands::ignore::is_ignored(&path_str, pool) {
            to_delete.push(id);
            continue;
        }

        let filename = Path::new(&path_str)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        pending.push(PendingFile {
            path: path_str,
            watcher_id,
            root_path,
            filename,
        });
    }

    for id in to_delete {
        let _ = conn.execute(
            "DELETE FROM watcher_pending_files WHERE id = ?1",
            rusqlite::params![id],
        );
    }

    Ok(pending)
}

fn resolve_pending_files(
    pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
    paths: &[String],
) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }

    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for path in paths {
        tx.execute(
            "DELETE FROM watcher_pending_files WHERE path = ?1",
            rusqlite::params![path],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())
}

pub fn collect_watcher_status(
    pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
    engine: &WatcherEngine,
) -> Result<WatcherStatus, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let active_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM watched_folders WHERE is_active = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let pending_count = get_pending_files(pool)?.len();

    Ok(WatcherStatus {
        active_count,
        pending_count,
        paused: engine.is_paused(),
    })
}

pub fn sync_watcher_status(
    app: &tauri::AppHandle,
    pool: &r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>,
    engine: &WatcherEngine,
) -> Result<WatcherStatus, String> {
    let status = collect_watcher_status(pool, engine)?;

    if let Some(tray) = app.tray_by_id("urordo-tray") {
        let tooltip = if status.paused {
            if status.pending_count > 0 {
                format!(
                    "urordo - Watchers paused ({} pending review)",
                    status.pending_count
                )
            } else {
                "urordo - Watchers paused".to_string()
            }
        } else if status.pending_count > 0 {
            format!(
                "urordo - {} file{} pending review",
                status.pending_count,
                if status.pending_count == 1 { "" } else { "s" }
            )
        } else if status.active_count > 0 {
            format!(
                "urordo - Watching {} folder{}",
                status.active_count,
                if status.active_count == 1 { "" } else { "s" }
            )
        } else {
            "urordo".to_string()
        };

        tray.set_tooltip(Some(&tooltip))
            .map_err(|e| e.to_string())?;
    }

    let _ = app.emit("watchers-state-changed", &status);
    Ok(status)
}

#[tauri::command]
pub async fn add_watched_folder_cmd(
    path: String,
    auto_organise: bool,
    pool: tauri::State<'_, crate::db::DbPool>,
    app: tauri::AppHandle,
) -> Result<WatchedFolder, String> {
    let watch_path = std::path::PathBuf::from(&path);
    if !watch_path.exists() || !watch_path.is_dir() {
        return Err("Path is not a valid directory".into());
    }

    // SAFETY — RULE 4: Drive roots must never be registered as watch targets.
    if crate::rules::system::is_drive_root(&watch_path) {
        return Err("Cannot watch a drive root directly. \
             Please select a specific folder inside it (e.g. Desktop or Downloads)."
            .into());
    }

    // SAFETY — RULE 5: Critical OS system directories are always protected.
    if crate::rules::system::is_critical_system_path(&watch_path) {
        return Err("Cannot watch a protected system directory. \
             This directory is managed by the operating system."
            .into());
    }

    let conn = pool.get().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM watched_folders WHERE path = ?",
            rusqlite::params![path],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if count > 0 {
        return Err("Folder is already being watched".into());
    }

    conn.execute(
        "INSERT INTO watched_folders (path, auto_organise, is_active) VALUES (?, ?, ?)",
        rusqlite::params![path, if auto_organise { 1 } else { 0 }, 1],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    let folder = WatchedFolder {
        id,
        path: path.clone(),
        is_active: true,
        auto_organise,
        auto_organise_mode: "review".to_string(),
        files_processed: 0,
        last_activity: None,
    };

    if !auto_organise {
        seed_pending_files(&path, id, pool.inner());
    }

    let engine = app.state::<WatcherEngine>();
    engine.start_watching(path, id, app.clone())?;
    let _ = sync_watcher_status(&app, pool.inner(), &engine);

    Ok(folder)
}

#[tauri::command]
pub async fn remove_watched_folder_cmd(
    id: i64,
    pool: tauri::State<'_, crate::db::DbPool>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let path: String = match conn.query_row(
        "SELECT path FROM watched_folders WHERE id = ?",
        rusqlite::params![id],
        |row| row.get(0),
    ) {
        Ok(path) => path,
        Err(_) => return Ok(()),
    };

    let engine = app.state::<WatcherEngine>();
    engine.stop_watching(&path)?;

    let _ = conn.execute(
        "DELETE FROM watcher_pending_files WHERE watcher_id = ?",
        rusqlite::params![id],
    );
    conn.execute(
        "DELETE FROM watched_folders WHERE id = ?",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    let _ = sync_watcher_status(&app, pool.inner(), &engine);
    Ok(())
}

#[tauri::command]
pub async fn toggle_watcher_cmd(
    id: i64,
    is_active: bool,
    pool: tauri::State<'_, crate::db::DbPool>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE watched_folders SET is_active = ? WHERE id = ?",
        rusqlite::params![if is_active { 1 } else { 0 }, id],
    )
    .map_err(|e| e.to_string())?;

    let (path, auto_organise, mode): (String, bool, String) = conn
        .query_row(
            "SELECT path, auto_organise, auto_organise_mode FROM watched_folders WHERE id = ?",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get::<_, i64>(1)? == 1, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let engine = app.state::<WatcherEngine>();
    if is_active {
        engine.start_watching(path.clone(), id, app.clone())?;
        if !auto_organise || mode == "review" {
            seed_pending_files(&path, id, pool.inner());
        }
    } else {
        engine.stop_watching(&path)?;
    }

    let _ = sync_watcher_status(&app, pool.inner(), &engine);
    Ok(())
}

#[tauri::command]
pub async fn get_watched_folders_cmd(
    pool: tauri::State<'_, crate::db::DbPool>,
) -> Result<Vec<WatchedFolder>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, path, is_active, auto_organise, auto_organise_mode, files_processed, last_activity
             FROM watched_folders
             ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;

    let folders = stmt
        .query_map([], |row| {
            Ok(WatchedFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                is_active: row.get::<_, i64>(2)? == 1,
                auto_organise: row.get::<_, i64>(3)? == 1,
                auto_organise_mode: row.get(4)?,
                files_processed: row.get(5)?,
                last_activity: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|value| value.ok())
        .collect();

    Ok(folders)
}

#[tauri::command]
pub async fn update_watcher_settings_cmd(
    id: i64,
    auto_organise: bool,
    auto_organise_mode: String,
    pool: tauri::State<'_, crate::db::DbPool>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE watched_folders SET auto_organise = ?, auto_organise_mode = ? WHERE id = ?",
        rusqlite::params![if auto_organise { 1 } else { 0 }, auto_organise_mode, id],
    )
    .map_err(|e| e.to_string())?;

    let engine = app.state::<WatcherEngine>();
    let _ = sync_watcher_status(&app, pool.inner(), &engine);
    Ok(())
}

#[tauri::command]
pub async fn get_pending_files_cmd(
    pool: tauri::State<'_, crate::db::DbPool>,
) -> Result<Vec<PendingFile>, String> {
    get_pending_files(pool.inner())
}

#[tauri::command]
pub async fn resolve_pending_files_cmd(
    paths: Vec<String>,
    pool: tauri::State<'_, crate::db::DbPool>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    resolve_pending_files(pool.inner(), &paths)?;
    let engine = app.state::<WatcherEngine>();
    let _ = sync_watcher_status(&app, pool.inner(), &engine);
    Ok(())
}

#[tauri::command]
pub async fn get_watcher_status_cmd(
    pool: tauri::State<'_, crate::db::DbPool>,
    app: tauri::AppHandle,
) -> Result<WatcherStatus, String> {
    let engine = app.state::<WatcherEngine>();
    collect_watcher_status(pool.inner(), &engine)
}

#[tauri::command]
pub async fn refresh_watcher_status_cmd(
    pool: tauri::State<'_, crate::db::DbPool>,
    app: tauri::AppHandle,
) -> Result<WatcherStatus, String> {
    let engine = app.state::<WatcherEngine>();
    sync_watcher_status(&app, pool.inner(), &engine)
}
