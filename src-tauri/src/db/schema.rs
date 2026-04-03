use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Result;
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_db<P: AsRef<Path>>(db_path: P) -> Result<DbPool, r2d2::Error> {
    let manager = SqliteConnectionManager::file(db_path.as_ref()).with_init(|c| {
        c.execute_batch(
            "
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            PRAGMA foreign_keys=ON;
            PRAGMA cache_size=-64000;
            ",
        )
    });
    let pool = Pool::builder()
        .min_idle(Some(2))
        .max_size(8)
        .build(manager)?;

    Ok(pool)
}

pub fn run_migrations(pool: &DbPool) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let conn = pool.get()?;

    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA foreign_keys=ON;
        PRAGMA cache_size=-64000;

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            settings_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS operations (
            operation_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS file_moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id TEXT NOT NULL,
            source_path TEXT NOT NULL,
            destination_path TEXT,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(operation_id) REFERENCES operations(operation_id)
        );

        CREATE TABLE IF NOT EXISTS license_key (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            key      TEXT,       -- legacy column, no longer written
            key_hash TEXT,       -- SHA-256 hash of the validated key
            tier     TEXT,       -- 'pro' or 'free'
            expiry   TEXT,       -- 'never' or 'YYYY-MM-DD'
            is_valid BOOLEAN NOT NULL DEFAULT 0,
            validated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS watched_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            is_active INTEGER DEFAULT 1,
            auto_organise INTEGER DEFAULT 0,
            auto_organise_mode TEXT DEFAULT 'review',
            created_at DATETIME DEFAULT (datetime('now')),
            last_activity DATETIME,
            files_processed INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ignore_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_type TEXT NOT NULL,
            value TEXT NOT NULL,
            label TEXT,
            created_at DATETIME DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS auto_organise_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            watcher_id INTEGER REFERENCES watched_folders(id),
            operation_id TEXT REFERENCES operations(operation_id),
            triggered_at DATETIME DEFAULT (datetime('now')),
            files_moved INTEGER DEFAULT 0,
            status TEXT DEFAULT 'completed'
        );

        CREATE TABLE IF NOT EXISTS watcher_pending_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            watcher_id INTEGER NOT NULL REFERENCES watched_folders(id) ON DELETE CASCADE,
            path TEXT NOT NULL UNIQUE,
            detected_at DATETIME DEFAULT (datetime('now'))
        );

        -- User corrections: Layer 4 local learning model.
        -- Stores filename_stem + extension → bucket associations.
        -- count >= 2 triggers stem+extension match (confidence 0.88).
        -- count >= 5 triggers extension-only match (confidence 0.82).
        CREATE TABLE IF NOT EXISTS user_corrections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename_stem TEXT NOT NULL,
            extension TEXT NOT NULL,
            bucket TEXT NOT NULL,
            count INTEGER DEFAULT 1,
            last_seen INTEGER NOT NULL,
            UNIQUE(filename_stem, extension, bucket)
        );

        -- Move log: flat view of all file moves for the get_move_log command.
        -- Mirrors file_moves with session_id (= operation_id) for Phase 5 compatibility.
        CREATE VIEW IF NOT EXISTS move_log AS
        SELECT
            fm.id,
            fm.operation_id AS session_id,
            fm.source_path  AS original_path,
            COALESCE(fm.destination_path, '') AS destination_path,
            fm.action AS bucket,
            0.0 AS confidence,
            'organizer' AS layer,
            CAST(strftime('%s', fm.created_at) AS INTEGER) AS timestamp,
            CASE WHEN fm.status IN ('rolled_back', 'rollback_failed') THEN 1 ELSE 0 END AS rolled_back
        FROM file_moves fm;
        "
    )?;

    // ALTER TABLE for existing databases (safe — SQLite ignores duplicate-column errors)
    let _ = conn.execute_batch("ALTER TABLE license_key ADD COLUMN key_hash TEXT");
    let _ = conn.execute_batch("ALTER TABLE license_key ADD COLUMN tier TEXT");
    let _ = conn.execute_batch("ALTER TABLE license_key ADD COLUMN expiry TEXT");
    let _ = conn.execute_batch("ALTER TABLE file_moves ADD COLUMN error_message TEXT");

    // Indexes for query performance
    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_file_moves_op_id   ON file_moves(operation_id);
        CREATE INDEX IF NOT EXISTS idx_file_moves_status  ON file_moves(status);
        CREATE INDEX IF NOT EXISTS idx_file_moves_created ON file_moves(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_operations_created ON operations(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_operations_status  ON operations(status);
        CREATE INDEX IF NOT EXISTS idx_watched_folders_active ON watched_folders(is_active);
        CREATE INDEX IF NOT EXISTS idx_ignore_rules_type ON ignore_rules(rule_type);
        CREATE INDEX IF NOT EXISTS idx_watcher_pending_watcher ON watcher_pending_files(watcher_id);
        ",
    )?;

    Ok(())
}
