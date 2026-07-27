const listEl = document.getElementById('notes-list');
const emptyStateEl = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const countLabel = document.getElementById('count-label');
const template = document.getElementById('note-item-template');
const exportMenu = document.querySelector('.nota-menu');
const exportJsonBtn = document.getElementById('export-json-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const importInput = document.getElementById('import-input');
const targetLangSelect = document.getElementById('target-lang-select');
const ioStatusEl = document.getElementById('io-status');
const expandBtn = document.getElementById('expand-btn');

const isTabView = new URLSearchParams(location.search).get('view') === 'tab';
if (isTabView) {
  document.documentElement.classList.add('nota-tab-view');
  expandBtn.hidden = true;
} else {
  expandBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') + '?view=tab' });
  });
}

const CSV_COLUMNS = ['text', 'note', 'pageTitle', 'pageUrl', 'grammar', 'createdAt', 'updatedAt'];

let allNotes = [];
let deleteConfirmId = null;

function formatTime(iso) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function requestGrammarLookup(word) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'NOTA_SWEDISH_GRAMMAR', word }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function renderGrammarBody(container, grammar) {
  container.textContent = '';
  for (const entry of grammar.entries) {
    const section = document.createElement('div');
    section.className = 'note-grammar-entry';

    const posLabel = document.createElement('div');
    posLabel.className = 'note-grammar-pos';
    posLabel.textContent = entry.partOfSpeechLabel;
    section.appendChild(posLabel);

    if (entry.forms && entry.forms.length) {
      const grid = document.createElement('div');
      grid.className = 'note-grammar-forms';
      for (const f of entry.forms) {
        const labelEl = document.createElement('span');
        labelEl.className = 'note-grammar-form-label';
        labelEl.textContent = f.label;
        const valueEl = document.createElement('span');
        valueEl.className = 'note-grammar-form-value';
        valueEl.textContent = f.form;
        grid.append(labelEl, valueEl);
      }
      section.appendChild(grid);
    }
    container.appendChild(section);
  }

  if (grammar.saolUrl) {
    const link = document.createElement('a');
    link.className = 'note-grammar-link';
    link.href = grammar.saolUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in SAOL ↗';
    container.appendChild(link);
  }
}

function render(notes) {
  listEl.textContent = '';
  emptyStateEl.hidden = notes.length > 0;

  for (const entry of notes) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = entry.id;
    node.querySelector('.note-text').textContent = entry.text;
    node.querySelector('.note-body').textContent = entry.note || '';

    const editInput = node.querySelector('.note-edit-input');
    editInput.value = entry.note || '';

    const sourceEl = node.querySelector('.note-source');
    if (entry.pageUrl) {
      sourceEl.href = entry.pageUrl;
      sourceEl.textContent = entry.pageTitle || hostnameFromUrl(entry.pageUrl) || entry.pageUrl;
    } else {
      sourceEl.remove();
    }

    node.querySelector('.note-time').textContent = formatTime(entry.updatedAt || entry.createdAt);

    const grammarDetails = node.querySelector('.note-grammar');
    const grammarBtn = node.querySelector('.grammar-btn');
    if (entry.grammar && entry.grammar.entries && entry.grammar.entries.length) {
      grammarDetails.hidden = false;
      renderGrammarBody(grammarDetails.querySelector('.note-grammar-body'), entry.grammar);
    } else if (entry.text && !/\s/.test(entry.text.trim())) {
      // Single word with no grammar data yet (saved before this feature existed, or the
      // automatic lookup found nothing at save time) — offer an on-demand fetch.
      grammarBtn.hidden = false;
      grammarBtn.addEventListener('click', async () => {
        grammarBtn.disabled = true;
        grammarBtn.textContent = 'Looking up…';
        try {
          const result = await requestGrammarLookup(entry.text);
          if (result && result.ok && result.entries && result.entries.length) {
            const grammar = { lookupWord: result.lookupWord, entries: result.entries, saolUrl: result.saolUrl };
            await self.NotaStorage.updateNote(entry.id, { grammar });
            entry.grammar = grammar;
            entry.updatedAt = new Date().toISOString();
            renderGrammarBody(grammarDetails.querySelector('.note-grammar-body'), grammar);
            grammarDetails.hidden = false;
            grammarDetails.open = true;
            grammarBtn.remove();
          } else if (result && result.ok) {
            showIoStatus(`No Swedish grammar data found for "${entry.text}".`, true);
            grammarBtn.disabled = false;
            grammarBtn.textContent = 'Grammar';
          } else {
            showIoStatus('Grammar lookup failed: ' + (result && result.error ? result.error : 'unknown error'), true);
            grammarBtn.disabled = false;
            grammarBtn.textContent = 'Grammar';
          }
        } catch (err) {
          showIoStatus('Grammar lookup failed: ' + err.message, true);
          grammarBtn.disabled = false;
          grammarBtn.textContent = 'Grammar';
        }
      });
    }

    const editBtn = node.querySelector('.edit-btn');
    const saveEditBtn = node.querySelector('.save-edit-btn');
    const deleteBtn = node.querySelector('.delete-btn');
    const bodyEl = node.querySelector('.note-body');

    editBtn.addEventListener('click', () => {
      bodyEl.hidden = true;
      editInput.hidden = false;
      editBtn.hidden = true;
      saveEditBtn.hidden = false;
      editInput.focus();
    });

    saveEditBtn.addEventListener('click', async () => {
      try {
        const newNote = editInput.value.trim();
        await self.NotaStorage.updateNote(entry.id, { note: newNote });
        entry.note = newNote;
        entry.updatedAt = new Date().toISOString();
        bodyEl.textContent = newNote;
        bodyEl.hidden = false;
        editInput.hidden = true;
        editBtn.hidden = false;
        saveEditBtn.hidden = true;
        node.querySelector('.note-time').textContent = formatTime(entry.updatedAt);
      } catch (err) {
        showIoStatus('Could not save edit: ' + err.message, true);
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (deleteConfirmId !== entry.id) {
        deleteConfirmId = entry.id;
        deleteBtn.textContent = 'Confirm?';
        deleteBtn.classList.add('confirm');
        setTimeout(() => {
          if (deleteConfirmId === entry.id) {
            deleteConfirmId = null;
            deleteBtn.textContent = 'Delete';
            deleteBtn.classList.remove('confirm');
          }
        }, 2500);
        return;
      }
      deleteConfirmId = null;
      try {
        await self.NotaStorage.deleteNote(entry.id);
        allNotes = allNotes.filter((n) => n.id !== entry.id);
        applyFilter();
      } catch (err) {
        showIoStatus('Could not delete: ' + err.message, true);
      }
    });

    listEl.appendChild(node);
  }

  countLabel.textContent = notes.length === 1 ? '1 note' : `${notes.length} notes`;
}

function applyFilter() {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = q
    ? allNotes.filter(
        (n) => n.text.toLowerCase().includes(q) || (n.note || '').toLowerCase().includes(q)
      )
    : allNotes;
  render(filtered);
}

searchInput.addEventListener('input', applyFilter);

function showIoStatus(message, isError = false) {
  ioStatusEl.textContent = message;
  ioStatusEl.classList.toggle('error', isError);
  ioStatusEl.hidden = false;
  clearTimeout(showIoStatus._t);
  showIoStatus._t = setTimeout(() => {
    ioStatusEl.hidden = true;
  }, 4000);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function notesToCsv(notes) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const n of notes) {
    lines.push(
      CSV_COLUMNS.map((col) => {
        const value = col === 'grammar' ? (n.grammar ? JSON.stringify(n.grammar) : '') : n[col];
        return csvEscape(value);
      }).join(',')
    );
  }
  return lines.join('\r\n');
}

// Minimal RFC 4180 CSV parser: handles quoted fields, embedded commas/newlines, and "" escapes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip; \n (below) terminates the row
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function csvToNoteObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? '';
    });
    return obj;
  });
}

// Grammar comes as an object from JSON imports, or a JSON-encoded string from the CSV column.
function parseGrammarField(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

// Merges items from an import file into existing notes, matching duplicates by
// normalized text (same rule the save flow uses) rather than by id, since
// ids don't round-trip reliably through CSV/Excel edits.
async function importNoteObjects(items) {
  const existing = await self.NotaStorage.getAllNotes();
  const seenTexts = new Set(existing.map((n) => self.NotaStorage.normalizeText(n.text)));
  const now = new Date().toISOString();
  const toAdd = [];
  let skipped = 0;

  for (const item of items) {
    if (!item || typeof item.text !== 'string' || !item.text.trim()) continue;
    const norm = self.NotaStorage.normalizeText(item.text);
    if (seenTexts.has(norm)) {
      skipped++;
      continue;
    }
    seenTexts.add(norm);
    toAdd.push({
      id: self.NotaStorage.generateId(),
      text: item.text.trim(),
      note: (item.note || '').trim(),
      pageTitle: item.pageTitle || '',
      pageUrl: item.pageUrl || '',
      grammar: parseGrammarField(item.grammar),
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
    });
  }

  const merged = existing.concat(toAdd);
  merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  await self.NotaStorage.saveAllNotes(merged);
  allNotes = merged;
  applyFilter();
  return { added: toAdd.length, skipped };
}

exportJsonBtn.addEventListener('click', async () => {
  const notes = await self.NotaStorage.getAllNotes();
  downloadBlob(
    new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' }),
    `nota-export-${new Date().toISOString().slice(0, 10)}.json`
  );
  exportMenu.open = false;
});

exportCsvBtn.addEventListener('click', async () => {
  const notes = await self.NotaStorage.getAllNotes();
  const csv = '﻿' + notesToCsv(notes); // BOM so Excel reads UTF-8 correctly
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `nota-export-${new Date().toISOString().slice(0, 10)}.csv`
  );
  exportMenu.open = false;
});

importInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const items = isCsv ? csvToNoteObjects(text) : JSON.parse(text);
    if (!Array.isArray(items)) throw new Error('Invalid file format');

    const { added, skipped } = await importNoteObjects(items);
    showIoStatus(`Imported ${added} note${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}.`);
  } catch (err) {
    showIoStatus('Could not import file: ' + err.message, true);
  } finally {
    importInput.value = '';
  }
});

targetLangSelect.addEventListener('change', async () => {
  if (targetLangSelect.value === '__custom__') {
    const code = prompt('Enter a target language code (ISO 639-1), e.g. "sv" for Swedish:');
    if (!code) {
      targetLangSelect.value = (await self.NotaStorage.getSettings()).targetLang;
      return;
    }
    const trimmed = code.trim();
    if (!targetLangSelect.querySelector(`option[value="${CSS.escape(trimmed)}"]`)) {
      const opt = document.createElement('option');
      opt.value = trimmed;
      opt.textContent = trimmed;
      targetLangSelect.insertBefore(opt, targetLangSelect.querySelector('option[value="__custom__"]'));
    }
    targetLangSelect.value = trimmed;
    await self.NotaStorage.saveSettings({ targetLang: trimmed });
    return;
  }
  await self.NotaStorage.saveSettings({ targetLang: targetLangSelect.value });
});

document.addEventListener('click', (e) => {
  if (exportMenu.open && !exportMenu.contains(e.target)) exportMenu.open = false;
});

(async function init() {
  const settings = await self.NotaStorage.getSettings();
  if (targetLangSelect.querySelector(`option[value="${CSS.escape(settings.targetLang)}"]`)) {
    targetLangSelect.value = settings.targetLang;
  } else {
    const opt = document.createElement('option');
    opt.value = settings.targetLang;
    opt.textContent = settings.targetLang;
    targetLangSelect.insertBefore(opt, targetLangSelect.querySelector('option[value="__custom__"]'));
    targetLangSelect.value = settings.targetLang;
  }

  allNotes = await self.NotaStorage.getAllNotes();
  applyFilter();
})();
