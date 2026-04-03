use super::projects::is_project_dir;
use super::resources::is_resource_dir;
use std::path::Path;

#[derive(Debug, PartialEq)]
pub enum FolderType {
    Project,
    Resource,
    Empty,
    Unstructured,
}

/// Identifies the high-level purpose of a directory.
pub fn classify_folder(path: &Path) -> FolderType {
    if is_project_dir(path) {
        return FolderType::Project;
    }

    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    if is_resource_dir(name) {
        return FolderType::Resource;
    }

    if is_empty_dir(path) {
        return FolderType::Empty;
    }

    // Default to unstructured if it's not a known atomic unit
    FolderType::Unstructured
}

/// Returns true if the directory exists and contains zero files or subdirectories.
pub fn is_empty_dir(path: &Path) -> bool {
    if let Ok(mut entries) = std::fs::read_dir(path) {
        entries.next().is_none()
    } else {
        false
    }
}
