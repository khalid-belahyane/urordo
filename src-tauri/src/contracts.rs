use serde::{Deserialize, Serialize};

// ── AI ─────────────────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ValidateKeyResult {
    pub is_valid: bool,
    pub message: String,
}

// ── Classifier ─────────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Classification {
    pub path: String,
    pub bucket: String,
    pub confidence: f32,
    pub reason: String,
    pub action: String,
    pub is_dir: bool,
    pub category: String, // "Project" | "Empty" | "Image" | "Video" | "Document" | "Loose" | "Mixed" | "Launcher"
}

// ── History ────────────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MoveLog {
    pub id: i64,
    pub source_path: String,
    pub destination_path: Option<String>,
    pub action: String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OperationLog {
    pub operation_id: String,
    pub status: String,
    pub created_at: String,
    pub moves: Vec<MoveLog>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HistoryResult {
    pub total_pages: i64,
    pub items: Vec<OperationLog>,
}

// ── Move log (Phase 5 wiring contract) ─────────────────────────────
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MoveLogEntry {
    pub id: i64,
    pub session_id: String,
    pub original_path: String,
    pub destination_path: String,
    pub bucket: String,
    pub confidence: f64,
    pub layer: String,
    pub timestamp: i64,
    pub rolled_back: bool,
}

// ── Ignore ─────────────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IgnoreRule {
    pub id: i64,
    pub rule_type: String, // "extension" | "folder" | "keyword"
    pub value: String,
    pub created_at: String,
}

// ── License ────────────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AuthResult {
    pub is_valid: bool,
    pub message: String,
    pub tier: Option<String>,
    pub expiry: Option<String>,
}

// ── Organizer ──────────────────────────────────────────────────────

/// One item in a user-confirmed review plan sent from the frontend.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlanItem {
    pub path: String,
    pub bucket: String,
    pub checked: bool,
    #[serde(default)]
    pub root_path: Option<String>,
}

/// Fully resolved move actions ready to pass to apply_plan.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BuildPlanResult {
    pub actions: Vec<MoveAction>,
    pub skipped_by_rules: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MoveAction {
    pub path: String,
    pub destination_path: String,
    #[serde(default)]
    pub root_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpSummary {
    pub operation_id: String,
    pub total: usize,
    pub successful: usize,
    pub failed: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApplyProgress {
    pub done: usize,
    pub total: usize,
}

// ── Rollback ───────────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RollbackResult {
    pub success: bool,
    pub status: String,
    pub total_requested: usize,
    pub reverted_count: usize,
    pub missing_count: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RollbackProgress {
    pub id: i64,
    pub success: bool,
    pub original_path: String,
}

// ── Scanner ────────────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub modified_at: u64,
    pub parent_folder: String,
    pub is_dir: bool,
    pub category: String, // "Project" | "Empty" | "Mixed" | "Loose" | "Launcher"
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScanResult {
    pub path: String,
    pub files: Vec<FileEntry>,
    /// The boundary kind for the selected root path itself.
    pub root_boundary: String,
    /// Total raw directory entries read before any filtering.
    pub enumerated_count: usize,
    /// Entries filtered out (hidden, ignored, project-protected, system-protected).
    pub skipped_count: usize,
    /// Entries that could not be read due to OS permissions or I/O errors.
    pub inaccessible_count: usize,
    /// True when the scan stopped early because it hit the active scan limit.
    pub truncated: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScanProgress {
    pub scanned: u32,
    pub total: Option<u32>,
}

// ── Settings ───────────────────────────────────────────────────────

fn default_theme() -> String {
    "system".to_string()
}
fn default_destination_mode() -> String {
    "alongside".to_string()
}
fn default_organization_mode() -> String {
    "structured".to_string()
}
fn default_structure_preference() -> String {
    "merge".to_string()
}
fn default_smart_provider() -> String {
    "gemini".to_string()
}
fn default_auto_move_threshold() -> f32 {
    0.80
}
fn default_archive_threshold_years() -> u8 {
    2
}
fn default_scan_depth() -> u8 {
    1
}

/// Canonical application settings.
///
/// Persistent fields are stored as JSON in SQLite.
/// Computed fields are injected by the backend at response time and are never stored.
///
/// Every persistent field has a documented behavioral effect:
///
/// | Field                   | Effect                                                              |
/// |-------------------------|---------------------------------------------------------------------|
/// | smart_mode_enabled      | Enables Layer 5 Gemini calls in the classifier                      |
/// | theme                   | Controls DOM data-theme attribute (light / dark / system)           |
/// | destination_mode        | Organizer: alongside = next to root, else uses destination_path     |
/// | destination_path        | Organizer: target root when destination_mode != alongside           |
/// | organization_mode       | Organizer: simple collapses subfolders (Documents/Finance→Documents)|
/// | structure_preference    | Organizer: preserve keeps relative parent, merge drops it           |
/// | auto_move_threshold     | Watcher: confidence above this → auto-move without review           |
/// | project_protection      | Scanner: if false, shows warning before allowing project descent    |
/// | archive_enabled         | Classifier: surfaces files older than archive_threshold_years       |
/// | archive_threshold_years | Archive: age threshold in years                                     |
/// | archive_zip             | Archive: zip files before moving to archive bucket                  |
/// | scan_depth              | Scanner: max depth (1 = direct children only, default)              |
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    // ── Onboarding ────────────────────────────────────────────────────────────
    pub onboarding_complete: bool,
    /// Legacy alias kept for migration safety (mirrors onboarding_complete).
    pub has_seen_welcome: bool,

    // ── Smart Mode ────────────────────────────────────────────────────────────
    /// Enables Layer 5 Gemini calls in the classifier.
    pub smart_mode_enabled: bool,
    /// AI provider for smart mode. Currently "gemini" only.
    #[serde(default = "default_smart_provider")]
    pub smart_provider: String,

    // ── Appearance ────────────────────────────────────────────────────────────
    /// App theme: "system" | "light" | "dark"
    #[serde(default = "default_theme")]
    pub theme: String,

    // ── Organization ─────────────────────────────────────────────────────────
    /// Destination folder mode: "alongside" | "single_folder" | "custom"
    #[serde(default = "default_destination_mode")]
    pub destination_mode: String,
    /// Custom destination path when destination_mode != "alongside"
    #[serde(default)]
    pub destination_path: String,
    /// "simple" collapses Documents/Finance → Documents.
    /// "structured" preserves full bucket path.
    #[serde(default = "default_organization_mode")]
    pub organization_mode: String,
    /// "merge" = flat into bucket dir. "preserve" = keep relative parent path.
    #[serde(default = "default_structure_preference")]
    pub structure_preference: String,

    // ── Scanner ───────────────────────────────────────────────────────────────
    /// Max scan depth. 1 = direct children only (default).
    #[serde(default = "default_scan_depth")]
    pub scan_depth: u8,
    /// Project protection enforcement (default: true).
    /// If false, a warning dialog is shown before allowing project folder access.
    #[serde(default = "default_true")]
    pub project_protection: bool,

    // ── System / Drive / Custom Folder Protection ─────────────────────────────
    /// Block scanning and watching of critical OS system directories
    /// (C:\Windows, C:\Program Files, /etc, /usr, etc.).
    /// Default: true. Should require explicit high-friction override to disable.
    #[serde(default = "default_true")]
    pub system_path_protection: bool,
    /// Block scanning and watching of drive roots (C:\, D:\, /).
    /// Default: true.
    #[serde(default = "default_true")]
    pub drive_root_protection: bool,
    /// Treat user-named containers as protected folders that are not
    /// automatically descended into or reorganised.
    /// Default: true.
    #[serde(default = "default_true")]
    pub custom_folder_protection: bool,
    /// Allow the scanner and watcher to descend into user-curated folders.
    /// Only effective when custom_folder_protection = true.
    /// Default: false.
    #[serde(default)]
    pub allow_curated_folder_scan: bool,
    /// Allow the organiser to merge / flatten user-curated folder contents
    /// into global organisation buckets.
    /// Default: false.
    #[serde(default)]
    pub allow_curated_folder_merge: bool,
    /// Advanced override: permit scanning / watching system-protected paths.
    /// Default: false. HIGH-FRICTION — never enable by default.
    #[serde(default)]
    pub allow_system_override: bool,

    // ── Review / Auto-move ────────────────────────────────────────────────────
    /// Watcher: files with confidence above this threshold are auto-moved
    /// without appearing in the Review queue. Default: 0.80
    #[serde(default = "default_auto_move_threshold")]
    pub auto_move_threshold: f32,

    // ── Archive ───────────────────────────────────────────────────────────────
    /// Surface files older than archive_threshold_years as archive candidates.
    #[serde(default)]
    pub archive_enabled: bool,
    /// Age threshold in years for archive suggestions. Default: 2
    #[serde(default = "default_archive_threshold_years")]
    pub archive_threshold_years: u8,
    /// Zip files before moving them to the archive bucket.
    #[serde(default)]
    pub archive_zip: bool,

    // ── Computed (injected at response time; never stored or accepted from frontend) ──
    #[serde(skip_deserializing)]
    pub gemini_key_is_set: bool,
    #[serde(skip_deserializing)]
    pub gemini_key_masked: String,
    #[serde(skip_deserializing)]
    pub is_licensed: bool,
    #[serde(skip_deserializing)]
    pub license_tier: Option<String>,
}

fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            onboarding_complete: false,
            has_seen_welcome: false,
            smart_mode_enabled: false,
            smart_provider: default_smart_provider(),
            theme: default_theme(),
            destination_mode: default_destination_mode(),
            destination_path: String::new(),
            organization_mode: default_organization_mode(),
            structure_preference: default_structure_preference(),
            scan_depth: default_scan_depth(),
            project_protection: true,
            system_path_protection: true,
            drive_root_protection: true,
            custom_folder_protection: true,
            allow_curated_folder_scan: false,
            allow_curated_folder_merge: false,
            allow_system_override: false,
            auto_move_threshold: default_auto_move_threshold(),
            archive_enabled: false,
            archive_threshold_years: default_archive_threshold_years(),
            archive_zip: false,
            gemini_key_is_set: false,
            gemini_key_masked: String::new(),
            is_licensed: false,
            license_tier: None,
        }
    }
}

/// Response envelope returned by get_settings and update_settings.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SettingsPayload {
    pub settings: AppSettings,
    /// Mirrored at envelope level for callers that read payload.gemini_key_is_set directly.
    pub gemini_key_is_set: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CommonPaths {
    pub downloads: String,
    pub desktop: String,
    pub documents: String,
}

// ── Watcher ────────────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WatchedFolder {
    pub id: i64,
    pub path: String,
    pub is_active: bool,
    pub auto_organise: bool,
    pub auto_organise_mode: String,
    pub files_processed: i64,
    pub last_activity: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PendingFile {
    pub path: String,
    pub watcher_id: i64,
    pub root_path: String,
    pub filename: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WatcherEvent {
    pub event_type: String,
    pub path: String,
    pub filename: String,
    pub watcher_id: i64,
    pub root_path: String,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WatcherStatus {
    pub active_count: i64,
    pub pending_count: usize,
    pub paused: bool,
}
