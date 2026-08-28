use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

/// Saved paths live in a plain, user-visible folder rather than an opaque app
/// data directory, so people can back them up or share them by hand.
fn workspace() -> Result<PathBuf, String> {
    let base = dirs_document_dir().ok_or_else(|| "no documents directory".to_string())?;
    let dir = base.join("Pedro Pathing Visualizer");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn dirs_document_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Documents"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("USERPROFILE").map(|h| PathBuf::from(h).join("Documents"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Documents"))
    }
}

/// Resolves a path coming from the frontend. Absolute paths are used as-is —
/// they only ever originate from a native file dialog, and `currentFilePath`
/// holds one after a "Save As". Bare names resolve inside the workspace; a
/// *relative* path with separators is a bug rather than a user choice, so it is
/// rejected instead of being silently normalized.
fn resolve_path(name: &str) -> Result<PathBuf, String> {
    if name.is_empty() {
        return Err("empty file name".to_string());
    }
    let path = Path::new(name);
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    if name.contains('/') || name.contains('\\') || path.components().count() != 1 {
        return Err(format!("invalid file name: {name}"));
    }
    Ok(workspace()?.join(name))
}

#[derive(Serialize)]
pub struct FileInfo {
    name: String,
    path: String,
    size: u64,
    modified: u64,
}

#[derive(Serialize)]
pub struct DirStats {
    #[serde(rename = "totalFiles")]
    total_files: usize,
    #[serde(rename = "totalSize")]
    total_size: u64,
    #[serde(rename = "lastModified")]
    last_modified: u64,
}

fn modified_millis(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
fn workspace_path() -> Result<String, String> {
    Ok(workspace()?.to_string_lossy().into_owned())
}

#[tauri::command]
fn list_files() -> Result<Vec<FileInfo>, String> {
    let dir = workspace()?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = match entry.metadata() {
            Ok(m) if m.is_file() => m,
            _ => continue,
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".pp") && !name.ends_with(".json") {
            continue;
        }
        out.push(FileInfo {
            path: name.clone(),
            name,
            size: meta.len(),
            modified: modified_millis(&meta),
        });
    }
    Ok(out)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(resolve_path(&path)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<bool, String> {
    fs::write(resolve_path(&path)?, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn delete_file(path: String) -> Result<bool, String> {
    let target = resolve_path(&path)?;
    if !target.exists() {
        return Ok(false);
    }
    fs::remove_file(target).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn file_exists(path: String) -> Result<bool, String> {
    Ok(resolve_path(&path)?.is_file())
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<bool, String> {
    let from = resolve_path(&old_path)?;
    let to = resolve_path(&new_path)?;
    if !from.is_file() || to.exists() {
        return Ok(false);
    }
    fs::rename(from, to).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn dir_stats() -> Result<DirStats, String> {
    let files = list_files()?;
    Ok(DirStats {
        total_files: files.len(),
        total_size: files.iter().map(|f| f.size).sum(),
        last_modified: files.iter().map(|f| f.modified).max().unwrap_or(0),
    })
}

/// Read/write for absolute paths the user picked through a native dialog.
#[tauri::command]
fn read_file_at(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_at(path: String, content: String) -> Result<bool, String> {
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            workspace_path,
            list_files,
            read_file,
            write_file,
            delete_file,
            file_exists,
            rename_file,
            dir_stats,
            read_file_at,
            write_file_at,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pedro Pathing Visualizer");
}
