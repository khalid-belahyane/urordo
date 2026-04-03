pub mod commands;
pub mod contracts;
pub mod db;
pub mod rules;

use db::schema::{init_db, run_migrations};
use std::fs;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;

/// Checks for available updates and emits an "update-available" event to the frontend.
///
/// This function is a no-op when updater.active = false in tauri.conf.json.
/// When ready to ship updates: set active:true, fill in pubkey and endpoints,
/// and this function will automatically start working.
///
/// Spawned 30 seconds after startup so it never delays first-run experience.
async fn check_for_updates(app: tauri::AppHandle) {
    if let Ok(updater) = app.updater() {
        match updater.check().await {
            Ok(Some(update)) => {
                // Update available — notify frontend via event
                let _ = app.emit(
                    "update-available",
                    serde_json::json!({
                        "version": update.version,
                        "currentVersion": update.current_version,
                        "body": update.body.unwrap_or_default(),
                    }),
                );
            }
            Ok(None) => {
                // Already up to date — silent success
            }
            Err(e) => {
                // Check failed — log silently, never surface to user
                eprintln!("[updater] Check failed: {}", e);
            }
        }
    }
}
fn build_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "Open urordo", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let watchers_label = MenuItem::with_id(
        app,
        "watchers",
        "Watcher status in app",
        false,
        None::<&str>,
    )?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let pause_all = MenuItem::with_id(
        app,
        "pause_all",
        "Pause / resume watchers",
        true,
        None::<&str>,
    )?;
    let separator3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit urordo", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &open,
            &separator1,
            &watchers_label,
            &separator2,
            &pause_all,
            &separator3,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("urordo-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("urordo")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.set_skip_taskbar(false);
                }
            }
            "pause_all" => {
                let engine = app.state::<commands::watcher::WatcherEngine>();
                engine.set_paused(!engine.is_paused());
                let pool = app.state::<db::DbPool>();
                let _ = commands::watcher::sync_watcher_status(app, pool.inner(), &engine);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                        let _ = window.set_skip_taskbar(true);
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.set_skip_taskbar(false);
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialise structured logging. Silent in release unless RUST_LOG is set.
    // In dev: `cargo tauri dev` will print all [scanner], [watcher], etc. traces.
    let _ = env_logger::try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second instance tried to launch — bring the existing window forward
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
                let _ = win.set_skip_taskbar(false);
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("database.sqlite");

            let pool = match init_db(&db_path) {
                Ok(p) => p,
                Err(e) => {
                    app.dialog()
                        .message(format!("Failed to initialize database: {}\n\nPlease make sure no other instance is running and you have proper permissions.", e))
                        .title("Urordo Startup Error")
                        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                        .blocking_show();
                    return Err(e.into());
                }
            };

            if let Err(e) = run_migrations(&pool) {
                app.dialog()
                    .message(format!("Database migration failed: {}\n\nPlease try restarting the application or wiping the database.", e))
                    .title("Urordo Startup Error")
                    .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                    .blocking_show();
                return Err(e.into());
            }

            app.manage(pool.clone());

            build_tray(app)?;

            let engine = commands::watcher::WatcherEngine::new();

            // Reload active watchers
            if let Ok(conn) = pool.get() {
                if let Ok(mut stmt) = conn.prepare("SELECT id, path FROM watched_folders WHERE is_active = 1") {
                    let active_watchers = stmt.query_map([], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                    }).unwrap().filter_map(|r| r.ok()).collect::<Vec<_>>();
                    for (id, path) in active_watchers {
                        let _ = engine.start_watching(path, id, app.handle().clone());
                    }
                }
            }

            app.manage(engine);
            {
                let engine = app.state::<commands::watcher::WatcherEngine>();
                let _ = commands::watcher::sync_watcher_status(&app.handle().clone(), &pool, &engine);
            }

            // Show the window now that setup is complete.
            // tauri.conf.json sets visible:false so the window starts hidden,
            // preventing the white flash that occurs if the window appears before
            // the React app and Rust DB initialisation are both ready.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_skip_taskbar(false);
            }

            // Spawn deferred update check — 30s delay keeps startup snappy.
            // This is a no-op until updater.active = true in tauri.conf.json.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                check_for_updates(app_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ── Scanner ────────────────────────────────────────────────────
            commands::scanner::scan_directory,

            // ── Classifier ─────────────────────────────────────────────────
            commands::classifier::classify_batch,
            commands::classifier::add_correction,

            // ── Organizer ──────────────────────────────────────────────────
            commands::organizer::build_plan_cmd,
            commands::organizer::apply_plan_cmd,
            commands::organizer::execute_moves,

            // ── Rollback ───────────────────────────────────────────────────
            commands::rollback::rollback_moves_cmd,
            commands::rollback::rollback_session,

            // ── Settings ───────────────────────────────────────────────────
            commands::settings::get_settings_cmd,
            commands::settings::update_settings_cmd,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::save_settings,
            commands::settings::get_common_paths_cmd,
            commands::settings::factory_reset_cmd,

            // ── History ────────────────────────────────────────────────────
            commands::history::list_history_cmd,
            commands::history::get_move_log,

            // ── License + AI ───────────────────────────────────────────────
            commands::license::validate_license_cmd,
            commands::ai::validate_gemini_key_cmd,

            // ── Ignore Rules ───────────────────────────────────────────────
            commands::ignore::get_ignore_rules_cmd,
            commands::ignore::add_ignore_rule_cmd,
            commands::ignore::remove_ignore_rule_cmd,

            // ── Watchers ───────────────────────────────────────────────────
            commands::watcher::add_watched_folder_cmd,
            commands::watcher::remove_watched_folder_cmd,
            commands::watcher::toggle_watcher_cmd,
            commands::watcher::get_watched_folders_cmd,
            commands::watcher::update_watcher_settings_cmd,
            commands::watcher::get_pending_files_cmd,
            commands::watcher::resolve_pending_files_cmd,
            commands::watcher::get_watcher_status_cmd,
            commands::watcher::refresh_watcher_status_cmd,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                let _ = window.set_skip_taskbar(true);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
