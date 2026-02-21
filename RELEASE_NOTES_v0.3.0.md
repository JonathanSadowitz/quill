# Quill v0.3.0

**Highlights:** Configurable wrap width (72 / 80 / 100 / 120 columns) and several stability fixes.

---

## What's new

### Wrap width
- **View → Wrap width…** — Choose line wrap: **72**, **80**, **100**, or **120** columns. Ruler and editor width follow the selected value. Choice is saved (localStorage). Default remains 80.

### Fixes and improvements
- **Replace All** — Unsaved indicator (•) in the title bar now updates immediately after Replace All.
- **Restore last file** — If the previously opened file was deleted or moved, Quill no longer retries it on every startup; the stored path is cleared after a failed open.
- **Fullscreen** — Removed duplicate F11 handler that could cause double-toggle in some cases.
- **About (browser)** — Fallback version shown when opening the app without Tauri now matches the release (0.3.0).
- **Empty document** — Safer handling when mapping offsets to positions in an empty buffer.

---

## Downloads

- **Linux:** `quill` binary, `Quill_0.3.0_amd64.deb`, and `Quill-0.3.0-1.x86_64.rpm` from `src-tauri/target/release/bundle/` after `cargo tauri build`.
- **Windows:** Build on Windows with `cargo tauri build` for `quill.exe` or the MSI installer (WebView2 required).

See the [README](https://github.com/JonathanSadowitz/quill#readme) for prerequisites, build steps, and shortcuts.
