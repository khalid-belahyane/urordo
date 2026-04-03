use crate::contracts::Classification;
use crate::db::DbPool;
use rayon::prelude::*;
use std::path::Path;
use tauri::State;
use tokio::task::JoinSet;

// ── Gemini sanitization ────────────────────────────────────────────────────────
//
// Sanitises a raw Gemini response before using it as a filesystem folder name.
//
// Rules:
//   - Preserve '/' — intentional for bucket hierarchy (e.g. "Documents/Finance").
//   - Strip characters illegal in Windows/macOS/Linux paths: \ : * ? " < > |
//   - Strip null bytes and non-printable characters.
//   - Collapse multiple spaces into one.
//   - Enforce maximum 64 characters.
//   - Fall back to "Uncategorised" if the result is empty after sanitisation.
//
// BUG FIX: previous version stripped '/' treating it as a path separator.
// Gemini correctly returns "Documents/Finance" — the slash must be preserved
// so the organiser can construct nested folder paths.
fn sanitize_gemini_response(raw: &str) -> String {
    let trimmed = raw.trim();

    // Strip filesystem-illegal chars (Windows: \ : * ? " < > |) but NOT /
    let cleaned: String = trimmed
        .chars()
        .map(|c| match c {
            '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            _ => c,
        })
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '/' || *c == '_' || *c == '-')
        .collect();

    // Collapse multiple spaces into a single space
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");

    // Enforce max 64 characters
    let truncated: String = collapsed.chars().take(64).collect();

    let result = truncated.trim().to_string();
    if result.is_empty() {
        "Uncategorised".to_string()
    } else {
        result
    }
}

// ── Layer 2: Content fingerprinting ───────────────────────────────────────────
//
// Only runs for text-readable files when confidence < 0.85.
// Reads the first 2000 bytes and applies keyword scoring to upgrade the bucket.
fn layer2_content_fingerprint(path: &Path, bucket: &mut String, confidence: &mut f32) {
    if *confidence >= 0.85 {
        return;
    }

    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    // Only attempt for text-readable formats
    if !matches!(
        ext.as_str(),
        "txt" | "md" | "markdown" | "rst" | "adoc" | "csv" | "tsv" | "log" | "rtf"
    ) {
        return;
    }

    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(_) => return,
    };

    let content = String::from_utf8_lossy(&bytes[..bytes.len().min(2000)]).to_lowercase();

    // Keyword scoring tables
    let finance_kw = [
        "invoice",
        "receipt",
        "payment",
        "budget",
        "expense",
        "tax",
        "salary",
        "payroll",
        "financial",
        "revenue",
        "profit",
        "loss",
        "balance",
        "account",
        "billing",
        "reimbursement",
    ];
    let legal_kw = [
        "contract",
        "agreement",
        "terms",
        "privacy",
        "legal",
        "law",
        "court",
        "jurisdiction",
        "liability",
        "clause",
        "party",
        "parties",
        "hereby",
        "whereas",
        "indemnify",
        "warranty",
    ];
    let work_kw = [
        "meeting",
        "agenda",
        "project",
        "deadline",
        "deliverable",
        "stakeholder",
        "quarterly",
        "annual",
        "report",
        "analysis",
        "proposal",
        "strategy",
        "milestone",
        "action item",
    ];
    let study_kw = [
        "lecture",
        "homework",
        "assignment",
        "exam",
        "course",
        "university",
        "study",
        "chapter",
        "textbook",
        "thesis",
        "dissertation",
        "research",
        "bibliography",
        "hypothesis",
    ];
    let personal_kw = [
        "diary", "journal", "personal", "private", "family", "vacation", "holiday", "birthday",
        "wedding", "recipe",
    ];

    let score_finance = finance_kw.iter().filter(|&&k| content.contains(k)).count();
    let score_legal = legal_kw.iter().filter(|&&k| content.contains(k)).count();
    let score_work = work_kw.iter().filter(|&&k| content.contains(k)).count();
    let score_study = study_kw.iter().filter(|&&k| content.contains(k)).count();
    let score_personal = personal_kw.iter().filter(|&&k| content.contains(k)).count();

    let candidates = [
        (score_finance, "Documents/Finance"),
        (score_legal, "Documents/Legal"),
        (score_work, "Documents/Work"),
        (score_study, "Documents/Study"),
        (score_personal, "Documents/Personal"),
    ];

    if let Some(&(score, new_bucket)) = candidates.iter().max_by_key(|&&(s, _)| s) {
        if score >= 3 {
            *bucket = new_bucket.to_string();
            *confidence = (*confidence + 0.10).min(1.0);
        }
    }
}

// ── Layer 3: Relational context ────────────────────────────────────────────────
//
// Only runs when confidence < 0.80.
// Reads up to 10 sibling filenames, classifies them at Layer 1,
// and if 3+ share the same bucket prefix, inherits that prefix.
// Also boosts confidence if the parent folder name matches the bucket.
fn layer3_relational_context(path: &Path, bucket: &mut String, confidence: &mut f32) {
    if *confidence >= 0.80 {
        return;
    }

    let parent = match path.parent() {
        Some(p) if p.as_os_str() != "" => p,
        _ => return,
    };

    // Collect up to 10 sibling paths (excluding self)
    let siblings: Vec<std::path::PathBuf> = match std::fs::read_dir(parent) {
        Ok(entries) => entries
            .flatten()
            .filter(|e| e.path() != path)
            .filter(|e| e.path().is_file())
            .take(10)
            .map(|e| e.path())
            .collect(),
        Err(_) => return,
    };

    if siblings.is_empty() {
        return;
    }

    // Layer 1 classification for each sibling
    let sibling_buckets: Vec<String> = siblings
        .iter()
        .map(|p| crate::rules::patterns::classify_semantic_bucket(p))
        .collect();

    // Count top-level prefix occurrences
    let mut prefix_counts: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    for sb in &sibling_buckets {
        let prefix = sb.split('/').next().unwrap_or(sb.as_str()).to_string();
        *prefix_counts.entry(prefix).or_insert(0) += 1;
    }

    if let Some((dominant_prefix, &count)) = prefix_counts.iter().max_by_key(|(_, &c)| c) {
        if count >= 3 {
            let current_prefix = bucket.split('/').next().unwrap_or(bucket.as_str());
            if current_prefix != dominant_prefix.as_str() {
                // Inherit the dominant sibling bucket
                if let Some(full_bucket) = sibling_buckets
                    .iter()
                    .find(|b| b.starts_with(dominant_prefix.as_str()))
                {
                    *bucket = full_bucket.clone();
                }
            }
            *confidence = (*confidence + 0.08).min(1.0);
        }
    }

    // Folder-name keyword confidence boost
    if let Some(folder_name) = parent.file_name().and_then(|s| s.to_str()) {
        let folder_lower = folder_name.to_lowercase();
        let folder_keywords: &[(&str, &str)] = &[
            ("finance", "Documents/Finance"),
            ("legal", "Documents/Legal"),
            ("work", "Documents/Work"),
            ("documents", "Documents"),
            ("photos", "Images/Photos"),
            ("images", "Images"),
            ("pictures", "Images/Photos"),
            ("videos", "Video"),
            ("music", "Audio"),
            ("design", "Design"),
            ("code", "Code"),
        ];

        for (keyword, mapped) in folder_keywords {
            if folder_lower.contains(keyword) && bucket.starts_with(mapped) {
                *confidence = (*confidence + 0.05).min(1.0);
                break;
            }
        }
    }
}

// ── Layer 4: Local user model (SQLite user_corrections) ───────────────────────
//
// Only runs when confidence < 0.75.
// Queries user_corrections for exact stem+extension matches (count >= 2)
// or extension-only matches (count >= 5).
fn layer4_user_model(path: &Path, bucket: &mut String, confidence: &mut f32, pool: &DbPool) {
    if *confidence >= 0.75 {
        return;
    }

    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return,
    };

    // Exact stem+extension match (count >= 2)
    let exact_result: Option<(String, i64)> = conn
        .query_row(
            "SELECT bucket, count FROM user_corrections \
             WHERE filename_stem = ?1 AND extension = ?2 \
             ORDER BY count DESC LIMIT 1",
            rusqlite::params![&stem, &ext],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    if let Some((user_bucket, count)) = exact_result {
        if count >= 2 {
            *bucket = user_bucket;
            *confidence = 0.88;
            return;
        }
    }

    // Extension-only match (count >= 5)
    if ext.is_empty() {
        return;
    }

    let ext_result: Option<(String, i64)> = conn
        .query_row(
            "SELECT bucket, SUM(count) as total_count FROM user_corrections \
             WHERE extension = ?1 \
             GROUP BY bucket ORDER BY total_count DESC LIMIT 1",
            rusqlite::params![&ext],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    if let Some((user_bucket, count)) = ext_result {
        if count >= 5 {
            *bucket = user_bucket;
            *confidence = 0.82;
        }
    }
}

// ── Confidence → Action mapping ────────────────────────────────────────────────
//
// >= 0.80  → move   (high confidence, safe to auto-move)
// <  0.80  → review (requires user confirmation)
// keep     → keep   (shortcuts, projects — set explicitly before this is called)
fn confidence_to_action(confidence: f32) -> String {
    if confidence >= 0.80 {
        "move".to_string()
    } else {
        "review".to_string()
    }
}

// ── Public classify_batch_inner (called by watcher and other Rust code) ──────

pub async fn classify_batch_inner(
    pool: &DbPool,
    files: Vec<String>,
    root_path: Option<&str>,
) -> Result<Vec<Classification>, String> {
    let is_smart = crate::commands::settings::is_smart_mode_enabled(pool);
    let raw_gemini_key = if is_smart {
        crate::commands::settings::get_gemini_key_internal(pool)
    } else {
        String::new()
    };

    let pool_clone = pool.clone();
    let root_path_owned = root_path.map(|s| s.to_string());

    let mut results = tokio::task::spawn_blocking(move || {
        files
            .into_par_iter()
            .map(|file_path| {
                let p = Path::new(&file_path);
                let is_dir = p.is_dir();
                let root_path_buf = root_path_owned.as_ref().map(|s| Path::new(s));
                let boundary = crate::rules::boundary::detect_boundary(p, root_path_buf);

                match boundary {
                    // ── System-protected zones — always keep, never move ──────────
                    crate::rules::boundary::BoundaryKind::SystemDriveRoot => {
                        return Classification {
                            path: file_path,
                            bucket: "Protected".to_string(),
                            confidence: 1.0,
                            action: "keep".to_string(),
                            reason: "Layer 1: drive root — protected zone".to_string(),
                            is_dir,
                            category: "Protected".to_string(),
                        };
                    }
                    crate::rules::boundary::BoundaryKind::CriticalSystemPath => {
                        return Classification {
                            path: file_path,
                            bucket: "Protected".to_string(),
                            confidence: 1.0,
                            action: "keep".to_string(),
                            reason: "Layer 1: critical OS path — protected zone".to_string(),
                            is_dir,
                            category: "Protected".to_string(),
                        };
                    }
                    // ── Project boundaries ────────────────────────────────────────
                    crate::rules::boundary::BoundaryKind::ProjectRoot
                    | crate::rules::boundary::BoundaryKind::InsideProjectTree => {
                        return Classification {
                            path: file_path,
                            bucket: "Projects".to_string(),
                            confidence: 1.0,
                            action: "keep".to_string(),
                            reason: "Layer 1: project boundary".to_string(),
                            is_dir,
                            category: "Project".to_string(),
                        };
                    }
                    // ── User curated folder ───────────────────────────────────────
                    crate::rules::boundary::BoundaryKind::UserCuratedFolder => {
                        return Classification {
                            path: file_path,
                            bucket: "Other".to_string(),
                            confidence: 1.0,
                            action: "keep".to_string(),
                            reason: "Layer 1: user-curated container — protected by default"
                                .to_string(),
                            is_dir,
                            category: "Curated".to_string(),
                        };
                    }
                    // ── Shortcut files — never moved ─────────────────────────────
                    crate::rules::boundary::BoundaryKind::Shortcut => {
                        return Classification {
                            path: file_path,
                            bucket: "Launchers".to_string(),
                            confidence: 1.0,
                            action: "keep".to_string(),
                            reason: "Layer 1: shortcut — never moved".to_string(),
                            is_dir,
                            category: "Launcher".to_string(),
                        };
                    }
                    // ── Empty folder ──────────────────────────────────────────────
                    crate::rules::boundary::BoundaryKind::EmptyFolder => {
                        return Classification {
                            path: file_path,
                            bucket: "Trash/Cleanup".to_string(),
                            confidence: 1.0,
                            action: "delete".to_string(),
                            reason: "Layer 1: empty folder".to_string(),
                            is_dir,
                            category: "Empty".to_string(),
                        };
                    }
                    // ── Named folder (not curated) ────────────────────────────────
                    crate::rules::boundary::BoundaryKind::NamedFolder => {
                        return Classification {
                            path: file_path,
                            bucket: "Other".to_string(),
                            confidence: 0.5,
                            action: "review".to_string(),
                            reason: "Layer 1: non-project directory".to_string(),
                            is_dir,
                            category: "Mixed".to_string(),
                        };
                    }
                    // ── Loose file — proceed to full classification pipeline ──────
                    crate::rules::boundary::BoundaryKind::LooseFile => {}
                }

                // ── RULE 6: Layer 1 — Hard rules (extension + name) ───────────
                let mut bucket = crate::rules::patterns::classify_semantic_bucket(p);

                let mut confidence: f32 = if bucket == "Other" || bucket == "Documents/General" {
                    0.55
                } else {
                    0.90
                };

                let reason_l1 = format!("Layer 1: extension/name rules → {}", bucket);

                // ── Layer 2: Content fingerprinting ────────────────────────────
                // Only if confidence < 0.85 and file is a text-readable format
                let mut reason = reason_l1.clone();
                if confidence < 0.85 {
                    let prev_bucket = bucket.clone();
                    layer2_content_fingerprint(p, &mut bucket, &mut confidence);
                    if bucket != prev_bucket {
                        reason = format!("Layer 2: content keywords → {}", bucket);
                    }
                }

                // ── Layer 3: Relational context ────────────────────────────────
                // Only if confidence < 0.80 after Layer 2
                if confidence < 0.80 {
                    let prev_conf = confidence;
                    layer3_relational_context(p, &mut bucket, &mut confidence);
                    if confidence > prev_conf {
                        reason = format!("Layer 3: sibling context → {}", bucket);
                    }
                }

                // ── Layer 4: Local user model (DB) ─────────────────────────────
                // Only if confidence < 0.75 after Layer 3
                if confidence < 0.75 {
                    let prev_bucket = bucket.clone();
                    layer4_user_model(p, &mut bucket, &mut confidence, &pool_clone);
                    if bucket != prev_bucket {
                        reason = format!("Layer 4: user correction → {}", bucket);
                    }
                }

                // Layer 5 is handled async below (Gemini, only if smart mode + conf < 0.70)

                let category = if bucket.starts_with("Images") {
                    "Image"
                } else if bucket.starts_with("Video") {
                    "Video"
                } else if bucket.starts_with("Documents") {
                    "Document"
                } else if bucket.starts_with("Projects") {
                    "Project"
                } else {
                    "Loose"
                };

                Classification {
                    path: file_path,
                    bucket,
                    confidence,
                    action: confidence_to_action(confidence),
                    reason,
                    is_dir: false,
                    category: category.to_string(),
                }
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| format!("Classifier task failed: {}", e))?;

    // ── Layer 5: Gemini (cloud AI) ─────────────────────────────────────────────
    //
    // RULE 6: Only runs if ALL of:
    //   - smart_mode_enabled in settings
    //   - Gemini API key exists in OS keychain
    //   - confidence after layers 1–4 is < 0.70
    //   - entry is not a directory
    if is_smart && !raw_gemini_key.is_empty() {
        let low_conf: Vec<(usize, String)> = results
            .iter()
            .enumerate()
            .filter(|(_, r)| !r.is_dir && r.confidence < 0.70)
            .map(|(i, r)| {
                let fname = Path::new(&r.path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                (i, fname)
            })
            .collect();

        if !low_conf.is_empty() {
            let mut set: JoinSet<(usize, String)> = JoinSet::new();
            for (idx, fname) in low_conf {
                let key = raw_gemini_key.clone();
                set.spawn(async move {
                    let raw = crate::commands::ai::ask_gemini(&key, &fname).await;
                    (idx, raw)
                });
            }

            while let Some(join_result) = set.join_next().await {
                if let Ok((idx, raw)) = join_result {
                    if !raw.is_empty() {
                        let safe_bucket = sanitize_gemini_response(&raw);
                        if safe_bucket != "Uncategorised" {
                            results[idx].bucket = safe_bucket.clone();
                            results[idx].confidence = 0.92;
                            results[idx].action = "move".to_string();
                            results[idx].reason = format!("Layer 5: Gemini → {}", safe_bucket);

                            // Update category from new bucket
                            results[idx].category = if safe_bucket.starts_with("Images") {
                                "Image".to_string()
                            } else if safe_bucket.starts_with("Video") {
                                "Video".to_string()
                            } else if safe_bucket.starts_with("Documents") {
                                "Document".to_string()
                            } else {
                                "Loose".to_string()
                            };
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn classify_batch(
    pool: State<'_, DbPool>,
    files: Vec<String>,
    root_path: Option<String>,
) -> Result<Vec<Classification>, String> {
    classify_batch_inner(pool.inner(), files, root_path.as_deref()).await
}

// ── add_correction: record user feedback for Layer 4 training ─────────────────
//
// Increments the count for the (stem, extension, bucket) triple.
// When count >= 2, Layer 4 will use this correction for future classifications.
#[tauri::command]
pub async fn add_correction(
    pool: State<'_, DbPool>,
    path: String,
    correct_bucket: String,
) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let stem = p
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let ext = p
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    let now = chrono::Utc::now().timestamp();
    let conn = pool.get().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO user_corrections (filename_stem, extension, bucket, count, last_seen)
         VALUES (?1, ?2, ?3, 1, ?4)
         ON CONFLICT(filename_stem, extension, bucket)
         DO UPDATE SET count = count + 1, last_seen = ?4",
        rusqlite::params![stem, ext, correct_bucket, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_preserves_slash_in_bucket() {
        // BUG FIX: slash must be preserved for bucket hierarchy
        assert_eq!(
            sanitize_gemini_response("Documents/Finance"),
            "Documents/Finance"
        );
        assert_eq!(sanitize_gemini_response("Images/Photos"), "Images/Photos");
    }

    #[test]
    fn test_sanitize_strips_illegal_chars() {
        assert_eq!(sanitize_gemini_response("C:\\System32"), "C System32");
        // Illegal chars are replaced with a space then collapsed: "file:name" → "file name"
        assert_eq!(sanitize_gemini_response("file:name"), "file name");
        assert_eq!(sanitize_gemini_response("bad*name"), "bad name");
    }

    #[test]
    fn test_sanitize_handles_empty_and_whitespace() {
        assert_eq!(sanitize_gemini_response("   "), "Uncategorised");
        assert_eq!(sanitize_gemini_response(""), "Uncategorised");
    }

    #[test]
    fn test_sanitize_keeps_normal_names() {
        assert_eq!(sanitize_gemini_response("Normal Name"), "Normal Name");
        assert_eq!(sanitize_gemini_response("Finance 2024"), "Finance 2024");
    }

    #[test]
    fn test_sanitize_enforces_max_length() {
        let long = "a".repeat(100);
        let result = sanitize_gemini_response(&long);
        assert!(result.chars().count() <= 64);
    }

    #[test]
    fn test_confidence_to_action() {
        assert_eq!(confidence_to_action(0.90), "move");
        assert_eq!(confidence_to_action(0.80), "move");
        assert_eq!(confidence_to_action(0.79), "review");
        assert_eq!(confidence_to_action(0.55), "review");
        assert_eq!(confidence_to_action(0.0), "review");
    }
}
