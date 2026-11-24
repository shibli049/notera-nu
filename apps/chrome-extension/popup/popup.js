const listEl = document.getElementById('notes-list');
const emptyStateEl = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const countLabel = document.getElementById('count-label');
const template = document.getElementById('note-item-template');
const exportMenu = document.querySelector('.nota-menu');
const exportJsonBtn = document.getElementById('export-json-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const importInput = document.getElementById('import-input');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const translateEnabledCheckbox = document.getElementById('translate-enabled-checkbox');
const translateOptions = document.getElementById('translate-options');
const targetLangSelect = document.getElementById('target-lang-select');
const assumedLangSelect = document.getElementById('assumed-lang-select');
const swedishGrammarCheckbox = document.getElementById('swedish-grammar-checkbox');
const debugEnabledCheckbox = document.getElementById('debug-enabled-checkbox');
const ioStatusEl = document.getElementById('io-status');
const expandBtn = document.getElementById('expand-btn');
const syncBackendSelect = document.getElementById('sync-backend-select');
const syncNowBtn = document.getElementById('sync-now-btn');
const syncStatusLine = document.getElementById('sync-status-line');
const syncQuotaBanner = document.getElementById('sync-quota-banner');
const footerSyncNote = document.getElementById('footer-sync-note');
const paginationControls = document.getElementById('pagination-controls');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageIndicator = document.getElementById('page-indicator');
const quizBtn = document.getElementById('quiz-btn');
const notesView = document.getElementById('notes-view');
const quizView = document.getElementById('quiz-view');
const quizEmpty = document.getElementById('quiz-empty');
const quizCardWrap = document.getElementById('quiz-card-wrap');
const quizCard = document.getElementById('quiz-card');
const quizWordEl = document.getElementById('quiz-word');
const quizWordBackEl = document.getElementById('quiz-word-back');
const quizNoteEl = document.getElementById('quiz-note');
const quizGrammarEl = document.getElementById('quiz-grammar');
const quizNextBtn = document.getElementById('quiz-next-btn');
const quizProgressEl = document.getElementById('quiz-progress');
const quizCardBackEl = document.querySelector('.quiz-card-back');

const isTabView = new URLSearchParams(location.search).get('view') === 'tab';
if (isTabView) {
  document.documentElement.classList.add('nota-tab-view');
  expandBtn.hidden = true;
  quizBtn.hidden = false;
} else {
  expandBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') + '?view=tab' });
  });
}

const CSV_COLUMNS = ['text', 'note', 'pageTitle', 'pageUrl', 'grammar', 'createdAt', 'updatedAt'];
const NOTES_PER_PAGE = 20;

let allNotes = [];
let filteredNotes = [];
let currentPage = 1;
let deleteConfirmId = null;
let currentSettings = null;

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
    const clearGrammarBtn = grammarDetails.querySelector('.clear-grammar-btn');
    const isSingleWord = entry.text && !/\s/.test(entry.text.trim());

    function showGrammarLookupBtn() {
      if (!isSingleWord) return;
      grammarBtn.hidden = false;
      grammarBtn.disabled = false;
      grammarBtn.textContent = 'Grammar';
    }

    function bindGrammarLookupBtn() {
      // Single word with no grammar data yet (saved before this feature existed, or the
      // automatic lookup found nothing at save time) — offer an on-demand fetch.
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
            grammarBtn.hidden = true;
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

    clearGrammarBtn.addEventListener('click', async () => {
      try {
        await self.NotaStorage.updateNote(entry.id, { grammar: null });
        entry.grammar = null;
        entry.updatedAt = new Date().toISOString();
        grammarDetails.hidden = true;
        grammarDetails.open = false;
        showGrammarLookupBtn();
      } catch (err) {
        showIoStatus('Could not clear grammar: ' + err.message, true);
      }
    });

    if (!currentSettings || !currentSettings.swedishGrammarEnabled) {
      // Feature is off: keep any stored grammar data untouched, just don't show it.
    } else if (entry.grammar && entry.grammar.entries && entry.grammar.entries.length) {
      grammarDetails.hidden = false;
      renderGrammarBody(grammarDetails.querySelector('.note-grammar-body'), entry.grammar);
      bindGrammarLookupBtn();
    } else if (isSingleWord) {
      showGrammarLookupBtn();
      bindGrammarLookupBtn();
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
}

// Filters (and alphabetically sorts) allNotes into filteredNotes, then renders
// whichever page is current. Pass resetPage when the result set has changed in
// a way that should send the user back to page 1 (e.g. a new search query) —
// other refreshes (edits, sync, delete) keep the reader on the same page.
function applyFilter({ resetPage = false } = {}) {
  const q = searchInput.value.trim().toLowerCase();
  filteredNotes = (q
    ? allNotes.filter(
        (n) => n.text.toLowerCase().includes(q) || (n.note || '').toLowerCase().includes(q)
      )
    : allNotes.slice()
  ).sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));

  if (resetPage) currentPage = 1;
  renderPage();
}

function renderPage() {
  const total = filteredNotes.length;
  const totalPages = Math.max(1, Math.ceil(total / NOTES_PER_PAGE));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const start = (currentPage - 1) * NOTES_PER_PAGE;
  render(filteredNotes.slice(start, start + NOTES_PER_PAGE));

  emptyStateEl.hidden = total > 0;
  countLabel.textContent = total === 1 ? '1 note' : `${total} notes`;

  paginationControls.hidden = totalPages <= 1;
  pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

prevPageBtn.addEventListener('click', () => {
  currentPage--;
  renderPage();
});

nextPageBtn.addEventListener('click', () => {
  currentPage++;
  renderPage();
});

searchInput.addEventListener('input', () => applyFilter({ resetPage: true }));

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
  // Read the raw (tombstone-inclusive) store: getAllNotes() only returns active
  // notes, and concatenating onto that filtered view would silently drop every
  // existing soft-deleted note, breaking delete-sync the moment a file is imported.
  const existingRaw = await self.NotaStorage.getAllNotesRaw();
  const seenTexts = new Set(
    existingRaw.filter((n) => !n.deletedAt).map((n) => self.NotaStorage.normalizeText(n.text))
  );
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
      deletedAt: null,
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
    });
  }

  const merged = existingRaw.concat(toAdd);
  merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  await self.NotaStorage.saveAllNotes(merged);
  allNotes = merged.filter((n) => !n.deletedAt);
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

function setLangSelectValue(selectEl, code) {
  if (!selectEl.querySelector(`option[value="${CSS.escape(code)}"]`)) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    selectEl.insertBefore(opt, selectEl.querySelector('option[value="__custom__"]'));
  }
  selectEl.value = code;
}

function bindLangSelect(selectEl, settingsKey, promptText) {
  selectEl.addEventListener('change', async () => {
    if (selectEl.value === '__custom__') {
      const code = prompt(promptText);
      const trimmed = code ? code.trim() : '';
      if (!trimmed) {
        selectEl.value = (await self.NotaStorage.getSettings())[settingsKey];
        return;
      }
      setLangSelectValue(selectEl, trimmed);
      await self.NotaStorage.saveSettings({ [settingsKey]: trimmed });
      return;
    }
    await self.NotaStorage.saveSettings({ [settingsKey]: selectEl.value });
  });
}

bindLangSelect(targetLangSelect, 'targetLang', 'Enter a target language code (ISO 639-1), e.g. "sv" for Swedish:');
bindLangSelect(assumedLangSelect, 'assumedSourceLang', 'Enter the language code to assume (ISO 639-1), e.g. "sv" for Swedish:');

swedishGrammarCheckbox.addEventListener('change', async () => {
  currentSettings = await self.NotaStorage.saveSettings({ swedishGrammarEnabled: swedishGrammarCheckbox.checked });
  applyFilter();
});

debugEnabledCheckbox.addEventListener('change', async () => {
  currentSettings = await self.NotaStorage.saveSettings({ debugEnabled: debugEnabledCheckbox.checked });
});

translateEnabledCheckbox.addEventListener('change', async () => {
  translateOptions.hidden = !translateEnabledCheckbox.checked;
  currentSettings = await self.NotaStorage.saveSettings({ translationEnabled: translateEnabledCheckbox.checked });
});

const shortcutLabel = document.getElementById('shortcut-label');
const shortcutChangeBtn = document.getElementById('shortcut-change-btn');

async function refreshShortcutLabel() {
  const commands = await chrome.commands.getAll();
  const command = commands.find((c) => c.name === 'open-note-editor');
  shortcutLabel.textContent = (command && command.shortcut) || 'Not set';
}

shortcutChangeBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

window.addEventListener('focus', refreshShortcutLabel);

settingsBtn.addEventListener('click', () => {
  const willOpen = settingsPanel.hidden;
  settingsPanel.hidden = !willOpen;
  settingsBtn.setAttribute('aria-expanded', String(willOpen));
});

let quizEntry = null;
let quizSeenIds = new Set();

function pickRandomQuizEntry() {
  if (!allNotes.length) return null;
  if (quizSeenIds.size >= allNotes.length) quizSeenIds.clear();
  const unseen = allNotes.filter((n) => !quizSeenIds.has(n.id));
  const pool = unseen.length ? unseen : allNotes;
  const entry = pool[Math.floor(Math.random() * pool.length)];
  quizSeenIds.add(entry.id);
  return entry;
}

function renderQuizCard() {
  quizCard.classList.remove('flipped');
  quizWordEl.textContent = quizEntry.text;
  quizWordBackEl.textContent = quizEntry.text;
  quizNoteEl.textContent = quizEntry.note || 'No note added';
  quizNoteEl.classList.toggle('quiz-note-empty', !quizEntry.note);

  const hasGrammar = !!(currentSettings && currentSettings.swedishGrammarEnabled && quizEntry.grammar && quizEntry.grammar.entries && quizEntry.grammar.entries.length);
  if (hasGrammar) {
    quizGrammarEl.hidden = false;
    renderGrammarBody(quizGrammarEl, quizEntry.grammar);
  } else {
    quizGrammarEl.hidden = true;
    quizGrammarEl.textContent = '';
  }
  quizCardBackEl.classList.toggle('no-grammar', !hasGrammar);

  quizProgressEl.textContent = `${quizSeenIds.size} of ${allNotes.length} seen this round`;
}

function showNextQuizCard() {
  quizEntry = pickRandomQuizEntry();
  if (!quizEntry) {
    quizCardWrap.hidden = true;
    quizEmpty.hidden = false;
    return;
  }
  quizCardWrap.hidden = false;
  quizEmpty.hidden = true;
  renderQuizCard();
}

quizCard.addEventListener('click', () => {
  if (!quizEntry) return;
  quizCard.classList.toggle('flipped');
});

quizCard.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    quizCard.click();
  }
});

quizNextBtn.addEventListener('click', showNextQuizCard);

quizBtn.addEventListener('click', () => {
  const enteringQuiz = quizView.hidden;
  quizView.hidden = !enteringQuiz;
  notesView.hidden = enteringQuiz;
  quizBtn.setAttribute('aria-expanded', String(enteringQuiz));
  quizBtn.textContent = enteringQuiz ? '📋 Word list' : '🎴 Quiz';
  if (enteringQuiz) {
    settingsPanel.hidden = true;
    settingsBtn.setAttribute('aria-expanded', 'false');
    quizSeenIds.clear();
    showNextQuizCard();
  }
});

document.addEventListener('click', (e) => {
  if (exportMenu.open && !exportMenu.contains(e.target)) exportMenu.open = false;
});

function requestSyncNow() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'NOTA_SYNC_NOW' }, resolve));
}

function requestSyncStatus() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'NOTA_GET_SYNC_STATUS' }, resolve));
}

function requestConnectDrive() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: 'NOTA_CONNECT_DRIVE' }, resolve));
}

async function refreshSyncStatus() {
  const state = (await requestSyncStatus()) || {};
  const text = state.needsReauth
    ? 'Google Drive needs reconnecting'
    : state.lastError
    ? 'Sync error: ' + state.lastError
    : state.lastSyncedAt
    ? 'Synced ' + formatTime(state.lastSyncedAt) + (state.backend === 'drive' ? ' via Google Drive' : ' via Chrome Sync')
    : 'Not synced yet';
  syncStatusLine.textContent = text;
  footerSyncNote.textContent = text;
  syncQuotaBanner.hidden = !state.quotaWarning;
}

syncBackendSelect.addEventListener('change', async () => {
  const chosen = syncBackendSelect.value;
  if (chosen === 'drive') {
    syncStatusLine.textContent = 'Connecting to Google Drive…';
    const result = await requestConnectDrive();
    if (!result || !result.ok) {
      syncBackendSelect.value = (await self.NotaStorage.getSettings()).syncBackend;
      showIoStatus('Could not connect to Google Drive: ' + (result && result.error), true);
    } else {
      allNotes = await self.NotaStorage.getAllNotes();
      applyFilter();
    }
    await refreshSyncStatus();
  refreshShortcutLabel();
    return;
  }
  await self.NotaStorage.saveSettings({ syncBackend: chosen });
  if (chosen !== 'off') {
    await requestSyncNow();
    allNotes = await self.NotaStorage.getAllNotes();
    applyFilter();
  }
  await refreshSyncStatus();
});

syncNowBtn.addEventListener('click', async () => {
  syncNowBtn.disabled = true;
  syncStatusLine.textContent = 'Syncing…';
  await requestSyncNow();
  allNotes = await self.NotaStorage.getAllNotes();
  applyFilter();
  await refreshSyncStatus();
  syncNowBtn.disabled = false;
});

// Live-refresh the list if a background sync merges remote changes in while the popup is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[self.NotaStorage.STORAGE_KEY]) {
    self.NotaStorage.getAllNotes().then((notes) => {
      allNotes = notes;
      applyFilter();
    });
  }
});

(async function init() {
  const settings = await self.NotaStorage.getSettings();
  currentSettings = settings;
  swedishGrammarCheckbox.checked = !!settings.swedishGrammarEnabled;
  translateEnabledCheckbox.checked = settings.translationEnabled !== false;
  debugEnabledCheckbox.checked = !!settings.debugEnabled;
  translateOptions.hidden = !translateEnabledCheckbox.checked;
  setLangSelectValue(targetLangSelect, settings.targetLang);
  setLangSelectValue(assumedLangSelect, settings.assumedSourceLang);
  syncBackendSelect.value = settings.syncBackend;
  await refreshSyncStatus();

  allNotes = await self.NotaStorage.getAllNotes();
  applyFilter();
})();
