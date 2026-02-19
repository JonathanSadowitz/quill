/**
 * Quill – word processor, runs locally, open/save files from disk.
 * Shortcuts in Nano style: ^X = Ctrl+X, M-X = Alt+X.
 */

(function () {
  'use strict';

  const COLS = 80;
  const TAB = 8;

  let lines = [''];
  let row = 0;
  let col = 0;
  let insert = true;
  let blockStart = null;
  let blockEnd = null;
  let filename = 'Untitled';
  let dirty = false;
  let fileHandle = null; // File System Access API

  const $ = (id) => document.getElementById(id);
  const status = $('ws-status');
  const ruler = $('ws-ruler-content');
  const textEl = $('ws-text');
  const cursorEl = $('ws-cursor');
  const fileOpenInput = $('ws-file-open');
  const fileSaveInput = $('ws-file-save');
  const helpOverlay = $('ws-help-overlay');
  const zoomIndicatorEl = $('ws-zoom-indicator');

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
      if (blockStart !== null && blockEnd !== null) {
        const a = Math.min(blockStart.row, blockEnd.row);
        const b = Math.max(blockStart.row, blockEnd.row);
        const ac = blockStart.row === a ? blockStart.col : blockEnd.col;
        const bc = blockEnd.row === b ? blockEnd.col : blockStart.col;
        if (r >= a && r <= b) {
          if (r === a && r === b) {
            const c1 = Math.min(ac, bc);
            const c2 = Math.max(ac, bc);
            span.innerHTML = escapeHtml(ln.slice(0, c1)) + '<span class="ws-block">' + escapeHtml(ln.slice(c1, c2)) + '</span>' + escapeHtml(ln.slice(c2));
          } else if (r === a) {
            span.innerHTML = escapeHtml(ln.slice(0, ac)) + '<span class="ws-block">' + escapeHtml(ln.slice(ac)) + '</span>';
          } else if (r === b) {
            span.innerHTML = '<span class="ws-block">' + escapeHtml(ln.slice(0, bc)) + '</span>' + escapeHtml(ln.slice(bc));
          } else {
            span.innerHTML = '<span class="ws-block">' + escapeHtml(ln) + '</span>';
          }
        } else {
          span.textContent = ln;
        }
        span.dataset.line = r;
        frag.appendChild(span);
        frag.appendChild(document.createTextNode('\n'));
      } else {
        span.textContent = ln;
        span.dataset.line = r;
        frag.appendChild(span);
        frag.appendChild(document.createTextNode('\n'));
      }
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
  let isMouseSelecting = false;

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

  function getCharOffset(r, c) {
    const ln = lines[r] || '';
    let offset = 0;
    for (let i = 0; i < c && i < ln.length; i++) {
      offset += ln[i] === '\t' ? (TAB - (offset % TAB)) : 1;
    }
    return offset;
  }

  // Get (row, col) from a mouse event for drag selection
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
    $('ws-filename').textContent = filename + (dirty ? ' *' : '');
    $('ws-page').textContent = 'Page ' + (Math.floor(row / 50) + 1);
    $('ws-line').textContent = 'L=' + (row + 1);
    $('ws-col').textContent = 'C=' + (col + 1);
    $('ws-insert').textContent = insert ? 'Insert' : 'Replace';
    const wc = wordCount();
    const wcEl = $('ws-wordcount');
    if (wcEl) wcEl.textContent = wc === 1 ? '1 word' : wc + ' words';
  }

  function doClearForNew() {
    fileHandle = null;
    filename = 'Untitled';
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
    if (choice === 'save') {
      const saved = await saveFile();
      if (saved) doClearForNew();
    } else if (choice === 'discard') {
      doClearForNew();
    }
  }

  function getBlockRange() {
    if (blockStart === null || blockEnd === null) return null;
    const r1 = Math.min(blockStart.row, blockEnd.row);
    const r2 = Math.max(blockStart.row, blockEnd.row);
    const c1 = blockStart.row < blockEnd.row ? blockStart.col : blockEnd.col;
    const c2 = blockStart.row < blockEnd.row ? blockEnd.col : blockStart.col;
    if (blockStart.row === blockEnd.row && c1 > c2) return { r1, r2, c1: c2, c2: c1 };
    return { r1, r2, c1: blockStart.row === r1 ? blockStart.col : blockEnd.col, c2: blockEnd.row === r2 ? blockEnd.col : blockStart.col };
  }

  /* Find break point for word wrap: last space before COLS, or COLS if no space (long word) */
  function wrapBreakPoint(str) {
    if (str.length <= COLS) return -1;
    const lastSpace = str.lastIndexOf(' ', COLS);
    return lastSpace > 0 ? lastSpace : COLS;
  }

  function insertChar(ch) {
    const ln = line();
    if (insert) {
      setLine(row, ln.slice(0, col) + ch + ln.slice(col));
      col++;
    } else {
      if (col < ln.length) {
        setLine(row, ln.slice(0, col) + ch + ln.slice(col + 1));
      } else {
        setLine(row, ln + ch);
      }
      col++;
    }
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

  function deleteLine() {
    if (lines.length <= 1) {
      setLine(0, '');
      col = 0;
    } else {
      lines.splice(row, 1);
      if (row >= lines.length) row = lines.length - 1;
      col = Math.min(col, (lines[row] || '').length);
    }
    dirty = true;
    render();
  }

  function deleteWord() {
    const ln = line();
    let end = col;
    while (end < ln.length && /\s/.test(ln[end])) end++;
    while (end < ln.length && !/\s/.test(ln[end])) end++;
    if (end > col) {
      setLine(row, ln.slice(0, col) + ln.slice(end));
      dirty = true;
      render();
    }
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

  function wordLeft() {
    const ln = line();
    if (col > 0) {
      let c = col - 1;
      while (c > 0 && /\s/.test(ln[c - 1])) c--;
      while (c > 0 && !/\s/.test(ln[c - 1])) c--;
      col = c;
    } else if (row > 0) {
      row--;
      col = (lines[row] || '').length;
    }
    render();
  }

  function wordRight() {
    const ln = line();
    if (col < ln.length) {
      while (col < ln.length && !/\s/.test(ln[col])) col++;
      while (col < ln.length && /\s/.test(ln[col])) col++;
    } else if (row < lines.length - 1) {
      row++;
      col = 0;
    }
    render();
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

  function scrollUp() {
    if (row > 0) {
      row--;
      col = clampCol(row, col);
      render();
    }
  }

  function scrollDown() {
    if (row < lines.length - 1) {
      row++;
      col = clampCol(row, col);
      render();
    }
  }

  function toggleInsert() {
    insert = !insert;
    updateStatus();
  }

  // ----- Block operations -----
  function blockSetBegin() {
    blockStart = { row, col };
    if (blockEnd === null) blockEnd = { row, col };
    render();
  }

  function blockSetEnd() {
    blockEnd = { row, col };
    if (blockStart === null) blockStart = { row, col };
    render();
  }

  function blockHide() {
    blockStart = null;
    blockEnd = null;
    render();
  }

  function blockCopy() {
    const range = getBlockRange();
    if (!range) return;
    let text = '';
    for (let r = range.r1; r <= range.r2; r++) {
      const ln = lines[r] || '';
      if (r === range.r1 && r === range.r2) text += ln.slice(range.c1, range.c2);
      else if (r === range.r1) text += ln.slice(range.c1) + '\n';
      else if (r === range.r2) text += ln.slice(0, range.c2);
      else text += ln + '\n';
    }
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function blockCut() {
    const range = getBlockRange();
    if (!range) return;
    let text = '';
    for (let r = range.r1; r <= range.r2; r++) {
      const ln = lines[r] || '';
      if (r === range.r1 && r === range.r2) text += ln.slice(range.c1, range.c2);
      else if (r === range.r1) text += ln.slice(range.c1) + '\n';
      else if (r === range.r2) text += ln.slice(0, range.c2);
      else text += ln + '\n';
    }
    navigator.clipboard.writeText(text).catch(() => {});
    blockDelete();
  }

  function blockDelete() {
    const range = getBlockRange();
    if (!range) return;
    if (range.r1 === range.r2) {
      const ln = lines[range.r1] || '';
      setLine(range.r1, ln.slice(0, range.c1) + ln.slice(range.c2));
      row = range.r1;
      col = range.c1;
    } else {
      const first = (lines[range.r1] || '').slice(0, range.c1);
      const last = (lines[range.r2] || '').slice(range.c2);
      setLine(range.r1, first + last);
      for (let i = range.r2; i > range.r1; i--) lines.splice(i, 1);
      row = range.r1;
      col = first.length;
    }
    blockStart = null;
    blockEnd = null;
    dirty = true;
    render();
  }

  function blockPaste() {
    navigator.clipboard.readText().then((text) => {
      const ln = line();
      const before = ln.slice(0, col);
      const after = ln.slice(col);
      const inserted = wrapLongLines(text.split('\n'));
      if (inserted.length === 1) {
        setLine(row, before + inserted[0] + after);
        col = (before + inserted[0]).length;
      } else {
        setLine(row, before + inserted[0]);
        for (let i = 1; i < inserted.length; i++) {
          lines.splice(row + i, 0, inserted[i]);
        }
        setLine(row + inserted.length - 1, (lines[row + inserted.length - 1] || '') + after);
        row += inserted.length - 1;
        col = (inserted[inserted.length - 1] || '').length;
      }
      /* Normalize: wrap any line that still exceeds COLS (e.g. from before+inserted+after) */
      lines = wrapLongLines(lines);
      row = Math.min(row, lines.length - 1);
      col = Math.min(col, (lines[row] || '').length);
      dirty = true;
      render();
    }).catch(() => {});
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

  async function openFile() {
    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Markdown / Text', accept: { 'text/markdown': ['.md'], 'text/plain': ['.txt'] } }],
          multiple: false
        });
        fileHandle = handle;
        const file = await handle.getFile();
        const text = await file.text();
        filename = file.name;
        setFullText(text);
        dirty = false;
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
    fileOpenInput.click();
  }

  function openFileFromInput(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    fileHandle = null;
    filename = file.name;
    const r = new FileReader();
    r.onload = () => {
      setFullText(r.result || '');
      dirty = false;
    };
    r.readAsText(file);
    e.target.value = '';
  }

  async function saveFile() {
    const text = getFullText();
    try {
      if (fileHandle && 'WritableStream' in window) {
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        dirty = false;
        updateStatus();
        return true;
      }
    } catch (e) {}
    return await saveFileAs();
  }

  async function saveFileAs() {
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename === 'Untitled' ? 'document.md' : filename,
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }, { description: 'Text', accept: { 'text/plain': ['.txt'] } }]
        });
        fileHandle = handle;
        filename = handle.name;
        const writable = await handle.createWritable();
        await writable.write(getFullText());
        await writable.close();
        dirty = false;
        updateStatus();
        return true;
      }
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
    const blob = new Blob([getFullText()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename === 'Untitled' ? 'document.md' : filename;
    a.click();
    URL.revokeObjectURL(a.href);
    dirty = false;
    updateStatus();
    return true;
  }

  function quit() {
    if (dirty && !confirm('Save changes to ' + filename + '?')) return;
    if (dirty) saveFile();
    window.close();
  }

  fileOpenInput.addEventListener('change', openFileFromInput);

  // ----- Reformat paragraph (^B) -----
  function reformatParagraph() {
    const ln = line();
    if (ln.trim() === '') return;
    let start = row;
    while (start > 0 && (lines[start - 1] || '').trim() !== '') start--;
    let end = row;
    while (end < lines.length - 1 && (lines[end + 1] || '').trim() !== '') end++;
    const paragraph = lines.slice(start, end + 1).join(' ').replace(/\s+/g, ' ').trim();
    const words = paragraph.split(' ');
    const result = [];
    let current = '';
    for (const w of words) {
      if (current.length + 1 + w.length <= COLS) {
        current = current ? current + ' ' + w : w;
      } else {
        if (current) result.push(current);
        current = w;
      }
    }
    if (current) result.push(current);
    for (let i = start; i <= end; i++) lines.splice(start, 1);
    result.forEach((l, i) => lines.splice(start + i, 0, l));
    row = start;
    col = 0;
    dirty = true;
    render();
  }

  // ----- Find (simple) -----
  let lastFind = '';
  let lastFindDir = 1;

  function find() {
    const term = prompt('Find:', lastFind || '');
    if (term == null) return;
    lastFind = term;
    if (!term) return;
    let r = row;
    let c = col;
    for (let i = 0; i < lines.length * COLS; i++) {
      const ln = lines[r] || '';
      const idx = r === row && i === 0 ? ln.indexOf(term, c) : ln.indexOf(term, r === row ? c : 0);
      if (idx !== -1) {
        row = r;
        col = idx;
        render();
        return;
      }
      r++;
      if (r >= lines.length) r = 0;
      c = 0;
    }
    alert('Not found.');
  }

  function findAgain() {
    if (!lastFind) return find();
    let r = row;
    let c = col + lastFindDir;
    for (let i = 0; i < lines.length * COLS; i++) {
      const ln = lines[r] || '';
      const idx = ln.indexOf(lastFind, c);
      if (idx !== -1) {
        row = r;
        col = idx;
        render();
        return;
      }
      r += lastFindDir;
      c = 0;
      if (r < 0) r = lines.length - 1;
      if (r >= lines.length) r = 0;
    }
    alert('Not found.');
  }

  // ----- Help window -----
  function toggleHelp() {
    const isHidden = helpOverlay.getAttribute('aria-hidden') !== 'false';
    helpOverlay.setAttribute('aria-hidden', String(!isHidden));
  }
  function closeHelp() {
    helpOverlay.setAttribute('aria-hidden', 'true');
  }
  helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) closeHelp(); });

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
    if (zoomIndicatorEl) zoomIndicatorEl.textContent = 'Zoom ' + pct + '%  Ctrl++  Ctrl+-  Ctrl+0';
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
    if (e.key === 'F1') {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (e.key === 'Escape') {
      if (helpOverlay.getAttribute('aria-hidden') === 'false') {
        e.preventDefault();
        closeHelp();
        return;
      }
      if (blockStart !== null || blockEnd !== null) {
        e.preventDefault();
        blockHide();
        return;
      }
    }
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      blockPaste();
      return;
    }
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      if (blockStart !== null && blockEnd !== null) blockCopy();
      return;
    }
    if (e.ctrlKey && e.key === 'x') {
      e.preventDefault();
      if (blockStart !== null && blockEnd !== null) blockCut();
      return;
    }

    const key = e.key;
    const ctrl = e.ctrlKey;
    const shift = e.shiftKey;

    // Menu shortcuts (Nano style: ^X = Ctrl+X, M-X = Alt+X)
    if (ctrl && key === 'n' && !shift) {
      e.preventDefault();
      newDocument();
      return;
    }
    if (ctrl && key === 'o' && !shift) {
      e.preventDefault();
      openFile();
      return;
    }
    if (ctrl && key === 's' && !shift) {
      e.preventDefault();
      saveFile();
      return;
    }
    if (e.altKey && !ctrl && (key === 's' || key === 'S')) {
      e.preventDefault();
      saveFileAs();
      return;
    }
    if (e.altKey && !ctrl && (key === 'q' || key === 'Q')) {
      e.preventDefault();
      quit();
      return;
    }
    if (key === 'Insert') {
      e.preventDefault();
      toggleInsert();
      return;
    }
    if (e.altKey && !ctrl && (key === 'b' || key === 'B')) {
      e.preventDefault();
      blockSetBegin();
      return;
    }
    if (e.altKey && !ctrl && (key === 'e' || key === 'E')) {
      e.preventDefault();
      blockSetEnd();
      return;
    }
    if (e.altKey && !ctrl && (key === 'h' || key === 'H')) {
      e.preventDefault();
      blockHide();
      return;
    }
    if (ctrl && key === 'g') {
      e.preventDefault();
      toggleHelp();
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

    if (ctrl && key === 'l') {
      e.preventDefault();
      findAgain();
      return;
    }
    if (ctrl && key === 'f') {
      e.preventDefault();
      find();
      return;
    }

    if (ctrl && key === 'j') {
      e.preventDefault();
      reformatParagraph();
      return;
    }
    if (ctrl && key === 'v') {
      e.preventDefault();
      toggleInsert();
      return;
    }
    if (ctrl && key === 'y') {
      e.preventDefault();
      deleteLine();
      return;
    }
    if (ctrl && key === 't') {
      e.preventDefault();
      deleteWord();
      return;
    }
    if (ctrl && key === 'g') {
      e.preventDefault();
      deleteCharForward();
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

    if (ctrl) {
      switch (key) {
        case 'a': e.preventDefault(); wordLeft(); return;
        case 'f': e.preventDefault(); wordRight(); return;
        case 'e': e.preventDefault(); moveUp(); return;
        case 'x': e.preventDefault(); moveDown(); return;
        case 's': e.preventDefault(); moveLeft(); return;
        case 'd': e.preventDefault(); moveRight(); return;
        case 'r': e.preventDefault(); scrollUp(); return;
        case 'c': e.preventDefault(); scrollDown(); return;
        case 'w': e.preventDefault(); scrollUp(); return;
        case 'z': e.preventDefault(); scrollDown(); return;
      }
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
    if (key === 'F1') {
      e.preventDefault();
      e.stopPropagation();
      toggleHelp();
      return;
    }
    if (ctrl && key === 'g') {
      e.preventDefault();
      e.stopPropagation();
      toggleHelp();
      return;
    }
    if (ctrl && (key === 'n' || key === 'o' || key === 's') && !shift) {
      e.preventDefault();
      e.stopPropagation();
      if (key === 'n') newDocument();
      else if (key === 'o') openFile();
      else saveFile();
      return;
    }
    if (e.altKey && !ctrl && (key === 's' || key === 'S' || key === 'q' || key === 'Q' || key === 'b' || key === 'B' || key === 'e' || key === 'E' || key === 'h' || key === 'H')) {
      e.preventDefault();
      e.stopPropagation();
      const k = key.toLowerCase();
      if (k === 's') saveFileAs();
      else if (k === 'q') quit();
      else if (k === 'b') blockSetBegin();
      else if (k === 'e') blockSetEnd();
      else if (k === 'h') blockHide();
      return;
    }
    if (key === 'Insert') {
      e.preventDefault();
      e.stopPropagation();
      toggleInsert();
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
    if (ctrl && (key === 'f' || key === 'l' || key === 'j')) {
      e.preventDefault();
      e.stopPropagation();
      if (key === 'f') find();
      else if (key === 'l') findAgain();
      else reformatParagraph();
      return;
    }
    if (ctrl && (key === 'x' || key === 'c' || key === 'v')) {
      e.preventDefault();
      e.stopPropagation();
      if (key === 'x' && blockStart !== null && blockEnd !== null) blockCut();
      else if (key === 'c' && blockStart !== null && blockEnd !== null) blockCopy();
      else if (key === 'v') blockPaste();
      return;
    }
    if (key === 'Escape') {
      if (helpOverlay.getAttribute('aria-hidden') === 'false') {
        e.preventDefault();
        e.stopPropagation();
        closeHelp();
        return;
      }
      if (blockStart !== null || blockEnd !== null) {
        e.preventDefault();
        e.stopPropagation();
        blockHide();
        return;
      }
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
    blockStart = { row: cell.row, col: cell.col };
    blockEnd = { row: cell.row, col: cell.col };
    isMouseSelecting = true;
    render();
  });

  textEl.addEventListener('mousemove', (e) => {
    if (!isMouseSelecting || e.buttons !== 1) return;
    const cell = getCellFromMouseEvent(e);
    if (cell == null) return;
    blockEnd = { row: cell.row, col: cell.col };
    row = cell.row;
    col = cell.col;
    render();
  });

  textEl.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    if (isMouseSelecting) {
      isMouseSelecting = false;
      if (blockStart && blockEnd && blockStart.row === blockEnd.row && blockStart.col === blockEnd.col) {
        blockStart = null;
        blockEnd = null;
      }
    }
    textEl.focus();
  });

  textEl.addEventListener('mouseleave', () => {
    if (isMouseSelecting) isMouseSelecting = false;
  });

  document.addEventListener('mouseup', () => {
    if (isMouseSelecting) isMouseSelecting = false;
  });

  textEl.addEventListener('click', (e) => {
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
    edit: $('ws-dropdown-edit'),
    view: $('ws-dropdown-view'),
    help: $('ws-dropdown-help')
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
    open: () => openFile(),
    save: () => saveFile(),
    saveAs: () => saveFileAs(),
    exit: () => quit(),
    blockBegin: () => { blockSetBegin(); closeAllMenus(); },
    blockEnd: () => { blockSetEnd(); closeAllMenus(); },
    blockHide: () => { blockHide(); closeAllMenus(); },
    cut: () => { blockCut(); closeAllMenus(); },
    copy: () => { blockCopy(); closeAllMenus(); },
    paste: () => { blockPaste(); closeAllMenus(); },
    find: () => { find(); closeAllMenus(); },
    findAgain: () => { findAgain(); closeAllMenus(); },
    reformat: () => { reformatParagraph(); closeAllMenus(); },
    zoomIn: () => zoomIn(),
    zoomOut: () => zoomOut(),
    zoomReset: () => zoomReset(),
    togglePreview: () => { togglePreview(); closeAllMenus(); },
    toggleInsert: () => { toggleInsert(); closeAllMenus(); },
    font: () => { openFontDialog(); closeAllMenus(); },
    help: () => { toggleHelp(); closeAllMenus(); }
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
