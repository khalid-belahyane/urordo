pub mod ai;
pub mod classifier;
pub mod history;
pub mod ignore;
pub mod license;
pub mod organizer;
pub mod rollback;
pub mod scanner;
pub mod settings;
pub mod watcher;

use std::path::{Path, PathBuf};
use std::{fs, io};

/// Validates that `target` resolves to a path that is strictly inside `root`.
///
/// Works for both existing and not-yet-created destination paths:
/// - If `target` exists: canonicalise both and check prefix.
/// - If `target` doesn't exist: canonicalise the parent directory, append the
///   filename component, then check the prefix.
///
/// Returns the canonicalised (safe) target path on success, or an error string
/// describing the security violation on failure.
pub fn validate_path_within_root(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("Invalid root path '{}': {}", root.display(), e))?;

    let canonical_target = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| format!("Cannot resolve target path '{}': {}", target.display(), e))?
    } else {
        // Destination directory may not exist yet — canonicalise the parent,
        // then append the filename.
        let parent = target
            .parent()
            .ok_or_else(|| format!("Path '{}' has no parent directory", target.display()))?;
        let filename = target
            .file_name()
            .ok_or_else(|| format!("Path '{}' has no filename component", target.display()))?;

        // The parent may itself not exist yet (nested buckets). Walk up until we
        // find an ancestor that does exist so we can canonicalise it.
        let mut existing_ancestor = parent.to_path_buf();
        let mut suffix = PathBuf::new();
        while !existing_ancestor.exists() {
            if let Some(name) = existing_ancestor.file_name() {
                suffix = PathBuf::from(name).join(&suffix);
            }
            match existing_ancestor.parent() {
                Some(p) => existing_ancestor = p.to_path_buf(),
                None => {
                    return Err(format!(
                        "Cannot find existing ancestor for path '{}'",
                        target.display()
                    ))
                }
            }
        }

        let canonical_ancestor = existing_ancestor.canonicalize().map_err(|e| {
            format!(
                "Cannot canonicalise ancestor of '{}': {}",
                target.display(),
                e
            )
        })?;

        canonical_ancestor.join(suffix).join(filename)
    };

    if !canonical_target.starts_with(&canonical_root) {
        return Err(format!(
            "Security violation: path escapes the root directory. \
             Root: '{}', Target: '{}'",
            canonical_root.display(),
            canonical_target.display()
        ));
    }

    Ok(canonical_target)
}

/// Validates that `path_str` points to a real, accessible directory and returns
/// the canonicalised `PathBuf`. Applies safety checks in this order:
///
/// 1. Canonicalise the path (rejects traversal sequences and symlink tricks).
/// 2. Confirm the path is a directory, not a file.
/// 3. Reject drive roots (C:\, D:\, /).
/// 4. Reject critical OS system directories (C:\Windows, /etc, etc.).
pub fn validate_scan_path(path_str: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path_str);
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Invalid or inaccessible path '{}': {}", path_str, e))?;

    if !canonical.is_dir() {
        return Err(format!(
            "Scan target must be a folder, not a file: '{}'",
            canonical.display()
        ));
    }

    // SAFETY — RULE 4: Drive roots must never be treated as normal scan targets.
    if crate::rules::system::is_drive_root(&canonical) {
        return Err(format!(
            "Cannot scan a drive root directly ('{}').\n\
             Please select a specific folder inside it (e.g. Desktop or Downloads).",
            canonical.display()
        ));
    }

    // SAFETY — RULE 5: Critical OS system directories are always protected.
    if crate::rules::system::is_critical_system_path(&canonical) {
        return Err(format!(
            "Cannot scan a protected system directory ('{}').\n\
             This directory is managed by the operating system and cannot be organised.",
            canonical.display()
        ));
    }

    Ok(canonical)
}

fn is_cross_device_error(err: &io::Error) -> bool {
    err.kind().to_string().contains("cross-device")
        || err
            .raw_os_error()
            .map(|code| code == 17 || code == 18)
            .unwrap_or(false)
}

fn copy_path_recursively(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| {
            format!(
                "Cannot create destination directory '{}': {}",
                dst.display(),
                e
            )
        })?;
        for entry in fs::read_dir(src)
            .map_err(|e| format!("Cannot read directory '{}': {}", src.display(), e))?
        {
            let entry = entry.map_err(|e| format!("Cannot read directory entry: {}", e))?;
            let child_src = entry.path();
            let child_dst = dst.join(entry.file_name());
            copy_path_recursively(&child_src, &child_dst)?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ()).map_err(|e| {
            format!(
                "Cannot copy '{}' to '{}': {}",
                src.display(),
                dst.display(),
                e
            )
        })
    }
}

fn remove_path(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Cannot remove directory '{}': {}", path.display(), e))
    } else {
        fs::remove_file(path).map_err(|e| format!("Cannot remove file '{}': {}", path.display(), e))
    }
}

pub fn move_path(src: &Path, dst: &Path) -> Result<(), String> {
    match fs::rename(src, dst) {
        Ok(_) => Ok(()),
        Err(rename_err) => {
            if !is_cross_device_error(&rename_err) {
                let msg = match rename_err.kind() {
                    io::ErrorKind::PermissionDenied => "Access Denied. Ensure the file is not open in another program.",
                    io::ErrorKind::NotFound => "The file or directory no longer exists.",
                    io::ErrorKind::AlreadyExists => "A file already exists at the destination.",
                    io::ErrorKind::Interrupted => "The operation was interrupted.",
                    io::ErrorKind::InvalidInput => "The file name or path is invalid or too long (exceeds Windows MAX_PATH limits).",
                    _ => "A system error prevented this file from being moved.",
                };
                return Err(format!(
                    "{} ({})",
                    msg,
                    rename_err.to_string().replace(" (os error", "")
                ));
            }

            copy_path_recursively(src, dst)?;

            if let Err(delete_err) = remove_path(src) {
                let _ = remove_path(dst);
                return Err(format!(
                    "Cross-device move cleanup failed for '{}': {}",
                    src.display(),
                    delete_err
                ));
            }

            Ok(())
        }
    }
}

/// Recursively removes empty parent directories starting from `path` and walking upwards.
///
/// Stops when:
/// 1. A directory is not empty.
/// 2. The path is a drive root (e.g. C:\) or a critical system path (e.g. C:\Windows).
/// 3. A directory cannot be removed due to permissions.
pub fn prune_empty_parents(mut path: PathBuf) {
    while path.is_dir() {
        // Read directory. If empty, remove it and continue to parent.
        match fs::read_dir(&path) {
            Ok(mut entries) => {
                if entries.next().is_none() {
                    // It's empty.
                    // SAFETY: Never prune drive roots or critical system paths.
                    if crate::rules::system::is_drive_root(&path)
                        || crate::rules::system::is_critical_system_path(&path)
                    {
                        break;
                    }

                    if fs::remove_dir(&path).is_err() {
                        // Likely permissions or someone else just added a file. Stop pruning.
                        break;
                    }

                    path = match path.parent() {
                        Some(p) => p.to_path_buf(),
                        None => break,
                    };
                } else {
                    // Not empty. Stop.
                    break;
                }
            }
            Err(_) => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use uuid::Uuid;

    fn unique_temp_path(label: &str) -> PathBuf {
        env::temp_dir().join(format!("urordo-{}-{}", label, Uuid::new_v4()))
    }

    #[test]
    fn test_path_within_root_accepted() {
        let root = env::temp_dir();
        let target = root.join("subdir").join("file.txt");
        // target doesn't exist but its ancestor (temp_dir) does
        let result = validate_path_within_root(&root, &target);
        assert!(result.is_ok(), "Expected Ok, got {:?}", result);
    }

    #[test]
    fn test_path_traversal_blocked() {
        // Use the temp dir as root; try to escape to its parent
        let root = env::temp_dir();
        let parent = root.parent().unwrap_or(Path::new("C:\\"));
        let evil = parent.join("evil.dll");
        let result = validate_path_within_root(&root, &evil);
        assert!(result.is_err(), "Expected path traversal to be blocked");
        let err = result.unwrap_err();
        assert!(
            err.contains("Security violation") || err.contains("Cannot"),
            "Unexpected error: {}",
            err
        );
    }

    #[test]
    fn test_move_path_moves_file() {
        let src_dir = unique_temp_path("move-file-src");
        let dst_dir = unique_temp_path("move-file-dst");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dst_dir).unwrap();

        let src = src_dir.join("example.txt");
        let dst = dst_dir.join("example.txt");
        fs::write(&src, "hello").unwrap();

        move_path(&src, &dst).unwrap();

        assert!(!src.exists());
        assert_eq!(fs::read_to_string(&dst).unwrap(), "hello");

        let _ = fs::remove_dir_all(&src_dir);
        let _ = fs::remove_dir_all(&dst_dir);
    }

    #[test]
    fn test_move_path_moves_directory() {
        let src_root = unique_temp_path("move-dir-src");
        let dst_root = unique_temp_path("move-dir-dst");
        let src = src_root.join("project");
        let nested = src.join("nested");
        let dst = dst_root.join("project");

        fs::create_dir_all(&nested).unwrap();
        fs::create_dir_all(&dst_root).unwrap();
        fs::write(src.join("top.txt"), "top").unwrap();
        fs::write(nested.join("deep.txt"), "deep").unwrap();

        move_path(&src, &dst).unwrap();

        assert!(!src.exists());
        assert_eq!(fs::read_to_string(dst.join("top.txt")).unwrap(), "top");
        assert_eq!(
            fs::read_to_string(dst.join("nested").join("deep.txt")).unwrap(),
            "deep"
        );

        let _ = fs::remove_dir_all(&src_root);
        let _ = fs::remove_dir_all(&dst_root);
    }

    #[test]
    fn test_validate_scan_path_rejects_file() {
        let root = unique_temp_path("scan-file");
        fs::create_dir_all(&root).unwrap();
        let file = root.join("single.txt");
        fs::write(&file, "hello").unwrap();

        let result = validate_scan_path(file.to_string_lossy().as_ref());
        assert!(result.is_err(), "Expected file scan target to be rejected");
        assert!(result.unwrap_err().contains("must be a folder"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_validate_scan_path_rejects_drive_root() {
        let result = validate_scan_path("C:\\");
        assert!(result.is_err(), "Expected drive root scan to be rejected");
        let err = result.unwrap_err();
        assert!(
            err.contains("drive root"),
            "Expected 'drive root' in error, got: {}",
            err
        );
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_validate_scan_path_rejects_windows_system() {
        let result = validate_scan_path("C:\\Windows");
        assert!(result.is_err(), "Expected C:\\Windows scan to be rejected");
        let err = result.unwrap_err();
        assert!(
            err.contains("system directory") || err.contains("protected"),
            "Expected protection message, got: {}",
            err
        );
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn test_validate_scan_path_rejects_unix_root() {
        let result = validate_scan_path("/");
        assert!(result.is_err(), "Expected Unix root scan to be rejected");
        let err = result.unwrap_err();
        assert!(
            err.contains("drive root") || err.contains("protected"),
            "Expected protection message, got: {}",
            err
        );
    }

    #[test]
    fn test_prune_empty_parents() {
        let root = unique_temp_path("prune-test");
        let a = root.join("a");
        let b = a.join("b");
        let c = b.join("c");
        fs::create_dir_all(&c).unwrap();

        let keep_file = root.join("keep_me.txt");
        fs::write(&keep_file, "data").unwrap();

        assert!(c.exists());
        prune_empty_parents(c.clone());

        // c, b, and a should be gone because they are empty
        assert!(!c.exists());
        assert!(!b.exists());
        assert!(!a.exists());

        // root should still exist because it has keep_me.txt
        assert!(root.exists());
        assert!(keep_file.exists());

        let _ = fs::remove_dir_all(&root);
    }
}
