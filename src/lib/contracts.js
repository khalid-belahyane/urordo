/**
 * Shared Contracts and Type Boundaries
 * Defines the canonical shapes returned by the backend planner/commands.
 * These act as type schemas across the frontend so UI components don't bind to arbitrary shapes.
 */

// ── AI ─────────────────────────────────────────────────────────────
/**
 * @typedef {Object} ValidateKeyResult
 * @property {boolean} is_valid
 * @property {string} message
 */

// ── Classifier ─────────────────────────────────────────────────────
/**
 * @typedef {Object} Classification
 * @property {string} path
 * @property {string} bucket
 * @property {number} confidence
 * @property {string} reason
 * @property {string} action
 * @property {boolean} is_dir
 * @property {string} category - "Project" | "Empty" | "Resource" | "Image" | "Video" | "Document" | "Loose" | "Mixed"
 */

// ── History ────────────────────────────────────────────────────────
/**
 * @typedef {Object} MoveLog
 * @property {number} id
 * @property {string} source_path
 * @property {string|null} destination_path
 * @property {string} action
 * @property {string} status
 */

/**
 * @typedef {Object} OperationLog
 * @property {string} operation_id
 * @property {string} status
 * @property {string} created_at
 * @property {MoveLog[]} moves
 */

/**
 * @typedef {Object} HistoryResult
 * @property {number} total_pages
 * @property {OperationLog[]} items
 */

// ── Ignore ─────────────────────────────────────────────────────────
/**
 * @typedef {Object} IgnoreRule
 * @property {number} id
 * @property {string} rule_type
 * @property {string} value
 * @property {string} created_at
 */

// ── License ────────────────────────────────────────────────────────
/**
 * @typedef {Object} AuthResult
 * @property {boolean} is_valid
 * @property {string} message
 * @property {string|null} tier
 */

// ── Organizer ──────────────────────────────────────────────────────
/**
 * @typedef {Object} PlanItem
 * @property {string} path
 * @property {string} bucket
 * @property {boolean} checked
 * @property {string | null | undefined} [root_path]
 */

/**
 * @typedef {Object} MoveAction
 * @property {string} path
 * @property {string} destination_path
 * @property {string | null | undefined} [root_path]
 */

/**
 * @typedef {Object} BuildPlanResult
 * @property {MoveAction[]} actions
 * @property {number} skipped_by_rules
 */

/**
 * @typedef {Object} OpSummary
 * @property {string} operation_id
 * @property {number} total
 * @property {number} successful
 * @property {number} failed
 */

/**
 * @typedef {Object} ApplyProgress
 * @property {number} done
 * @property {number} total
 */

// ── Rollback ───────────────────────────────────────────────────────
/**
 * @typedef {Object} RollbackResult
 * @property {boolean} success
 * @property {string} status
 * @property {number} total_requested
 * @property {number} reverted_count
 * @property {number} missing_count
 */

/**
 * @typedef {Object} RollbackProgress
 * @property {number} id
 * @property {boolean} success
 * @property {string} original_path
 */

// ── Scanner ────────────────────────────────────────────────────────
/**
 * @typedef {Object} FileEntry
 * @property {string} path
 * @property {string} name
 * @property {string} extension
 * @property {number} size
 * @property {number} modified_at
 * @property {string} parent_folder
 * @property {boolean} is_dir
 * @property {string} category - "Project" | "Resource" | "Empty" | "Loose"
 */

/**
 * @typedef {Object} ScanResult
 * @property {string} path
 * @property {FileEntry[]} files
 * @property {string} root_boundary
 * @property {number} enumerated_count
 * @property {number} skipped_count
 * @property {number} inaccessible_count
 * @property {boolean} truncated
 */

/**
 * @typedef {Object} ScanProgress
 * @property {number} scanned
 * @property {number|null} total
 */

// ── Settings ───────────────────────────────────────────────────────
/**
 * Canonical application settings. Mirrors `AppSettings` in `contracts.rs`.
 * All fields are guaranteed to have safe defaults when returned from the backend.
 *
 * Persistent fields are stored in SQLite.
 * Computed fields are injected by the backend and must never be sent in patches.
 *
 * @typedef {Object} AppSettings
 * @property {boolean} onboardingComplete     - Persistent. Onboarding wizard completed.
 * @property {boolean} hasSeenWelcome         - Persistent. Legacy alias (mirrors onboardingComplete).
 * @property {boolean} smartModeEnabled       - Persistent. AI Smart Mode is on.
 * @property {string}  theme                  - Persistent. App theme preference ("system" | "light" | "dark").
 * @property {string}  destinationMode        - Persistent. Where organised files land ("alongside" | "single_folder" | "custom"). Default "alongside".
 * @property {string}  destinationPath        - Persistent. Custom destination folder path when destinationMode is not "alongside".
 * @property {boolean} geminiKeyIsSet         - Computed. A Gemini API key is in the OS keychain.
 * @property {string}  geminiKeyMasked        - Computed. Masked display string for the key.
 * @property {boolean} isLicensed             - Computed. A valid license is active.
 * @property {string|null} licenseTier        - Computed. Tier name when licensed.
 */

/**
 * Response envelope returned by `get_settings_cmd` and `update_settings_cmd`.
 * @typedef {Object} SettingsPayload
 * @property {AppSettings} settings       - Fully typed settings; no raw JSON blobs.
 * @property {boolean} gemini_key_is_set  - Mirrors settings.geminiKeyIsSet at the envelope level.
 */

/**
 * @typedef {Object} CommonPaths
 * @property {string} downloads
 * @property {string} desktop
 * @property {string} documents
 */

// ── Watcher ────────────────────────────────────────────────────────
/**
 * @typedef {Object} PendingFile
 * @property {string} path
 * @property {number} watcher_id
 * @property {string} root_path
 * @property {string} filename
 */

/**
 * @typedef {Object} WatchedFolder
 * @property {number} id
 * @property {string} path
 * @property {boolean} is_active
 * @property {boolean} auto_organise
 * @property {string} auto_organise_mode
 * @property {number} files_processed
 * @property {string|null} last_activity
 */

/**
 * @typedef {Object} WatcherEvent
 * @property {string} event_type
 * @property {string} path
 * @property {string} filename
 * @property {number} watcher_id
 * @property {string} root_path
 * @property {string} timestamp
 */

/**
 * @typedef {Object} WatcherStatus
 * @property {number} active_count
 * @property {number} pending_count
 * @property {boolean} paused
 */

export {};
