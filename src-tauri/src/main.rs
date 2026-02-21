// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;
use std::io;

#[derive(Serialize)]
struct OpenResult {
    path: String,
    content: String,
}

#[derive(Serialize)]
struct AppInfo {
    name: String,
    version: String,
}

#[tauri::command]
fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Quill".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
fn exit_app() {
    std::process::exit(0);
}

#[tauri::command]
fn open_file() -> Result<OpenResult, String> {
    let path = rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .pick_file()
        .ok_or_else(|| "Cancelled".to_string())?;
    let content = fs::read_to_string(&path).map_err(|e| {
        if e.kind() == io::ErrorKind::InvalidData {
            "File is not valid UTF-8 text.".to_string()
        } else {
            e.to_string()
        }
    })?;
    let path_str = path.to_string_lossy().into_owned();
    Ok(OpenResult { path: path_str, content })
}

#[tauri::command]
fn open_file_by_path(path: String) -> Result<OpenResult, String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.is_file() {
        return Err("File not found".to_string());
    }
    let content = fs::read_to_string(&path_buf).map_err(|e| {
        if e.kind() == io::ErrorKind::InvalidData {
            "File is not valid UTF-8 text.".to_string()
        } else {
            e.to_string()
        }
    })?;
    Ok(OpenResult {
        path: path.to_string(),
        content,
    })
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file_as(content: String) -> Result<String, String> {
    let path = rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .save_file()
        .ok_or_else(|| "Cancelled".to_string())?;
    let path_str = path.to_string_lossy().into_owned();
    fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path_str)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![exit_app, open_file, open_file_by_path, save_file, save_file_as, get_app_info])
        .run(tauri::generate_context!())
        .expect("error while running Quill");
}
