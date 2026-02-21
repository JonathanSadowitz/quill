/**
 * Quill – local Markdown word processor (no file I/O).
 * Compact shortcuts: ^X = Ctrl+X, M-X = Alt+X.
 */

(function () {
  'use strict';

  const COLS = 80;
  const TAB = 8;

  let lines = [''];
  let row = 0;
  let col = 0;
  let dirty = false;
  let currentFilePath = null;

  const MAX_UNDO = 500;
  let undoHistory = [];
  let redoStack = [];

  let anchorRow = 0;
  let anchorCol = 0;

  const $ = (id) => document.getElementById(id);
  const ruler = $('ws-ruler-content');
  const textEl = $('ws-text');
  const cursorEl = $('ws-cursor');

  function line() {
    return lines[row] || '';
  }

  function setLine(r, s) {
    while (lines.length <= r) lines.push('');
    lines[r] = s;
  }

  function clampCol(r, c) {
    const ln = (lines[r] || '').length;
    return Math.max(0, Math.min(c, ln));
  }

  function hasSelection() {
    return anchorRow !== row || anchorCol !== col;
  }

  function selectionBounds() {
    let r0 = anchorRow;
    let c0 = anchorCol;
    let r1 = row;
    let c1 = col;
    if (r0 > r1 || (r0 === r1 && c0 > c1)) {
      [r0, c0, r1, c1] = [r1, c1, r0, c0];
    }
    return { startRow: r0, startCol: c0, endRow: r1, endCol: c1 };
  }

  function clearSelection() {
    anchorRow = row;
    anchorCol = col;
  }

  function getSelectedText() {
    if (!hasSelection()) return '';
    const { startRow, startCol, endRow, endCol } = selectionBounds();
    if (startRow === endRow) {
      return (lines[startRow] || '').slice(startCol, endCol);
    }
    const parts = [(lines[startRow] || '').slice(startCol)];
    for (let r = startRow + 1; r < endRow; r++) parts.push(lines[r] || '');
    parts.push((lines[endRow] || '').slice(0, endCol));
    return parts.join('\n');
  }

  function deleteSelection() {
    if (!hasSelection()) return;
    const { startRow, startCol, endRow, endCol } = selectionBounds();
    if (startRow === endRow) {
      const ln = lines[startRow] || '';
      setLine(startRow, ln.slice(0, startCol) + ln.slice(endCol));
    } else {
      const startLn = (lines[startRow] || '').slice(0, startCol);
      const endLn = (lines[endRow] || '').slice(endCol);
      setLine(startRow, startLn + endLn);
      lines.splice(startRow + 1, endRow - startRow);
    }
    row = startRow;
    col = startCol;
    clearSelection();
  }

  function setSelectionToCursor() {
    anchorRow = row;
    anchorCol = col;
  }

  function selectAll() {
    anchorRow = 0;
    anchorCol = 0;
    row = lines.length - 1;
    col = (lines[row] || '').length;
  }

  async function copyToClipboard() {
    const text = getSelectedText();
    if (text && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        console.warn('Copy failed (e.g. clipboard permission denied).');
      }
    }
  }

  async function cutToClipboard() {
    const text = getSelectedText();
    if (text && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        saveStateForUndo();
        deleteSelection();
        render();
      } catch (_) {
        console.warn('Cut failed (e.g. clipboard permission denied).');
      }
    }
  }

  async function pasteFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const fullText = getFullText();
      const { startRow, startCol, endRow, endCol } = selectionBounds();
      const offsetStart = offsetFor(startRow, startCol);
      const offsetEnd = offsetFor(endRow, endCol);
      const newText = fullText.slice(0, offsetStart) + text + fullText.slice(offsetEnd);
      const rawLines = newText.split('\n');
      const newLines = wrapLongLines(rawLines);
      const finalLines = newLines.length > 0 ? newLines : [''];
      const targetOffset = offsetStart + text.length;
      const pos = unwrappedOffsetToWrappedPos(rawLines, targetOffset);
      saveStateForUndo();
      lines = finalLines;
      row = pos.row;
      col = pos.col;
      anchorRow = row;
      anchorCol = col;
      dirty = true;
      render();
    } catch (_) {
      console.warn('Paste failed (e.g. clipboard permission denied).');
    }
  }

  function saveStateForUndo() {
    redoStack = [];
    undoHistory.push({
      lines: lines.map((ln) => ln.slice()),
      row,
      col
    });
    if (undoHistory.length > MAX_UNDO) undoHistory.shift();
  }

  function restoreState(state) {
    lines = state.lines.map((ln) => ln.slice());
    if (lines.length === 0) lines = [''];
    row = Math.min(state.row, lines.length - 1);
    col = clampCol(row, state.col);
    anchorRow = row;
    anchorCol = col;
  }

  function undo() {
    if (undoHistory.length === 0) return;
    redoStack.push({
      lines: lines.map((ln) => ln.slice()),
      row,
      col
    });
    const state = undoHistory.pop();
    restoreState(state);
    dirty = true;
    render();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoHistory.push({
      lines: lines.map((ln) => ln.slice()),
      row,
      col
    });
    const state = redoStack.pop();
    restoreState(state);
    dirty = true;
    render();
  }

  function renderRuler() {
    const left = 1, right = COLS;
    let s = '';
    for (let i = 0; i < right; i++) {
      if (i === 0) s += 'L';
      else if (i === right - 1) s += 'R';
      else if (i > 0 && i % 8 === 0) s += '!';
      else s += '-';
    }
    if (ruler) ruler.textContent = s;
  }

  function render() {
    if (!textEl) return;
    const frag = document.createDocumentFragment();
    const sel = hasSelection() ? selectionBounds() : null;
    for (let r = 0; r < lines.length; r++) {
      const ln = lines[r] || '';
      const lineSpan = document.createElement('span');
      lineSpan.dataset.line = r;
      if (sel && r >= sel.startRow && r <= sel.endRow) {
        const startC = r === sel.startRow ? sel.startCol : 0;
        const endC = r === sel.endRow ? sel.endCol : ln.length;
        if (startC > 0) lineSpan.appendChild(document.createTextNode(ln.slice(0, startC)));
        const selSpan = document.createElement('span');
        selSpan.className = 'ws-selection';
        selSpan.textContent = ln.slice(startC, endC);
        lineSpan.appendChild(selSpan);
        if (endC < ln.length) lineSpan.appendChild(document.createTextNode(ln.slice(endC)));
      } else {
        lineSpan.textContent = ln;
      }
      frag.appendChild(lineSpan);
      frag.appendChild(document.createTextNode('\n'));
    }
    textEl.innerHTML = '';
    textEl.appendChild(frag);
    updateCursorPos();
    updateStatus();
    if (previewMode) updatePreview();
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // Minimal Markdown to HTML (headings, bold, italic, code, links, lists)
  function markdownToHtml(md) {
    if (!md) return '';
    const lines = md.split('\n');
    const out = [];
    let inBlock = false;
    let blockBuf = '';
    let i = 0;
    function flushBlock(content) {
      if (!content.trim()) return;
      out.push('<pre><code>' + escapeHtml(content.replace(/\n$/, '')) + '</code></pre>');
    }
    function safeHref(url) {
      const u = (url || '').trim().toLowerCase();
      if (u.startsWith('javascript:') || u.startsWith('data:') || u.startsWith('vbscript:')) return '#';
      return url;
    }
    function inline(s) {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => '<a href="' + escapeHtml(safeHref(url)) + '" target="_blank" rel="noopener">' + escapeHtml(label) + '</a>');
    }
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        if (inBlock) { flushBlock(blockBuf); inBlock = false; i++; continue; }
        inBlock = true;
        blockBuf = '';
        i++;
        continue;
      }
      if (inBlock) { blockBuf += line + '\n'; i++; continue; }
      if (trimmed === '') {
        out.push('<p></p>');
        i++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        out.push('<h3>' + inline(trimmed.slice(4)) + '</h3>');
        i++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        out.push('<h2>' + inline(trimmed.slice(3)) + '</h2>');
        i++;
        continue;
      }
      if (trimmed.startsWith('# ')) {
        out.push('<h1>' + inline(trimmed.slice(2)) + '</h1>');
        i++;
        continue;
      }
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const list = [];
        while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
          list.push('<li>' + inline(lines[i].trim().slice(2)) + '</li>');
          i++;
        }
        out.push('<ul>' + list.join('') + '</ul>');
        continue;
      }
      if (/^\d+\.\s/.test(trimmed)) {
        const list = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          list.push('<li>' + inline(lines[i].trim().replace(/^\d+\.\s/, '')) + '</li>');
          i++;
        }
        out.push('<ol>' + list.join('') + '</ol>');
        continue;
      }
      if (trimmed === '---' || trimmed === '***') {
        out.push('<hr>');
        i++;
        continue;
      }
      out.push('<p>' + inline(trimmed) + '</p>');
      i++;
    }
    if (inBlock) flushBlock(blockBuf);
    return out.join('\n');
  }

  let previewMode = false;

  function updatePreview() {
    const el = $('ws-preview');
    if (!el) return;
    el.innerHTML = markdownToHtml(getFullText());
  }

  function setPreviewMode(on) {
    previewMode = on;
    const area = $('ws-content-area');
    const wrap = $('ws-preview-wrap');
    if (area) area.classList.toggle('preview-mode', on);
    if (wrap) wrap.setAttribute('aria-hidden', String(!on));
    if (on) updatePreview();
  }

  function togglePreview() {
    setPreviewMode(!previewMode);
  }

  // Get (row, col) from a mouse event for click-to-position cursor
  function getLineSpanAt(clientX, clientY) {
    const wrap = textEl.parentElement;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const inEditor = textEl.contains(el) || (wrap && wrap.contains(el));
    if (!inEditor) return null;
    if (el.nodeType === 1 && el.closest) {
      const lineSpan = el.closest('[data-line]');
      if (lineSpan && textEl.contains(lineSpan)) return lineSpan;
    }
    const spans = textEl.querySelectorAll('[data-line]');
    for (let i = 0; i < spans.length; i++) {
      const rect = spans[i].getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return spans[i];
      if (clientY < rect.top) return spans[i];
    }
    if (spans.length) return spans[spans.length - 1];
    return null;
  }

  function getCellFromMouseEvent(e) {
    const lineSpan = e.target && e.target.closest ? e.target.closest('[data-line]') : null;
    const lineSpanAtPoint = getLineSpanAt(e.clientX, e.clientY);
    const span = lineSpan || lineSpanAtPoint;
    if (!span) return null;
    const r = parseInt(span.dataset.line, 10);
    if (Number.isNaN(r) || r < 0 || r >= lines.length) return null;
    const ln = lines[r] || '';
    const lineRect = span.getBoundingClientRect();
    const offsetX = e.clientX - lineRect.left;
    const measure = document.createElement('span');
    measure.style.cssText = 'visibility:hidden;position:absolute;white-space:pre;font:inherit;';
    span.appendChild(measure);
    let c = 0;
    for (; c <= ln.length; c++) {
      measure.textContent = ln.slice(0, c);
      if (measure.getBoundingClientRect().width >= offsetX) break;
    }
    measure.remove();
    return { row: r, col: Math.min(c, ln.length) };
  }

  function updateCursorPos() {
    if (!cursorEl || !textEl) return;
    const ln = line();
    const lineEl = textEl.querySelector(`[data-line="${row}"]`);
    if (!lineEl) return;
    const wrap = textEl.parentElement;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const before = ln.slice(0, col);
    const measure = document.createElement('span');
    measure.style.cssText = 'visibility:hidden;position:absolute;white-space:pre;font:inherit;';
    measure.textContent = before;
    lineEl.appendChild(measure);
    const rect = measure.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();
    measure.remove();
    const cursorContentTop = lineRect.top - wrapRect.top + wrap.scrollTop;
    const cursorHeight = lineRect.bottom - lineRect.top;
    cursorEl.style.top = cursorContentTop + 'px';
    cursorEl.style.left = (rect.left - wrapRect.left + wrap.scrollLeft) + 'px';
    cursorEl.style.height = cursorHeight + 'px';
    // Keep cursor in view: auto-scroll when cursor goes off screen
    if (cursorContentTop < wrap.scrollTop) {
      wrap.scrollTop = cursorContentTop;
    } else if (cursorContentTop + cursorHeight > wrap.scrollTop + wrap.clientHeight) {
      wrap.scrollTop = cursorContentTop + cursorHeight - wrap.clientHeight;
    }
  }

  function wordCount() {
    const text = getFullText().trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }

  function updateStatus() {
    const wc = wordCount();
    const wcEl = $('ws-wordcount');
    if (wcEl) wcEl.textContent = wc === 1 ? '1 word' : wc + ' words';
    updateWindowTitle();
  }

  function doClearForNew() {
    currentFilePath = null;
    setFullText('');
  }

  function updateWindowTitle() {
    const basename = currentFilePath ? currentFilePath.replace(/^.*[/\\]/, '') : '';
    const displayName = basename || 'Untitled';
    if (typeof document !== 'undefined' && document.title !== undefined) {
      const titleName = basename ? basename + ' – Quill' : 'Quill';
      document.title = dirty ? '• ' + titleName : titleName;
    }
    const docTitleEl = $('ws-doc-title');
    if (docTitleEl) {
      docTitleEl.textContent = dirty ? '• ' + displayName : displayName;
    }
  }

  // ----- Last file (restore on startup) -----
  const LAST_FILE_KEY = 'quill-last-file';

  function getLastFile() {
    try {
      const raw = localStorage.getItem(LAST_FILE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o.path !== 'string') return null;
      return {
        path: o.path,
        row: typeof o.row === 'number' ? o.row : 0,
        col: typeof o.col === 'number' ? o.col : 0
      };
    } catch (_) {
      return null;
    }
  }

  function saveLastFile() {
    if (!currentFilePath) return;
    try {
      localStorage.setItem(LAST_FILE_KEY, JSON.stringify({
        path: currentFilePath,
        row,
        col
      }));
    } catch (_) {}
  }

  async function openFileByPath(path, restoreRow, restoreCol) {
    if (typeof window.__TAURI__ === 'undefined' || !window.__TAURI__.core || typeof window.__TAURI__.core.invoke !== 'function') {
      return;
    }
    try {
      const result = await window.__TAURI__.core.invoke('open_file_by_path', { path });
      setFullText(result.content);
      currentFilePath = result.path;
      dirty = false;
      updateWindowTitle();
      if (typeof restoreRow === 'number' && typeof restoreCol === 'number') {
        setCursor(restoreRow, restoreCol);
      }
    } catch (err) {
      if (err && String(err).toLowerCase() !== 'cancelled') {
        console.error(err);
      }
    }
  }

  async function restoreLastFile() {
    const last = getLastFile();
    if (!last || !last.path) return;
    if (typeof window.__TAURI__ === 'undefined' || !window.__TAURI__.core || typeof window.__TAURI__.core.invoke !== 'function') {
      return;
    }
    await openFileByPath(last.path, last.row, last.col);
  }

  async function doOpenFile() {
    if (typeof window.__TAURI__ === 'undefined' || !window.__TAURI__.core || typeof window.__TAURI__.core.invoke !== 'function') {
      return;
    }
    try {
      const result = await window.__TAURI__.core.invoke('open_file');
      setFullText(result.content);
      currentFilePath = result.path;
      dirty = false;
      updateWindowTitle();
    } catch (err) {
      if (err && String(err).toLowerCase() !== 'cancelled') {
        console.error(err);
      }
    }
  }

  async function openFile() {
    if (!dirty) {
      await doOpenFile();
      return;
    }
    const dialog = $('ws-open-dialog');
    if (!dialog) return;
    dialog.setAttribute('aria-hidden', 'false');
    const buttons = dialog.querySelectorAll('button[data-choice]');
    if (buttons.length) buttons[0].focus();
    const choice = await new Promise((resolve) => {
      const finish = (c) => {
        dialog.setAttribute('aria-hidden', 'true');
        document.removeEventListener('click', clickHandler);
        document.removeEventListener('keydown', keyHandler, true);
        resolve(c);
      };
      const clickHandler = (e) => {
        const btn = e.target.closest('[data-choice]');
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          finish(btn.dataset.choice);
          return;
        }
        if (e.target === dialog) {
          e.preventDefault();
          finish('cancel');
        }
      };
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish('cancel');
          return;
        }
        if (e.key === 'Enter') {
          const focused = dialog.querySelector('button[data-choice]:focus');
          if (focused) {
            e.preventDefault();
            finish(focused.dataset.choice);
          }
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
          const idx = Array.from(buttons).indexOf(document.activeElement);
          if (idx !== -1) {
            e.preventDefault();
            e.stopPropagation();
            buttons[(idx - 1 + buttons.length) % buttons.length].focus();
          }
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') {
          const idx = Array.from(buttons).indexOf(document.activeElement);
          if (idx !== -1) {
            e.preventDefault();
            e.stopPropagation();
            buttons[(idx + 1) % buttons.length].focus();
          }
        }
      };
      document.addEventListener('click', clickHandler);
      document.addEventListener('keydown', keyHandler, true);
    });
    if (choice === 'discard') {
      await doOpenFile();
    }
  }

  async function saveFile() {
    if (typeof window.__TAURI__ === 'undefined' || !window.__TAURI__.core || typeof window.__TAURI__.core.invoke !== 'function') {
      return;
    }
    if (currentFilePath) {
      try {
        await window.__TAURI__.core.invoke('save_file', { path: currentFilePath, content: getFullText() });
        dirty = false;
        updateWindowTitle();
      } catch (err) {
        console.error(err);
        dirty = true;
        updateWindowTitle();
        alert('Save failed: ' + (err && err.toString ? err.toString() : String(err)));
      }
      return;
    }
    await saveFileAs();
  }

  async function saveFileAs() {
    if (typeof window.__TAURI__ === 'undefined' || !window.__TAURI__.core || typeof window.__TAURI__.core.invoke !== 'function') {
      return;
    }
    try {
      const path = await window.__TAURI__.core.invoke('save_file_as', { content: getFullText() });
      currentFilePath = path;
      dirty = false;
      updateWindowTitle();
    } catch (err) {
      if (err && String(err).toLowerCase() !== 'cancelled') {
        console.error(err);
        alert('Save As failed: ' + (err && err.toString ? err.toString() : String(err)));
      }
    }
  }

  async function newDocument() {
    if (!dirty) {
      doClearForNew();
      return;
    }
    const dialog = $('ws-new-dialog');
    if (!dialog) return;
    dialog.setAttribute('aria-hidden', 'false');
    const buttons = dialog.querySelectorAll('button[data-choice]');
    if (buttons.length) buttons[0].focus();
    const choice = await new Promise((resolve) => {
      const finish = (c) => {
        dialog.setAttribute('aria-hidden', 'true');
        document.removeEventListener('click', clickHandler);
        document.removeEventListener('keydown', keyHandler, true);
        resolve(c);
      };
      const clickHandler = (e) => {
        const btn = e.target.closest('[data-choice]');
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          finish(btn.dataset.choice);
          return;
        }
        if (e.target === dialog) {
          e.preventDefault();
          finish('cancel');
        }
      };
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish('cancel');
          return;
        }
        if (e.key === 'Enter') {
          const focused = dialog.querySelector('button[data-choice]:focus');
          if (focused) {
            e.preventDefault();
            finish(focused.dataset.choice);
          }
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
          const idx = Array.from(buttons).indexOf(document.activeElement);
          if (idx !== -1) {
            e.preventDefault();
            e.stopPropagation();
            buttons[(idx - 1 + buttons.length) % buttons.length].focus();
          }
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') {
          const idx = Array.from(buttons).indexOf(document.activeElement);
          if (idx !== -1) {
            e.preventDefault();
            e.stopPropagation();
            buttons[(idx + 1) % buttons.length].focus();
          }
        }
      };
      document.addEventListener('click', clickHandler);
      document.addEventListener('keydown', keyHandler, true);
    });
    if (choice === 'discard') {
      doClearForNew();
    }
  }

  /* Find break point for word wrap: last space before COLS, or COLS if no space (long word) */
  function wrapBreakPoint(str) {
    if (str.length <= COLS) return -1;
    const lastSpace = str.lastIndexOf(' ', COLS);
    return lastSpace > 0 ? lastSpace : COLS;
  }

  function doInsertChar(ch) {
    const ln = line();
    setLine(row, ln.slice(0, col) + ch + ln.slice(col));
    col++;
    let current = lines[row] || '';
    while (current.length > COLS) {
      const br = wrapBreakPoint(current);
      const overflowRaw = current.slice(br);
      const overflow = overflowRaw.trimStart();
      const leadingSpaces = overflowRaw.length - overflow.length;
      setLine(row, current.slice(0, br).trimEnd());
      lines.splice(row + 1, 0, overflow);
      row++;
      if (col > br) {
        col = Math.max(0, Math.min(col - br - leadingSpaces, overflow.length));
      }
      current = lines[row] || '';
    }
    dirty = true;
  }

  function insertChar(ch) {
    saveStateForUndo();
    doInsertChar(ch);
    clearSelection();
    render();
  }

  function doNewLine() {
    const ln = line();
    const rest = ln.slice(col);
    setLine(row, ln.slice(0, col));
    lines.splice(row + 1, 0, rest);
    row++;
    col = 0;
    dirty = true;
  }

  function deleteCharForward() {
    saveStateForUndo();
    const ln = line();
    if (col < ln.length) {
      setLine(row, ln.slice(0, col) + ln.slice(col + 1));
      dirty = true;
    } else if (row < lines.length - 1) {
      setLine(row, ln + (lines[row + 1] || ''));
      lines.splice(row + 1, 1);
      dirty = true;
    }
    render();
  }

  function deleteCharBackward() {
    saveStateForUndo();
    if (col > 0) {
      const ln = line();
      setLine(row, ln.slice(0, col - 1) + ln.slice(col));
      col--;
      dirty = true;
    } else if (row > 0) {
      const prevLen = (lines[row - 1] || '').length;
      setLine(row - 1, (lines[row - 1] || '') + line());
      lines.splice(row, 1);
      row--;
      col = prevLen;
      dirty = true;
    }
    render();
  }

  function newLine() {
    saveStateForUndo();
    doNewLine();
    clearSelection();
    render();
  }

  function moveLeft(extend) {
    if (!extend) clearSelection();
    if (col > 0) col--;
    else if (row > 0) {
      row--;
      col = (lines[row] || '').length;
    }
    render();
  }

  function moveRight(extend) {
    if (!extend) clearSelection();
    const ln = line();
    if (col < ln.length) col++;
    else if (row < lines.length - 1) {
      row++;
      col = 0;
    }
    render();
  }

  function moveUp(extend) {
    if (!extend) clearSelection();
    if (row > 0) {
      row--;
      col = clampCol(row, col);
      render();
    }
  }

  function moveDown(extend) {
    if (!extend) clearSelection();
    if (row < lines.length - 1) {
      row++;
      col = clampCol(row, col);
      render();
    }
  }

  function lineStart(extend) {
    if (!extend) clearSelection();
    col = 0;
    render();
  }

  function lineEnd(extend) {
    if (!extend) clearSelection();
    col = (line()).length;
    render();
  }

  function docStart(extend) {
    if (!extend) clearSelection();
    row = 0;
    col = 0;
    render();
  }

  function docEnd(extend) {
    if (!extend) clearSelection();
    row = lines.length - 1;
    col = (line()).length;
    render();
  }

  // ----- File operations -----
  function getFullText() {
    return lines.join('\n');
  }

  function wrapLongLines(lineArray) {
    const out = [];
    for (const ln of lineArray) {
      if (ln.length === 0) {
        out.push('');
      } else {
        let rest = ln;
        while (rest.length > 0) {
          if (rest.length <= COLS) {
            out.push(rest);
            break;
          }
          const br = rest.lastIndexOf(' ', COLS);
          const cut = br > 0 ? br : COLS;
          out.push(rest.slice(0, cut).trimEnd());
          rest = rest.slice(cut).trimStart();
        }
      }
    }
    return out.length ? out : [''];
  }

  /** Map character offset in unwrapped text (with \n) to (row, col) in wrapped line array. */
  function unwrappedOffsetToWrappedPos(unwrappedLines, targetOffset) {
    if (!unwrappedLines.length) return { row: 0, col: 0 };
    const totalLen = unwrappedLines.reduce((acc, ln) => acc + ln.length, 0) + Math.max(0, unwrappedLines.length - 1);
    const clamped = Math.min(targetOffset, totalLen);
    let o = 0;
    let unwrappedLineIdx = 0;
    let unwrappedCol = 0;
    for (let r = 0; r < unwrappedLines.length; r++) {
      const len = unwrappedLines[r].length;
      if (clamped <= o + len) {
        unwrappedLineIdx = r;
        unwrappedCol = Math.min(clamped - o, len);
        break;
      }
      o += len + 1;
    }
    if (clamped >= totalLen) {
      unwrappedLineIdx = unwrappedLines.length - 1;
      unwrappedCol = (unwrappedLines[unwrappedLineIdx] || '').length;
    }
    let outRow = 0;
    for (let i = 0; i < unwrappedLines.length; i++) {
      const wlines = wrapLongLines([unwrappedLines[i]]);
      if (i === unwrappedLineIdx) {
        let colLeft = unwrappedCol;
        for (let w = 0; w < wlines.length; w++) {
          if (colLeft <= wlines[w].length) return { row: outRow + w, col: colLeft };
          colLeft -= wlines[w].length;
        }
        return { row: outRow + wlines.length - 1, col: (wlines[wlines.length - 1] || '').length };
      }
      outRow += wlines.length;
    }
    return { row: outRow, col: 0 };
  }

  function setFullText(s) {
    undoHistory = [];
    redoStack = [];
    const raw = s.split('\n');
    lines = wrapLongLines(raw);
    if (lines.length === 0) lines = [''];
    row = 0;
    col = 0;
    anchorRow = 0;
    anchorCol = 0;
    dirty = false;
    render();
  }

  function setCursor(r, c) {
    row = Math.max(0, Math.min(r, lines.length - 1));
    col = clampCol(row, c);
    anchorRow = row;
    anchorCol = col;
    render();
  }

  function doExit() {
    if (typeof window.__TAURI__ !== 'undefined' && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
      window.__TAURI__.core.invoke('exit_app').catch(() => {});
    } else {
      window.close();
    }
  }

  async function quit() {
    if (!dirty) {
      doExit();
      return;
    }
    const dialog = $('ws-exit-dialog');
    if (!dialog) return;
    dialog.setAttribute('aria-hidden', 'false');
    const buttons = dialog.querySelectorAll('button[data-exit-choice]');
    if (buttons.length) buttons[0].focus();
    const choice = await new Promise((resolve) => {
      const finish = (c) => {
        dialog.setAttribute('aria-hidden', 'true');
        document.removeEventListener('click', clickHandler);
        document.removeEventListener('keydown', keyHandler, true);
        resolve(c);
      };
      const clickHandler = (e) => {
        const btn = e.target.closest('[data-exit-choice]');
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          finish(btn.dataset.exitChoice);
          return;
        }
        if (e.target === dialog) {
          e.preventDefault();
          finish('cancel');
        }
      };
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish('cancel');
          return;
        }
        if (e.key === 'Enter') {
          const focused = dialog.querySelector('button[data-exit-choice]:focus');
          if (focused) {
            e.preventDefault();
            finish(focused.dataset.exitChoice);
          }
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
          const idx = Array.from(buttons).indexOf(document.activeElement);
          if (idx !== -1) {
            e.preventDefault();
            e.stopPropagation();
            buttons[(idx - 1 + buttons.length) % buttons.length].focus();
          }
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') {
          const idx = Array.from(buttons).indexOf(document.activeElement);
          if (idx !== -1) {
            e.preventDefault();
            e.stopPropagation();
            buttons[(idx + 1) % buttons.length].focus();
          }
        }
      };
      document.addEventListener('click', clickHandler);
      document.addEventListener('keydown', keyHandler, true);
    });
    if (choice === 'discard') {
      doExit();
    }
  }

  // ----- Find / Replace -----
  function offsetFor(r, c) {
    let off = 0;
    for (let i = 0; i < r; i++) off += (lines[i] || '').length + 1;
    return off + c;
  }

  function posForOffset(offset) {
    let off = 0;
    for (let r = 0; r < lines.length; r++) {
      const len = (lines[r] || '').length;
      const lineEnd = off + len;
      if (offset <= lineEnd) return { row: r, col: Math.min(offset - off, len) };
      off = lineEnd + 1;
    }
    const last = lines.length - 1;
    return { row: last, col: (lines[last] || '').length };
  }

  function findNext(forward) {
    const findInput = $('ws-find-input');
    const caseCheck = $('ws-find-case');
    const query = findInput ? findInput.value : '';
    if (!query) return false;
    const fullText = getFullText();
    const caseSensitive = caseCheck && caseCheck.checked;
    const searchText = caseSensitive ? fullText : fullText.toLowerCase();
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    const curOffset = offsetFor(row, col);
    let start = -1;
    if (forward) {
      const idx = searchText.indexOf(searchQuery, curOffset);
      if (idx === -1 && curOffset > 0) {
        const wrap = searchText.indexOf(searchQuery, 0);
        if (wrap !== -1) start = wrap;
      } else if (idx !== -1) start = idx;
    } else {
      const before = searchText.slice(0, curOffset);
      let idx = before.lastIndexOf(searchQuery);
      if (idx === -1 && curOffset < fullText.length) {
        const after = searchText.slice(curOffset);
        const wrapIdx = after.lastIndexOf(searchQuery);
        if (wrapIdx !== -1) idx = curOffset + wrapIdx;
      }
      if (idx !== -1) start = idx;
    }
    if (start === -1) return false;
    const end = start + query.length;
    const p0 = posForOffset(start);
    const p1 = posForOffset(end);
    anchorRow = p0.row;
    anchorCol = p0.col;
    row = p1.row;
    col = p1.col;
    render();
    const lineEl = textEl.querySelector(`[data-line="${p0.row}"]`);
    if (lineEl) lineEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return true;
  }

  function replaceOne() {
    const findInput = $('ws-find-input');
    const replaceInput = $('ws-replace-input');
    const caseCheck = $('ws-find-case');
    const query = findInput ? findInput.value : '';
    const replacement = replaceInput ? replaceInput.value : '';
    if (!query) return false;
    const selected = getSelectedText();
    const caseSensitive = caseCheck && caseCheck.checked;
    const matches = caseSensitive
      ? selected === query
      : selected.toLowerCase() === query.toLowerCase();
    if (!matches) return findNext(true);
    saveStateForUndo();
    deleteSelection();
    for (let i = 0; i < replacement.length; i++) {
      if (replacement[i] === '\n') doNewLine();
      else doInsertChar(replacement[i]);
    }
    clearSelection();
    dirty = true;
    render();
    return findNext(true);
  }

  function replaceAll() {
    const findInput = $('ws-find-input');
    const replaceInput = $('ws-replace-input');
    const caseCheck = $('ws-find-case');
    const query = findInput ? findInput.value : '';
    const replacement = replaceInput ? replaceInput.value : '';
    if (!query) return;
    const fullText = getFullText();
    const caseSensitive = caseCheck && caseCheck.checked;
    const searchText = caseSensitive ? fullText : fullText.toLowerCase();
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    let count = 0;
    let idx = 0;
    const parts = [];
    while (true) {
      const found = searchText.indexOf(searchQuery, idx);
      if (found === -1) break;
      parts.push(fullText.slice(idx, found));
      parts.push(replacement);
      idx = found + query.length;
      count++;
    }
    if (count === 0) return;
    parts.push(fullText.slice(idx));
    saveStateForUndo();
    setFullText(parts.join(''));
    dirty = true;
  }

  function openFindDialog() {
    const dialog = $('ws-find-dialog');
    const findInput = $('ws-find-input');
    if (!dialog || !findInput) return;
    dialog.setAttribute('aria-hidden', 'false');
    findInput.focus();
    findInput.select();
  }

  function closeFindDialog() {
    const dialog = $('ws-find-dialog');
    if (dialog) dialog.setAttribute('aria-hidden', 'true');
    if (textEl) textEl.focus();
  }

  // ----- Zoom -----
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.125;
  const ZOOM_STORAGE_KEY = 'quill-zoom';
  let zoom = parseFloat(localStorage.getItem(ZOOM_STORAGE_KEY) || '1', 10);
  if (Number.isNaN(zoom) || zoom < ZOOM_MIN || zoom > ZOOM_MAX) zoom = 1;

  function applyZoom() {
    document.documentElement.style.setProperty('--ws-zoom', String(zoom));
    localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
    const pct = Math.round(zoom * 100);
    const zoomVal = $('ws-zoom-value');
    if (zoomVal) zoomVal.textContent = pct + '%';
  }
  applyZoom();

  function zoomIn() {
    if (zoom < ZOOM_MAX) {
      zoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP);
      applyZoom();
    }
  }
  function zoomOut() {
    if (zoom > ZOOM_MIN) {
      zoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP);
      applyZoom();
    }
  }
  function zoomReset() {
    zoom = 1;
    applyZoom();
  }

  // ----- Keyboard -----
  const keyHandler = (e) => {
    const key = e.key;
    const ctrl = e.ctrlKey;
    const shift = e.shiftKey;

    // Undo / Redo
    if (ctrl && key === 'z' && !shift) {
      e.preventDefault();
      undo();
      return;
    }
    if (ctrl && (key === 'y' || (key === 'z' && shift))) {
      e.preventDefault();
      redo();
      return;
    }
    // Menu shortcuts (^X = Ctrl+X, M-X = Alt+X)
    if (ctrl && key === 'n' && !shift) {
      e.preventDefault();
      newDocument();
      return;
    }
    if (ctrl && key === 'f') {
      e.preventDefault();
      openFindDialog();
      return;
    }
    if (ctrl && key === 'o') {
      e.preventDefault();
      openFile();
      return;
    }
    if (ctrl && key === 's') {
      e.preventDefault();
      saveFile();
      return;
    }
    if (ctrl && shift && key === 'S') {
      e.preventDefault();
      saveFileAs();
      return;
    }
    if (e.altKey && !ctrl && (key === 'q' || key === 'Q')) {
      e.preventDefault();
      quit();
      return;
    }
    // Zoom in: Ctrl+= or Ctrl++
    if (ctrl && (key === '=' || key === '+')) {
      e.preventDefault();
      zoomIn();
      return;
    }
    if (ctrl && key === '-') {
      e.preventDefault();
      zoomOut();
      return;
    }
    if (ctrl && key === '0') {
      e.preventDefault();
      zoomReset();
      return;
    }

    if (ctrl && key === 'a') {
      e.preventDefault();
      selectAll();
      render();
      return;
    }
    if (ctrl && key === 'c') {
      e.preventDefault();
      copyToClipboard();
      return;
    }
    if (ctrl && key === 'x') {
      e.preventDefault();
      cutToClipboard();
      return;
    }
    if (ctrl && key === 'v') {
      e.preventDefault();
      pasteFromClipboard();
      return;
    }

    switch (key) {
      case 'Backspace':
        e.preventDefault();
        if (hasSelection()) {
          saveStateForUndo();
          deleteSelection();
          render();
        } else {
          deleteCharBackward();
        }
        return;
      case 'Delete':
        e.preventDefault();
        if (hasSelection()) {
          saveStateForUndo();
          deleteSelection();
          render();
        } else {
          deleteCharForward();
        }
        return;
      case 'Enter':
        e.preventDefault();
        if (hasSelection()) {
          saveStateForUndo();
          deleteSelection();
          doNewLine();
          clearSelection();
          render();
        } else {
          newLine();
        }
        return;
      case 'Tab':
        e.preventDefault();
        if (hasSelection()) {
          saveStateForUndo();
          deleteSelection();
        }
        const spaces = TAB - (col % TAB);
        insertChar(' '.repeat(spaces));
        return;
      case 'ArrowLeft':
        e.preventDefault();
        moveLeft(shift);
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveRight(shift);
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveUp(shift);
        return;
      case 'ArrowDown':
        e.preventDefault();
        moveDown(shift);
        return;
      case 'Home':
        e.preventDefault();
        if (ctrl) docStart(shift);
        else lineStart(shift);
        return;
      case 'End':
        e.preventDefault();
        if (ctrl) docEnd(shift);
        else lineEnd(shift);
        return;
      case 'PageUp':
        e.preventDefault();
        if (!shift) clearSelection();
        for (let i = 0; i < 20; i++) moveUp(false);
        render();
        return;
      case 'PageDown':
        e.preventDefault();
        if (!shift) clearSelection();
        for (let i = 0; i < 20; i++) moveDown(false);
        render();
        return;
    }

    if (key.length === 1 && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (hasSelection()) {
        saveStateForUndo();
        deleteSelection();
        doInsertChar(key);
        clearSelection();
        render();
      } else {
        insertChar(key);
      }
    }
  };

  // Global shortcuts: work even when editor doesn't have focus (capture phase)
  const MENU_ORDER = ['file', 'edit', 'view', 'help'];
  let menuBarFocused = false;
  let focusedMenuIndex = 0;

  function getOpenMenuIndex() {
    for (let i = 0; i < MENU_ORDER.length; i++) {
      const panel = $('ws-dropdown-' + MENU_ORDER[i]);
      if (panel && !panel.hidden) return i;
    }
    return -1;
  }

  function clearMenuBarKeyboardFocus() {
    menuBarFocused = false;
    document.querySelectorAll('.ws-menu-item').forEach((el) => el.classList.remove('ws-menu-item-keyboard-focus'));
  }

  function setMenuBarHighlight(index) {
    focusedMenuIndex = index;
    document.querySelectorAll('.ws-menu-item').forEach((el) => {
      el.classList.toggle('ws-menu-item-keyboard-focus', el.dataset.menu === MENU_ORDER[index]);
    });
  }

  function globalShortcutHandler(e) {
    const key = e.key;
    const ctrl = e.ctrlKey;
    const shift = e.shiftKey;

    // Escape: return focus to editor, close any menu (unless a modal dialog is open)
    if (key === 'Escape') {
      const fontDialog = $('ws-font-dialog');
      const themeDialog = $('ws-theme-dialog');
      const newDialog = $('ws-new-dialog');
      const exitDialog = $('ws-exit-dialog');
      const openDialog = $('ws-open-dialog');
      const findDialog = $('ws-find-dialog');
      const aboutDialog = $('ws-about-dialog');
      if (fontDialog && fontDialog.getAttribute('aria-hidden') === 'false') return;
      if (themeDialog && themeDialog.getAttribute('aria-hidden') === 'false') return;
      if (aboutDialog && aboutDialog.getAttribute('aria-hidden') === 'false') {
        closeAboutDialog();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (newDialog && newDialog.getAttribute('aria-hidden') === 'false') return;
      if (exitDialog && exitDialog.getAttribute('aria-hidden') === 'false') return;
      if (openDialog && openDialog.getAttribute('aria-hidden') === 'false') return;
      if (findDialog && findDialog.getAttribute('aria-hidden') === 'false') {
        closeFindDialog();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      closeAllMenus();
      clearMenuBarKeyboardFocus();
      textEl.focus();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // When a modal is open, don't handle menu/dropdown keys so the modal can use arrow keys and Enter
    const newDialogOpen = $('ws-new-dialog') && $('ws-new-dialog').getAttribute('aria-hidden') === 'false';
    const exitDialogOpen = $('ws-exit-dialog') && $('ws-exit-dialog').getAttribute('aria-hidden') === 'false';
    const openDialogOpen = $('ws-open-dialog') && $('ws-open-dialog').getAttribute('aria-hidden') === 'false';
    const fontDialogOpen = $('ws-font-dialog') && $('ws-font-dialog').getAttribute('aria-hidden') === 'false';
    const themeDialogOpen = $('ws-theme-dialog') && $('ws-theme-dialog').getAttribute('aria-hidden') === 'false';
    const findDialogOpen = $('ws-find-dialog') && $('ws-find-dialog').getAttribute('aria-hidden') === 'false';
    const aboutDialogOpen = $('ws-about-dialog') && $('ws-about-dialog').getAttribute('aria-hidden') === 'false';
    const modalOpen = newDialogOpen || exitDialogOpen || openDialogOpen || fontDialogOpen || themeDialogOpen || findDialogOpen || aboutDialogOpen;

    // When a dropdown is open: Arrow Up/Down navigate items; Left/Right switch menus; Enter executes
    if (!modalOpen) {
    const openIdx = getOpenMenuIndex();
    if (openIdx >= 0) {
      if (key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        const prevMenuIdx = (openIdx - 1 + MENU_ORDER.length) % MENU_ORDER.length;
        openMenu(MENU_ORDER[prevMenuIdx]);
        const panel = $('ws-dropdown-' + MENU_ORDER[prevMenuIdx]);
        const firstBtn = panel && panel.querySelector('button');
        if (firstBtn) firstBtn.focus();
        return;
      }
      if (key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        const nextMenuIdx = (openIdx + 1) % MENU_ORDER.length;
        openMenu(MENU_ORDER[nextMenuIdx]);
        const panel = $('ws-dropdown-' + MENU_ORDER[nextMenuIdx]);
        const firstBtn = panel && panel.querySelector('button');
        if (firstBtn) firstBtn.focus();
        return;
      }
      const panel = $('ws-dropdown-' + MENU_ORDER[openIdx]);
      const buttons = panel ? Array.from(panel.querySelectorAll('button')) : [];
      if (buttons.length > 0) {
        if (key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          const currentIdx = buttons.indexOf(document.activeElement);
          const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % buttons.length;
          buttons[nextIdx].focus();
          return;
        }
        if (key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          const currentIdx = buttons.indexOf(document.activeElement);
          const prevIdx = currentIdx <= 0 ? buttons.length - 1 : currentIdx - 1;
          buttons[prevIdx].focus();
          return;
        }
        if (key === 'Enter') {
          const focused = document.activeElement;
          if (focused && buttons.indexOf(focused) !== -1) {
            e.preventDefault();
            e.stopPropagation();
            focused.click();
          }
          return;
        }
      }
    }
    }

    // Alt (by itself): highlight File menu for keyboard navigation
    if (key === 'Alt' && !e.repeat && !ctrl) {
      if (!menuBarFocused && getOpenMenuIndex() === -1) {
        menuBarFocused = true;
        setMenuBarHighlight(0);
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    // When menu bar is highlighted: Arrow Left/Right move between menus; Down, Up, or Enter opens dropdown
    if (!modalOpen && menuBarFocused) {
      if (key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        setMenuBarHighlight((focusedMenuIndex - 1 + MENU_ORDER.length) % MENU_ORDER.length);
        return;
      }
      if (key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        setMenuBarHighlight((focusedMenuIndex + 1) % MENU_ORDER.length);
        return;
      }
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const menuId = MENU_ORDER[focusedMenuIndex];
        openMenu(menuId);
        const panel = $('ws-dropdown-' + menuId);
        const firstBtn = panel && panel.querySelector('button');
        if (firstBtn) firstBtn.focus();
        clearMenuBarKeyboardFocus();
        return;
      }
    }

    if (ctrl && key === 'n' && !shift) {
      e.preventDefault();
      e.stopPropagation();
      newDocument();
      return;
    }
    if (ctrl && key === 'f') {
      e.preventDefault();
      e.stopPropagation();
      openFindDialog();
      return;
    }
    if (ctrl && key === 'o') {
      e.preventDefault();
      e.stopPropagation();
      openFile();
      return;
    }
    if (ctrl && key === 's') {
      e.preventDefault();
      e.stopPropagation();
      saveFile();
      return;
    }
    if (ctrl && shift && key === 'S') {
      e.preventDefault();
      e.stopPropagation();
      saveFileAs();
      return;
    }
    if (e.altKey && !ctrl && (key === 'q' || key === 'Q')) {
      e.preventDefault();
      e.stopPropagation();
      const k = key.toLowerCase();
      if (k === 'q') quit();
      return;
    }
    if (ctrl && (key === '=' || key === '+')) {
      e.preventDefault();
      e.stopPropagation();
      zoomIn();
      return;
    }
    if (ctrl && key === '-') {
      e.preventDefault();
      e.stopPropagation();
      zoomOut();
      return;
    }
    if (ctrl && key === '0') {
      e.preventDefault();
      e.stopPropagation();
      zoomReset();
      return;
    }
    if (ctrl && key === 'p') {
      e.preventDefault();
      e.stopPropagation();
      togglePreview();
      return;
    }
    if (ctrl && key === 'z' && !shift) {
      e.preventDefault();
      e.stopPropagation();
      undo();
      return;
    }
    if (ctrl && (key === 'y' || (key === 'z' && shift))) {
      e.preventDefault();
      e.stopPropagation();
      redo();
      return;
    }
    if (ctrl && key === 'a') {
      e.preventDefault();
      e.stopPropagation();
      selectAll();
      render();
      return;
    }
    if (ctrl && key === 'c') {
      e.preventDefault();
      e.stopPropagation();
      copyToClipboard();
      return;
    }
    if (ctrl && key === 'x') {
      e.preventDefault();
      e.stopPropagation();
      cutToClipboard();
      return;
    }
    if (ctrl && key === 'v') {
      e.preventDefault();
      e.stopPropagation();
      pasteFromClipboard();
      return;
    }
  }
  document.addEventListener('keydown', globalShortcutHandler, true);

  textEl.addEventListener('keydown', keyHandler);
  textEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const cell = getCellFromMouseEvent(e);
    if (cell == null) return;
    anchorRow = row = cell.row;
    anchorCol = col = cell.col;
    render();
    const onMouseMove = (e2) => {
      const c = getCellFromMouseEvent(e2);
      if (c != null && (c.row !== row || c.col !== col)) {
        row = c.row;
        col = c.col;
        render();
      }
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      textEl.focus();
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  textEl.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    textEl.focus();
  });

  textEl.addEventListener('click', () => {
    textEl.focus();
  });

  // Prevent context menu so right-click doesn't break focus
  textEl.addEventListener('contextmenu', (e) => e.preventDefault());

  // Cursor position when scrolling
  const editorWrap = textEl && textEl.parentElement;
  if (editorWrap) {
    editorWrap.addEventListener('scroll', () => {
      if (textEl && textEl.querySelector(`[data-line="${row}"]`)) updateCursorPos();
    });
  }

  // ----- Theme -----
  const THEME_STORAGE_KEY = 'quill-theme';
  const DEFAULT_THEME = 'dark';

  function applyTheme(themeId) {
    const id = themeId && themeId !== DEFAULT_THEME ? themeId : '';
    if (id) {
      document.documentElement.setAttribute('data-theme', id);
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem(THEME_STORAGE_KEY);
    }
  }

  function openThemeDialog() {
    const dialog = $('ws-theme-dialog');
    const select = $('ws-theme-select');
    if (!dialog || !select) return;
    const current = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
    select.value = current;
    dialog.setAttribute('aria-hidden', 'false');
  }

  function closeThemeDialog() {
    const dialog = $('ws-theme-dialog');
    if (dialog) dialog.setAttribute('aria-hidden', 'true');
  }

  (function initThemeDialog() {
    const dialog = $('ws-theme-dialog');
    const select = $('ws-theme-select');
    if (!dialog || !select) return;
    const applyBtn = dialog.querySelector('[data-theme-apply]');
    const cancelBtn = dialog.querySelector('[data-theme-cancel]');
    if (applyBtn) applyBtn.addEventListener('click', () => {
      applyTheme(select.value);
      closeThemeDialog();
    });
    if (cancelBtn) cancelBtn.addEventListener('click', closeThemeDialog);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeThemeDialog(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dialog.getAttribute('aria-hidden') === 'false') {
        closeThemeDialog();
      }
    });
  })();

  // ----- Font -----
  const FONT_STORAGE_KEY = 'quill-font';
  const DEFAULT_FONT = 'IBM Plex Mono, Liberation Mono, Courier New, monospace';

  function applyFont(value) {
    document.documentElement.style.setProperty('--ws-font', value || DEFAULT_FONT);
    if (value) localStorage.setItem(FONT_STORAGE_KEY, value);
    else localStorage.removeItem(FONT_STORAGE_KEY);
  }

  function openFontDialog() {
    const dialog = $('ws-font-dialog');
    const select = $('ws-font-select');
    if (!dialog || !select) return;
    const current = localStorage.getItem(FONT_STORAGE_KEY) || DEFAULT_FONT;
    select.value = current;
    dialog.setAttribute('aria-hidden', 'false');
  }

  function closeFontDialog() {
    const dialog = $('ws-font-dialog');
    if (dialog) dialog.setAttribute('aria-hidden', 'true');
  }

  (function initFontDialog() {
    const dialog = $('ws-font-dialog');
    const select = $('ws-font-select');
    if (!dialog || !select) return;
    const applyBtn = dialog.querySelector('[data-font-apply]');
    const cancelBtn = dialog.querySelector('[data-font-cancel]');
    if (applyBtn) applyBtn.addEventListener('click', () => {
      applyFont(select.value);
      closeFontDialog();
    });
    if (cancelBtn) cancelBtn.addEventListener('click', closeFontDialog);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeFontDialog(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dialog.getAttribute('aria-hidden') === 'false') {
        closeFontDialog();
      }
    });
  })();

  // ----- About -----
  const APP_VERSION_FALLBACK = '0.1.0';

  function openAboutDialog() {
    const dialog = $('ws-about-dialog');
    const versionEl = $('ws-about-version');
    if (!dialog || !versionEl) return;
    const setVersion = (name, version) => {
      versionEl.textContent = name + ' ' + version;
    };
    if (typeof window.__TAURI__ !== 'undefined' && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
      window.__TAURI__.core.invoke('get_app_info').then((info) => {
        setVersion(info.name, info.version);
      }).catch(() => {
        setVersion('Quill', APP_VERSION_FALLBACK);
      });
    } else {
      setVersion('Quill', APP_VERSION_FALLBACK);
    }
    dialog.setAttribute('aria-hidden', 'false');
    const okBtn = dialog.querySelector('[data-about-ok]');
    if (okBtn) okBtn.focus();
  }

  function closeAboutDialog() {
    const dialog = $('ws-about-dialog');
    if (dialog) dialog.setAttribute('aria-hidden', 'true');
    textEl.focus();
  }

  (function initAboutDialog() {
    const dialog = $('ws-about-dialog');
    if (!dialog) return;
    const okBtn = dialog.querySelector('[data-about-ok]');
    if (okBtn) okBtn.addEventListener('click', closeAboutDialog);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeAboutDialog(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dialog.getAttribute('aria-hidden') === 'false') {
        closeAboutDialog();
      }
    });
  })();

  (function initFindDialog() {
    const dialog = $('ws-find-dialog');
    if (!dialog) return;
    dialog.querySelectorAll('button[data-find]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.find;
        if (action === 'next') findNext(true);
        else if (action === 'prev') findNext(false);
        else if (action === 'replace') replaceOne();
        else if (action === 'replaceAll') replaceAll();
        else if (action === 'close') closeFindDialog();
      });
    });
    const findInput = $('ws-find-input');
    if (findInput) {
      findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          findNext(true);
        }
      });
    }
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeFindDialog(); });
  })();

  // ----- Menu bar & toolbar (Ghostwriter-style point-and-click) -----
  const dropdowns = {
    file: $('ws-dropdown-file'),
    edit: $('ws-dropdown-edit'),
    view: $('ws-dropdown-view'),
    help: $('ws-dropdown-help')
  };

  function closeAllMenus() {
    clearMenuBarKeyboardFocus();
    document.querySelectorAll('.ws-menu-item').forEach((el) => el.setAttribute('aria-expanded', 'false'));
    Object.values(dropdowns).forEach((d) => { if (d) d.hidden = true; });
  }

  function openMenu(menuId) {
    closeAllMenus();
    const item = document.querySelector(`.ws-menu-item[data-menu="${menuId}"]`);
    const panel = dropdowns[menuId];
    const menubar = document.querySelector('.ws-menubar');
    if (item && panel && menubar) {
      item.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      const barRect = menubar.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      panel.style.left = (itemRect.left - barRect.left) + 'px';
      panel.style.top = (itemRect.bottom - barRect.top) + 'px';
    }
  }

  const actionHandlers = {
    open: () => openFile(),
    save: () => saveFile(),
    saveAs: () => saveFileAs(),
    new: () => newDocument(),
    exit: () => quit(),
    undo: () => { undo(); closeAllMenus(); },
    redo: () => { redo(); closeAllMenus(); },
    cut: () => { cutToClipboard(); closeAllMenus(); },
    copy: () => { copyToClipboard(); closeAllMenus(); },
    paste: () => { pasteFromClipboard(); closeAllMenus(); },
    selectAll: () => { selectAll(); render(); closeAllMenus(); },
    find: () => { openFindDialog(); closeAllMenus(); },
    zoomIn: () => zoomIn(),
    zoomOut: () => zoomOut(),
    zoomReset: () => zoomReset(),
    togglePreview: () => { togglePreview(); closeAllMenus(); },
    theme: () => { openThemeDialog(); closeAllMenus(); },
    font: () => { openFontDialog(); closeAllMenus(); },
    about: () => { openAboutDialog(); closeAllMenus(); }
  };

  let menuCloseTimeout = null;
  document.querySelectorAll('.ws-menu-item').forEach((item) => {
    const menu = item.dataset.menu;
    item.addEventListener('mouseenter', () => {
      if (menuCloseTimeout) clearTimeout(menuCloseTimeout);
      menuCloseTimeout = null;
      openMenu(menu);
    });
    item.addEventListener('mouseleave', () => {
      menuCloseTimeout = setTimeout(closeAllMenus, 200);
    });
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const panel = dropdowns[menu];
      if (panel && !panel.hidden) {
        closeAllMenus();
      } else {
        openMenu(menu);
      }
    });
  });
  Object.keys(dropdowns).forEach((menuId) => {
    const panel = dropdowns[menuId];
    if (panel) {
      panel.addEventListener('mouseenter', () => {
        if (menuCloseTimeout) clearTimeout(menuCloseTimeout);
        menuCloseTimeout = null;
      });
      panel.addEventListener('mouseleave', () => {
        menuCloseTimeout = setTimeout(closeAllMenus, 200);
      });
    }
  });

  document.querySelectorAll('.ws-dropdown button[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const fn = actionHandlers[action];
      if (fn) fn();
      // Return focus to the editor unless the action opened a modal (New/Exit),
      // so the modal can keep focus for keyboard navigation (Discard/Cancel).
      if (action !== 'new' && action !== 'exit' && action !== 'open' && action !== 'about') {
        textEl.focus();
      }
    });
  });

  document.querySelectorAll('.ws-toolbtn[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.dataset.action;
      const fn = actionHandlers[action];
      if (fn) fn();
      textEl.focus();
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.ws-menubar') || e.target.closest('.ws-dropdown')) return;
    closeAllMenus();
  });

  // Persist last file (path + cursor) when leaving so we can reopen on next launch
  window.addEventListener('beforeunload', saveLastFile);
  window.addEventListener('pagehide', saveLastFile);

  // Init
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme) applyTheme(savedTheme);
  const savedFont = localStorage.getItem(FONT_STORAGE_KEY);
  if (savedFont) applyFont(savedFont);
  renderRuler();
  render();
  textEl.focus();

  // Restore last file on startup (Tauri only; in browser we can't open by path)
  (async () => {
    await restoreLastFile();
    if (textEl) textEl.focus();
  })();
})();
