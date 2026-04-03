use super::launchers::ClassifyResult;
use dashmap::DashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Global per-directory project-marker cache.
/// Key: canonical parent directory path.
/// Value: true = directory is a project root, false = not a project root.
///
/// This is populated lazily. Because `check_project` is called from rayon
/// threads (one per file in a batch), DashMap provides wait-free concurrent reads
/// and fine-grained shard locking for writes.
static PROJECT_CACHE: OnceLock<DashMap<PathBuf, bool>> = OnceLock::new();

fn project_cache() -> &'static DashMap<PathBuf, bool> {
    PROJECT_CACHE.get_or_init(DashMap::new)
}

pub fn is_project_dir(parent: &Path) -> bool {
    let cache = project_cache();

    // Fast path: already cached
    if let Some(cached) = cache.get(parent) {
        return *cached;
    }

    // Slow path: probe the filesystem
    let markers = [
        ".git",
        "package.json",
        "Cargo.toml",
        "node_modules",
        ".venv",
        "requirements.txt",
        "go.mod",
        "poetry.lock",
        "Pipfile",
        "CMakeLists.txt",
        ".editorconfig",
        "tsconfig.json",
    ];
    let mut result = markers.iter().any(|m| parent.join(m).exists());

    if !result {
        // Also check for Visual Studio solution files (C#/.NET)
        if let Ok(entries) = std::fs::read_dir(parent) {
            result = entries.flatten().any(|e| {
                let path = e.path();
                let ext = path
                    .extension()
                    .and_then(|x| x.to_str())
                    .unwrap_or_default();
                ext == "sln" || ext == "csproj" || ext == "fsproj"
            });
        }
    }

    cache.insert(parent.to_path_buf(), result);
    result
}

pub fn check_project(path: &Path, root_path: Option<&Path>) -> Option<ClassifyResult> {
    for ancestor in path.ancestors().skip(1) {
        if is_project_dir(ancestor) {
            return Some(ClassifyResult::Protected("Project"));
        }
        if let Some(r) = root_path {
            if ancestor == r {
                break;
            }
        }
    }
    None
}

/// Clears the project-marker cache.
///
/// Call this at the start of each scan so that directories added or removed
/// since the last scan (e.g. a new `.git` folder) are re-evaluated rather
/// than returning stale results from the previous scan.
pub fn clear_project_cache() {
    project_cache().clear();
}
