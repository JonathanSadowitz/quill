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

  function renderRuler() {
    const left = 1, right = COLS;
    let s = '';
    for (let i = 0; i < right; i++) {
      if (i === 0) s += 'L';
      else if (i === right - 1) s += 'R';
      else if (i > 0 && i % 8 === 0) s += '!';
      else s += '-';
    }
    ruler.textContent = s;
  }

  function render() {
    const frag = document.createDocumentFragment();
    for (let r = 0; r < lines.length; r++) {
      const ln = lines[r] || '';
      const span = document.createElement('span');
      span.textContent = ln;
      span.dataset.line = r;
      frag.appendChild(span);
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
    function inline(s) {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
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
  function getCellFromMouseEvent(e) {
    const lineSpan = e.target.closest('[data-line]');
    if (!lineSpan) return null;
    const r = parseInt(lineSpan.dataset.line, 10);
    if (Number.isNaN(r) || r < 0 || r >= lines.length) return null;
    const ln = lines[r] || '';
    const lineRect = lineSpan.getBoundingClientRect();
    const offsetX = e.clientX - lineRect.left;
    const measure = document.createElement('span');
    measure.style.cssText = 'visibility:hidden;position:absolute;white-space:pre;font:inherit;';
    lineSpan.appendChild(measure);
    let c = 0;
    for (; c <= ln.length; c++) {
      measure.textContent = ln.slice(0, c);
      if (measure.getBoundingClientRect().width >= offsetX) break;
    }
    measure.remove();
    return { row: r, col: Math.min(c, ln.length) };
  }

  function updateCursorPos() {
    const ln = line();
    const lineEl = textEl.querySelector(`[data-line="${row}"]`);
    if (!lineEl) return;
    const wrap = textEl.parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    const before = ln.slice(0, col);
    const measure = document.createElement('span');
    measure.style.cssText = 'visibility:hidden;position:absolute;white-space:pre;font:inherit;';
    measure.textContent = before;
    lineEl.appendChild(measure);
    const rect = measure.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();
    measure.remove();
    cursorEl.style.top = (lineRect.top - wrapRect.top + wrap.scrollTop) + 'px';
    cursorEl.style.left = (rect.left - wrapRect.left + wrap.scrollLeft) + 'px';
    cursorEl.style.height = (lineRect.bottom - lineRect.top) + 'px';
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
  }

  function doClearForNew() {
    setFullText('');
  }

  async function newDocument() {
    if (!dirty) {
      doClearForNew();
      return;
    }
    const dialog = $('ws-new-dialog');
    if (!dialog) return;
    dialog.setAttribute('aria-hidden', 'false');
    const choice = await new Promise((resolve) => {
      const finish = (c) => {
        dialog.setAttribute('aria-hidden', 'true');
        document.removeEventListener('click', clickHandler);
        document.removeEventListener('keydown', keyHandler);
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
        }
      };
      document.addEventListener('click', clickHandler);
      document.addEventListener('keydown', keyHandler);
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

  function insertChar(ch) {
    const ln = line();
    setLine(row, ln.slice(0, col) + ch + ln.slice(col));
    col++;
    /* Word wrap at 80 cols: break at word boundary so whole words move to next line */
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
    render();
  }

  function deleteCharForward() {
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
    const ln = line();
    const rest = ln.slice(col);
    setLine(row, ln.slice(0, col));
    lines.splice(row + 1, 0, rest);
    row++;
    col = 0;
    dirty = true;
    render();
  }

  function moveLeft() {
    if (col > 0) col--;
    else if (row > 0) {
      row--;
      col = (lines[row] || '').length;
    }
    render();
  }

  function moveRight() {
    const ln = line();
    if (col < ln.length) col++;
    else if (row < lines.length - 1) {
      row++;
      col = 0;
    }
    render();
  }

  function moveUp() {
    if (row > 0) {
      row--;
      col = clampCol(row, col);
      render();
    }
  }

  function moveDown() {
    if (row < lines.length - 1) {
      row++;
      col = clampCol(row, col);
      render();
    }
  }

  function lineStart() {
    col = 0;
    render();
  }

  function lineEnd() {
    col = (line()).length;
    render();
  }

  function docStart() {
    row = 0;
    col = 0;
    render();
  }

  function docEnd() {
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

  function setFullText(s) {
    const raw = s.split('\n');
    lines = wrapLongLines(raw);
    if (lines.length === 0) lines = [''];
    row = 0;
    col = 0;
    dirty = false;
    render();
  }

  async function quit() {
    if (!dirty) {
      window.close();
      return;
    }
    const dialog = $('ws-exit-dialog');
    if (!dialog) return;
    dialog.setAttribute('aria-hidden', 'false');
    const choice = await new Promise((resolve) => {
      const finish = (c) => {
        dialog.setAttribute('aria-hidden', 'true');
        document.removeEventListener('click', clickHandler);
        document.removeEventListener('keydown', keyHandler);
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
        }
      };
      document.addEventListener('click', clickHandler);
      document.addEventListener('keydown', keyHandler);
    });
    if (choice === 'discard') {
      window.close();
    }
  }

  // ----- Find (simple) -----
  // (Find functionality removed)

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

    // Menu shortcuts (^X = Ctrl+X, M-X = Alt+X)
    if (ctrl && key === 'n' && !shift) {
      e.preventDefault();
      newDocument();
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

    switch (key) {
      case 'Backspace':
        e.preventDefault();
        deleteCharBackward();
        return;
      case 'Delete':
        e.preventDefault();
        deleteCharForward();
        return;
      case 'Enter':
        e.preventDefault();
        newLine();
        return;
      case 'Tab':
        e.preventDefault();
        const spaces = TAB - (col % TAB);
        insertChar(' '.repeat(spaces));
        return;
      case 'ArrowLeft':
        e.preventDefault();
        moveLeft();
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveRight();
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveUp();
        return;
      case 'ArrowDown':
        e.preventDefault();
        moveDown();
        return;
      case 'Home':
        e.preventDefault();
        if (ctrl) docStart();
        else lineStart();
        return;
      case 'End':
        e.preventDefault();
        if (ctrl) docEnd();
        else lineEnd();
        return;
      case 'PageUp':
        e.preventDefault();
        for (let i = 0; i < 20; i++) moveUp();
        return;
      case 'PageDown':
        e.preventDefault();
        for (let i = 0; i < 20; i++) moveDown();
        return;
    }

    if (key.length === 1 && !e.altKey && !e.metaKey) {
      e.preventDefault();
      insertChar(key);
    }
  };

  // Global shortcuts: work even when editor doesn't have focus (capture phase)
  function globalShortcutHandler(e) {
    const key = e.key;
    const ctrl = e.ctrlKey;
    const shift = e.shiftKey;
    if (ctrl && key === 'n' && !shift) {
      e.preventDefault();
      e.stopPropagation();
      newDocument();
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
  }
  document.addEventListener('keydown', globalShortcutHandler, true);

  textEl.addEventListener('keydown', keyHandler);
  textEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const cell = getCellFromMouseEvent(e);
    if (cell == null) return;
    row = cell.row;
    col = cell.col;
    render();
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
  textEl.parentElement.addEventListener('scroll', () => {
    if (textEl.querySelector(`[data-line="${row}"]`)) updateCursorPos();
  });

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

  // ----- Menu bar & toolbar (Ghostwriter-style point-and-click) -----
  const dropdowns = {
    file: $('ws-dropdown-file'),
    view: $('ws-dropdown-view')
  };

  function closeAllMenus() {
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
    new: () => newDocument(),
    exit: () => quit(),
    zoomIn: () => zoomIn(),
    zoomOut: () => zoomOut(),
    zoomReset: () => zoomReset(),
    togglePreview: () => { togglePreview(); closeAllMenus(); },
    font: () => { openFontDialog(); closeAllMenus(); }
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
      // After using menu actions like Copy/Paste, return focus to the editor
      // so typing and Backspace/Delete continue to work as expected.
      textEl.focus();
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllMenus(); });

  // Init
  const savedFont = localStorage.getItem(FONT_STORAGE_KEY);
  if (savedFont) applyFont(savedFont);
  renderRuler();
  render();
  textEl.focus();
})();
