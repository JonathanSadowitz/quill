# Quill

A **Markdown** word processor that runs as a native app (Tauri) on Linux and Windows, or in the browser. Dark theme, 80-column layout, live preview, and keyboard shortcuts in Nano style (^X = Ctrl+X, M-X = Alt+X).

---

## Features

- **Markdown** — Edit and save as `.md` or `.txt`. Headings (# ## ###), **bold**, *italic*, `code`, lists, links, and fenced code blocks.
- **Preview** — View → Preview (or ^P) to see rendered Markdown; toggle back to edit.
- **Select & copy** — Drag with the mouse to select text, or use Alt+B / Alt+E to mark block begin/end. Ctrl+C / Ctrl+X / Ctrl+V to copy, cut, paste.
- **Menu bar** — File, Edit, View, Help with hover-to-open; every action has a keyboard shortcut.
- **Font** — View → Font… to choose editor and UI font (choice is saved).
- **80-column layout** — Word wrap at 80 columns; status line shows filename, line, column, word count, zoom.
- **Shortcuts** — Nano-style: ^N New, ^O Open, ^S Save, M-S Save As, M-Q Exit, ^P Preview, ^F Find, ^G Help, etc.

---

## Native app (Tauri) — Linux & Windows

### Prerequisites

- **Rust:** [rustup](https://rustup.rs/) (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Tauri CLI:** `cargo install tauri-cli`
- **Linux (e.g. CachyOS/Arch):** WebKitGTK and build deps:
  ```bash
  sudo pacman -S webkit2gtk-4.1 base-devel curl wget file
  ```
- **Windows:** [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually present on Windows 11).

### Run in development

From the project root:

```bash
cargo tauri dev
```

`index.html`, `style.css`, and `app.js` are loaded from the project directory. No separate dev server needed.

### Build for release

```bash
cargo tauri build
```

- **Linux:** output in `src-tauri/target/release/bundle/` (e.g. `.deb`, `.AppImage`, or the binary).
- **Windows:** output in `src-tauri/target/release/bundle/msi/` or run `quill.exe` from `src-tauri/target/release/`.

To build a Windows executable from Linux, use cross-compilation (e.g. `cross`) or build on Windows / in CI.

### Optional: app icon

Generate icons from a 1024×1024 PNG:

```bash
cargo tauri icon app-icon.png
```

---

## Web (browser) fallback

Open `index.html` in a browser or serve it:

```bash
python -m http.server 8080
# Then open http://localhost:8080
```

For **open/save from disk** in the browser, Chrome or Edge work best (File System Access API). Other browsers use the file picker and download.

---

## Key commands (Nano style)

| Keys | Action |
|------|--------|
| **^N** **^O** **^S** | New, Open, Save |
| **M-S** **M-Q** | Save As, Exit |
| **M-B** **M-E** **Esc** | Mark block begin, end, clear selection |
| **^X** **^C** **^V** | Cut, Copy, Paste (with selection) |
| **^F** **^L** **^J** | Find, Find again, Reformat paragraph |
| **^P** | Toggle Markdown preview |
| **^+** **^-** **^0** | Zoom in, out, reset |
| **^G** or **F1** | Help (shortcuts) |
| **Ins** | Toggle Insert / Replace |
| **View → Font…** | Change font (saved) |

**Movement:** ^E ^X ^S ^D up/down/left/right, ^A word left, Home/End line start/end, ^Home ^End doc start/end.  
**Editing:** ^Y delete line, ^T delete word, ^G delete char, Backspace, Enter, Tab.

**Mouse:** Drag to select text; then use ^C / ^X / ^V to copy, cut, paste.

---

## Look and feel

- Dark grey theme.
- 80-column editor with word wrap; no horizontal scrollbar.
- Status line: filename, page, line, column, Insert/Replace, word count, zoom.
- Block selection is highlighted; copy/paste work with mouse selection or keyboard block (M-B, M-E).
- Window starts maximized; layout fills the viewport.

Files are saved as **Markdown** (`.md`) or plain text (`.txt`).

## License

Quill is licensed under the [MIT License](LICENSE).

## Icon credit

"Quill" icon by EX Liberus, from [Noun Project](https://thenounproject.com) (CC BY 3.0).
