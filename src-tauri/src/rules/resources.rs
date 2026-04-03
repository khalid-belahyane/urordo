use std::path::Path;

/// Detects if a directory is a "Resource Folder" based on its name.
/// Resource folders are treated as atomic units (not scanned individually).
pub fn is_resource_dir(name: &str) -> bool {
    let lower = name.to_lowercase();

    // Exact or partial matches for intentional organization
    let keywords = [
        "icons",
        "assets",
        "resources",
        "static",
        "public",
        "images",
        "photos",
        "pictures",
        "docs",
        "documents",
        "data",
        "backup",
        "archive",
        "old",
        "libs",
        "vendor",
        "videos",
        "movies",
        "audio",
        "music",
        "downloads",
        "desktop",
    ];

    keywords.iter().any(|&kw| {
        // Match exact word, or commonly prefixed folder names (e.g. "my-icons")
        lower == kw
            || lower.contains(&format!("-{}", kw))
            || lower.contains(&format!("{}-", kw))
            || lower.contains(&format!(" {}", kw))
            || lower.contains(&format!("{} ", kw))
    })
}

/// Helper to check if a path's parent or ancestor is already a protected project
/// (to prevent double-wrapping or conflicting rules).
pub fn check_resource(path: &Path) -> bool {
    if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
        return is_resource_dir(name);
    }
    false
}
