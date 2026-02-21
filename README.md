# Quill

A **Markdown** word processor that runs as a native app (Tauri) on Linux and Windows. Write in plain text with 80-column layout, live Markdown preview, themes, and keyboard-first shortcuts.

---

## Features

### Editing

- **Markdown** — Headings (`#`, `##`, `###`), **bold**, *italic*, `code`, lists, links, and fenced code blocks. Preview renders standard Markdown.
- **Configurable wrap** — View → Wrap width… to choose **72**, **80**, **100**, or **120** columns. Word wrap and ruler follow; choice is saved. Default 80.
- **Undo / Redo** — Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y), up to 500 steps. History is cleared on New or Open.
- **Selection & clipboard** — Shift+Arrow or drag to select; Cut (Ctrl+X), Copy (Ctrl+C), Paste (Ctrl+V), Select All (Ctrl+A). Typing or Delete replaces the selection.
- **Find & Replace** — Edit → Find… or Ctrl+F. Find Next/Previous, Replace, Replace All; optional case-sensitive search.

### View & layout

- **Preview** — View → Preview (or Ctrl+P) to see rendered Markdown; toggle back to edit.
- **Theme** — View → Theme… to choose **Dark**, **Light**, **Synthwave**, or **Green terminal**. Choice is saved (localStorage).
- **Font** — View → Font… to choose editor and UI font: IBM Plex Mono, Liberation Mono, Courier New, Source Serif 4, Georgia, or System UI. Choice is saved.
- **Zoom** — Ctrl++ / Ctrl+- / Ctrl+0 (or Ctrl+= for zoom in). Zoom level is saved.
- **Document title** — Filename (or “Untitled”) and unsaved indicator (•) in the centre of the menu bar; word count and zoom on the right.
- **Fullscreen** — View → Fullscreen or F11 to toggle.
- **About** — Help → About Quill shows app version and license.

### Session

- **Restore last file** — On startup, Quill reopens the last opened file and restores the cursor position. The path and position are saved when you open/save a file or when the window is closed or hidden.

### Menus & shortcuts

- **Menu bar** — File, Edit, View, Help. Click or hover to open; every action has a keyboard shortcut shown in the menu. Keyboard: Alt to focus menu bar, Arrow keys to move, Enter to run.
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
| **F11** | Toggle fullscreen |
| **Ctrl++** / **Ctrl+=** / **Ctrl+-** / **Ctrl+0** | Zoom in / Zoom out / Reset zoom |
| **View → Theme…** | Change theme (saved) |
| **View → Font…** | Change font (saved) |
| **View → Wrap width…** | 72 / 80 / 100 / 120 columns (saved) |
| **Help → About Quill** | App version and license |

**Movement:** Arrow keys, Home/End (line), Ctrl+Home/End (document), Page Up/Down. Shift+Arrow extends selection.  
**Editing:** Backspace, Delete, Enter, Tab.  
**Menus:** Alt to focus menu bar; Arrow keys to move; Enter to run; Escape to close and return to editor.

---

## Look and feel

- Default theme is Dark; you can switch to Light, Synthwave, or Green terminal.
- 80-column editor with word wrap and a ruler (L, R, and 8-column markers); no horizontal scrollbar.
- Menu bar: document title (filename or “Untitled”) in the centre with • when unsaved; word count and zoom on the right.
- The window starts maximized; layout fills the viewport.

## License

Quill is licensed under the [MIT License](LICENSE).

## Icon credit

"Quill" icon by EX Liberus, from [Noun Project](https://thenounproject.com) (CC BY 3.0).
