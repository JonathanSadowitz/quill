# Quill

A **Markdown** word processor that runs as a native app (Tauri) on Linux and Windows, or in the browser. Write in plain text with 80-column layout, live Markdown preview, themes, and keyboard-first shortcuts.

---

## Features

### Editing

- **Markdown** — Headings (`#`, `##`, `###`), **bold**, *italic*, `code`, lists, links, and fenced code blocks. Preview renders standard Markdown.
- **80-column layout** — Word wrap at 80 columns; no horizontal scrollbar. A ruler shows column markers (L, R, and every 8 columns).
- **Undo / Redo** — Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y), up to 500 steps. History is cleared on New or Open.
- **Selection & clipboard** — Shift+Arrow or drag to select; Cut (Ctrl+X), Copy (Ctrl+C), Paste (Ctrl+V), Select All (Ctrl+A). Typing or Delete replaces the selection.
- **Find & Replace** — Edit → Find… or Ctrl+F. Find Next/Previous, Replace, Replace All; optional case-sensitive search.

### View & layout

- **Preview** — View → Preview (or Ctrl+P) to see rendered Markdown; toggle back to edit.
- **Theme** — View → Theme… to choose **Dark**, **Light**, **Synthwave**, or **Green terminal**. Choice is saved (localStorage).
- **Font** — View → Font… to choose editor and UI font: IBM Plex Mono, Liberation Mono, Courier New, Source Serif 4, Georgia, or System UI. Choice is saved.
- **Zoom** — Ctrl++ / Ctrl+- / Ctrl+0 (or Ctrl+= for zoom in). Zoom level is saved.
- **Status line** — Unsaved indicator (•), word count, and zoom percentage. Window title shows • when there are unsaved changes.

### Menus & shortcuts

- **Menu bar** — File, Edit, View. Click or hover to open; every action has a keyboard shortcut shown in the menu. Keyboard: Alt to focus menu bar, Arrow keys to move, Enter to run.
- **Discard prompts** — New, Open, and Exit ask to discard the current document if it has unsaved changes.

---

## Native app (Tauri) — Linux & Windows

### Prerequisites

- **Rust:** [rustup](https://rustup.rs/) (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Tauri CLI:** `cargo install tauri-cli`
- **Linux (e.g. CachyOS/Arch):** WebKitGTK and build deps:
  ```bash
  sudo pacman -S webkit2gtk-4.1 base-devel librsvg
  ```
- **Windows:** [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually present on Windows 11).

### Run in development

From the project root:

```bash
cargo tauri dev
```

`web/index.html`, `web/style.css`, and `web/app.js` are loaded from the `web/` directory. No separate dev server needed.

### Build for release

```bash
cargo tauri build
```

- **Linux:** output in `target/release/` (binary) and `target/release/bundle/` (e.g. `.deb`, `.rpm`). See [BUILD-LINUX.md](BUILD-LINUX.md) for build and run steps on CachyOS/Arch.
- **Windows:** output in `src-tauri/target/release/bundle/msi/` or run `quill.exe` from `src-tauri/target/release/`.

To build a Windows executable from Linux, use cross-compilation (e.g. `cross`) or build on Windows or in CI.

### Optional: app icon

Generate icons from a 1024×1024 PNG:

```bash
cargo tauri icon app-icon.png
```

---

## Web (browser) fallback

Open `web/index.html` in a browser or serve it:

```bash
python -m http.server 8080
# Then open http://localhost:8080
```

For **open/save from disk** in the browser, Chrome or Edge work best (File System Access API). Other browsers use the file picker and download.

---

## Key commands

| Keys | Action |
|------|--------|
| **Ctrl+N** | New document |
| **Ctrl+O** | Open file |
| **Ctrl+S** | Save |
| **Ctrl+Shift+S** | Save As… |
| **Alt+Q** | Exit (discard prompt if unsaved) |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** / **Ctrl+Y** | Redo |
| **Ctrl+X** / **Ctrl+C** / **Ctrl+V** | Cut / Copy / Paste |
| **Ctrl+A** | Select All |
| **Ctrl+F** | Find… |
| **Ctrl+P** | Toggle Markdown preview |
| **Ctrl++** / **Ctrl+=** / **Ctrl+-** / **Ctrl+0** | Zoom in / Zoom out / Reset zoom |
| **View → Theme…** | Change theme (saved) |
| **View → Font…** | Change font (saved) |

**Movement:** Arrow keys, Home/End (line), Ctrl+Home/End (document), Page Up/Down. Shift+Arrow extends selection.  
**Editing:** Backspace, Delete, Enter, Tab.  
**Menus:** Alt to focus menu bar; Arrow keys to move; Enter to run; Escape to close and return to editor.

---

## Look and feel

- Default theme is Dark; you can switch to Light, Synthwave, or Green terminal.
- 80-column editor with word wrap and a ruler (L, R, and 8-column markers); no horizontal scrollbar.
- Status line: unsaved indicator (•), word count, zoom percentage.
- In the native app, the window starts maximized; layout fills the viewport.

## License

Quill is licensed under the [MIT License](LICENSE).

## Icon credit

"Quill" icon by EX Liberus, from [Noun Project](https://thenounproject.com) (CC BY 3.0).
