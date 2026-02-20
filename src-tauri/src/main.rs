// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;

#[derive(Serialize)]
struct OpenResult {
    path: String,
    content: String,
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
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let path_str = path.to_string_lossy().into_owned();
    Ok(OpenResult { path: path_str, content })
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
        .invoke_handler(tauri::generate_handler![exit_app, open_file, save_file, save_file_as])
        .run(tauri::generate_context!())
        .expect("error while running Quill");
}
