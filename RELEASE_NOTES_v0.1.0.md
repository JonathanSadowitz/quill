# Quill v0.1.0

First release of **Quill** — a Markdown word processor that runs as a native app (Tauri) on Linux and Windows.

## What's in this release

### Editing
- **Markdown** — Headings, **bold**, *italic*, `code`, lists, links, fenced code blocks. Live preview renders standard Markdown.
- **80-column layout** — Word wrap at 80 columns with a ruler (L, R, and every 8 columns). No horizontal scrollbar.
- **Undo / Redo** — Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y), up to 500 steps.
- **Selection & clipboard** — Cut, Copy, Paste, Select All. Find & Replace (Ctrl+F) with case-sensitive option.

### View & layout
- **Preview** — View → Preview (Ctrl+P) to see rendered Markdown; toggle back to edit.
- **Themes** — Dark, Light, Synthwave, Green terminal. Choice saved (localStorage).
- **Font** — Choose editor and UI font (IBM Plex Mono, Liberation Mono, Courier New, Source Serif 4, Georgia, System UI). Saved.
- **Zoom** — Ctrl++ / Ctrl+- / Ctrl+0. Zoom level saved.
- **Fullscreen** — View → Fullscreen or F11.
- **Document title** — Filename (or "Untitled") and unsaved indicator (•) in the menu bar; word count and zoom on the right.

### Menus & shortcuts
- **Menu bar** — File, Edit, View, Help. Keyboard: Alt to focus, Arrow keys to move, Enter to run. Every action has a shortcut shown in the menu.
- **Discard prompts** — New, Open, and Exit ask to discard if there are unsaved changes.
- **Restore last file** — Reopens the last edited file on startup (path saved on exit).

### Platforms
- **Linux** — `.deb` and `.rpm` bundles (e.g. CachyOS/Arch: WebKitGTK and build deps required).
- **Windows** — MSI installer; WebView2 required (usually present on Windows 11).

---

**Key shortcuts:** Ctrl+N/O/S (New/Open/Save), Ctrl+Shift+S (Save As), Alt+Q (Exit), Ctrl+Z/Shift+Z (Undo/Redo), Ctrl+F (Find), Ctrl+P (Preview), F11 (Fullscreen), Ctrl++/-/0 (Zoom).

See [README](https://github.com/JonathanSadowitz/quill/blob/main/README.md) for prerequisites, build instructions, and full shortcut list.
