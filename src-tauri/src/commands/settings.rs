use crate::contracts::{AppSettings, CommonPaths, SettingsPayload};
use crate::db::DbPool;
use keyring::Entry;
use serde_json::Value;
use tauri::State;

// ---------------------------------------------------------------------------
// OS Keychain — all secret key material lives here, never in SQLite
// ---------------------------------------------------------------------------

const KEYRING_SERVICE: &str = "urordo";
const GEMINI_KEY_ACCOUNT: &str = "gemini_api_key";

/// Stores the Gemini API key in the OS Credential Manager.
/// Nothing is written to SQLite.
pub fn store_gemini_key(key: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, GEMINI_KEY_ACCOUNT).map_err(|e| e.to_string())?;
    entry.set_password(key).map_err(|e| e.to_string())
}

/// Retrieves the Gemini API key from the OS Credential Manager.
/// Returns an empty string if no key has been stored.
pub fn get_gemini_key() -> String {
    let entry = match Entry::new(KEYRING_SERVICE, GEMINI_KEY_ACCOUNT) {
        Ok(e) => e,
        Err(_) => return String::new(),
    };
    match entry.get_password() {
        Ok(key) => key,
        Err(keyring::Error::NoEntry) => String::new(),
        Err(_) => String::new(),
    }
}

/// Deletes the Gemini API key from the OS Credential Manager.
fn delete_gemini_key() -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, GEMINI_KEY_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Display masking — only for UI display, never for storage
// ---------------------------------------------------------------------------

/// Returns a display-safe masked version of the API key.
/// Example: "AIzaSyBxyz...1234" → "AIzaSyB••••••••1234"
fn mask_api_key(key: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 8 {
        return "••••••••".to_string();
    }
    let prefix: String = chars[..7].iter().collect();
    let suffix: String = chars[chars.len() - 4..].iter().collect();
    format!("{}••••••••{}", prefix, suffix)
}

// ---------------------------------------------------------------------------
// Internal helpers used by other commands
// ---------------------------------------------------------------------------

/// Returns the real Gemini API key for use in HTTP calls (ai.rs).
/// Called from Rust only — this value never travels to the frontend.
pub fn get_gemini_key_internal(_pool: &DbPool) -> String {
    get_gemini_key()
}

/// Returns whether Smart Mode is enabled.
/// Reads through AppSettings for consistent default handling.
pub fn is_smart_mode_enabled(pool: &DbPool) -> bool {
    if let Ok(conn) = pool.get() {
        let result: Result<String, _> = conn.query_row(
            "SELECT settings_json FROM settings WHERE id = 1",
            [],
            |row| row.get(0),
        );
        if let Ok(raw_json) = result {
            // Parse through AppSettings to get the same default logic as the API
            let settings: AppSettings = serde_json::from_str(&raw_json).unwrap_or_default();
            return settings.smart_mode_enabled;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Core settings builder — single source of truth for settings responses
// ---------------------------------------------------------------------------

/// Constructs a typed `AppSettings` from raw stored JSON.
///
/// - Parses stored fields through `AppSettings` with `#[serde(default)]` guard
///   so every field always has a safe value, even on a fresh install.
/// - Computed fields (keychain state, license state) are always re-derived
///   from their authoritative sources and injected here.
/// - `#[serde(skip_deserializing)]` on computed fields means any stale values
///   that may have leaked into the stored JSON are silently ignored.
/// - Normalises the legacy `hasSeenWelcome` alias: if it is `true` but
///   `onboardingComplete` is `false`, the canonical flag is promoted.
fn build_typed_settings(raw_json: &str, pool: &DbPool) -> AppSettings {
    // Parse persistent fields — defaults for all missing fields are applied automatically
    let mut settings: AppSettings = serde_json::from_str(raw_json).unwrap_or_default();

    // Resolve the legacy hasSeenWelcome alias: treat either flag as canonical
    if settings.has_seen_welcome && !settings.onboarding_complete {
        settings.onboarding_complete = true;
    }

    // Inject Gemini key state from OS keychain — NEVER from the stored JSON blob
    let gemini_key = get_gemini_key();
    settings.gemini_key_is_set = !gemini_key.is_empty();
    settings.gemini_key_masked = if settings.gemini_key_is_set {
        mask_api_key(&gemini_key)
    } else {
        String::new()
    };

    // Inject license state from SQLite license_key table — NEVER from settings JSON
    let (is_licensed, tier) = fetch_license_status(pool);
    settings.is_licensed = is_licensed;
    settings.license_tier = tier;

    settings
}

fn fetch_license_status(pool: &DbPool) -> (bool, Option<String>) {
    if let Ok(conn) = pool.get() {
        if let Ok(mut stmt) = conn.prepare("SELECT is_valid, tier FROM license_key WHERE id = 1") {
            if let Ok(mut rows) = stmt.query([]) {
                if let Ok(Some(row)) = rows.next() {
                    let is_valid: bool = row.get(0).unwrap_or(false);
                    let tier: String = row.get(1).unwrap_or_else(|_| "free".to_string());
                    return (is_valid, Some(tier));
                }
            }
        }
    }
    (false, None)
}

pub fn get_destination_override(pool: &DbPool) -> Option<String> {
    let conn = pool.get().ok()?;
    let raw_json: String = conn
        .query_row(
            "SELECT settings_json FROM settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "{}".to_string());

    let settings: AppSettings = serde_json::from_str(&raw_json).unwrap_or_default();
    if settings.destination_mode == "alongside" {
        return None;
    }

    let trimmed = settings.destination_path.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Strips all fields that must never be persisted to the stored settings JSON.
/// Called before saving any patch to SQLite to enforce the separation between
/// persistent, computed, and secret fields.
fn sanitise_patch_for_storage(patch: &mut Value) {
    if let Some(obj) = patch.as_object_mut() {
        // Secret fields — stored in OS keychain, never in SQLite
        obj.remove("smartApiKey");
        // Computed fields — derived at response time, must not overwrite DB values
        obj.remove("geminiKeyIsSet");
        obj.remove("geminiKeyMasked");
        obj.remove("isLicensed");
        obj.remove("licenseTier");
        // Raw keys that must never be persisted
        obj.remove("licenseKey");
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_settings_cmd(pool: State<'_, DbPool>) -> Result<SettingsPayload, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;

    let raw_json: String = conn
        .query_row(
            "SELECT settings_json FROM settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "{}".to_string());

    let settings = build_typed_settings(&raw_json, pool.inner());
    let gemini_key_is_set = settings.gemini_key_is_set;

    Ok(SettingsPayload {
        settings,
        gemini_key_is_set,
    })
}

#[tauri::command]
pub async fn update_settings_cmd(
    pool: State<'_, DbPool>,
    patch: Value,
) -> Result<SettingsPayload, String> {
    // ── Handle Gemini API key FIRST — keychain, never SQLite ──────────────────
    let new_gemini_key = patch
        .get("smartApiKey")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());

    if let Some(ref key_str) = new_gemini_key {
        if key_str.is_empty() {
            delete_gemini_key()?;
        } else if !key_str.contains('•') {
            // Real key (not the masked placeholder) — store in OS keychain
            store_gemini_key(key_str)?;
        }
    }

    // ── Sanitise patch before merging into SQLite ─────────────────────────────
    let mut patch_for_storage = patch;
    sanitise_patch_for_storage(&mut patch_for_storage);

    // ── Load current stored JSON, sanitise it, then merge the patch ───────────
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let raw_json: String = tx
        .query_row(
            "SELECT settings_json FROM settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "{}".to_string());

    let mut current: Value = serde_json::from_str(&raw_json).unwrap_or(serde_json::json!({}));

    // Strip any previously leaked computed/secret fields from stored JSON
    sanitise_patch_for_storage(&mut current);

    // Merge patch fields into current stored state
    if let (Some(cur_obj), Some(patch_obj)) =
        (current.as_object_mut(), patch_for_storage.as_object())
    {
        for (k, v) in patch_obj {
            cur_obj.insert(k.clone(), v.clone());
        }
    } else if !patch_for_storage.is_null() {
        current = patch_for_storage;
    }

    let next_json = serde_json::to_string(&current).unwrap_or_else(|_| "{}".to_string());
    tx.execute(
        "INSERT INTO settings (id, settings_json) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET settings_json = ?1, updated_at = CURRENT_TIMESTAMP",
        rusqlite::params![next_json],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    // ── Build and return typed response ───────────────────────────────────────
    let settings = build_typed_settings(&next_json, pool.inner());
    let gemini_key_is_set = settings.gemini_key_is_set;

    Ok(SettingsPayload {
        settings,
        gemini_key_is_set,
    })
}

// ---------------------------------------------------------------------------
// Common paths — for onboarding quick-start folder shortcuts
// ---------------------------------------------------------------------------

/// Returns the auto_move_threshold setting (default 0.80).
/// Used by the watcher to decide whether to auto-move without review.
pub fn get_auto_move_threshold(pool: &DbPool) -> f32 {
    if let Ok(conn) = pool.get() {
        if let Ok(raw_json) = conn.query_row(
            "SELECT settings_json FROM settings WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        ) {
            let settings: crate::contracts::AppSettings =
                serde_json::from_str(&raw_json).unwrap_or_default();
            return settings.auto_move_threshold;
        }
    }
    0.80
}

/// Returns the organization_mode setting ("simple" | "structured", default "structured").
/// Used by the organizer to determine how to collapse bucket paths.
pub fn get_organization_mode(pool: &DbPool) -> String {
    if let Ok(conn) = pool.get() {
        if let Ok(raw_json) = conn.query_row(
            "SELECT settings_json FROM settings WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        ) {
            let settings: crate::contracts::AppSettings =
                serde_json::from_str(&raw_json).unwrap_or_default();
            return settings.organization_mode;
        }
    }
    "structured".to_string()
}

/// Alias for get_settings_cmd — no-_cmd variant.
#[tauri::command]
pub async fn get_settings(pool: State<'_, DbPool>) -> Result<SettingsPayload, String> {
    get_settings_cmd(pool).await
}

/// Alias for update_settings_cmd — no-_cmd variant.
#[tauri::command]
pub async fn update_settings(
    pool: State<'_, DbPool>,
    patch: serde_json::Value,
) -> Result<SettingsPayload, String> {
    update_settings_cmd(pool, patch).await
}

/// Alias for update_settings_cmd — wires the Phase 5 save_settings invoke call.
#[tauri::command]
pub async fn save_settings(
    pool: State<'_, DbPool>,
    settings: serde_json::Value,
) -> Result<SettingsPayload, String> {
    update_settings_cmd(pool, settings).await
}

/// Returns the standard user folder paths (Downloads, Desktop, Documents).
#[tauri::command]
pub fn get_common_paths_cmd() -> CommonPaths {
    let home = dirs::home_dir().unwrap_or_default();
    CommonPaths {
        downloads: dirs::download_dir()
            .unwrap_or_else(|| home.join("Downloads"))
            .to_string_lossy()
            .into_owned(),
        desktop: dirs::desktop_dir()
            .unwrap_or_else(|| home.join("Desktop"))
            .to_string_lossy()
            .into_owned(),
        documents: dirs::document_dir()
            .unwrap_or_else(|| home.join("Documents"))
            .to_string_lossy()
            .into_owned(),
    }
}

/// Fully wipes all local data (SQLite settings, operations, corrections, and keychain).
#[tauri::command]
pub async fn factory_reset_cmd(
    _app: tauri::AppHandle,
    pool: State<'_, DbPool>,
) -> Result<(), String> {
    // 1. Remove keychain data
    let _ = delete_gemini_key();

    // 2. Wipe all tables
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM settings", []).ok();
    tx.execute("DELETE FROM user_corrections", []).ok();
    tx.execute("DELETE FROM license_key", []).ok();
    tx.execute("DELETE FROM ignore_rules", []).ok();
    tx.execute("DELETE FROM watched_folders", []).ok();
    tx.execute("DELETE FROM operations", []).ok();
    tx.execute("DELETE FROM file_moves", []).ok();

    tx.commit().map_err(|e| e.to_string())?;

    // We do not physically delete the .sqlite file because it is locked,
    // but clearing the tables effectively resets the app.
    // Exit so the app can launch fresh.
    std::process::exit(0);

    // Unreachable, but needed for return type match
    // Ok(())
}
