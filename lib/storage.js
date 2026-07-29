// Shared storage layer for Notera Nu.
//
// Everything reads/writes through this module instead of touching
// chrome.storage directly. The actual sync backends (Chrome Sync, Google
// Drive) live under lib/sync/ and are orchestrated from background.js —
// this file only owns the local chrome.storage.local copy and tombstones.

const NOTA_STORAGE_KEY = 'nota_notes_v1';

function notaGenerateId() {
  if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

// Raw accessor: returns every stored note, including soft-deleted tombstones.
// Internal read-modify-write paths (add/update/delete) must use this, never
// the filtered notaGetAllNotes(), or every write would silently drop existing
// tombstones before they ever reach a sync cycle.
async function notaGetAllNotesRaw() {
  const result = await chrome.storage.local.get(NOTA_STORAGE_KEY);
  return result[NOTA_STORAGE_KEY] || [];
}

// Public/UI-facing view: excludes soft-deleted (tombstoned) notes.
async function notaGetAllNotes() {
  return (await notaGetAllNotesRaw()).filter((n) => !n.deletedAt);
}

function notaNotifyChanged() {
  // Lets the background service worker debounce a sync cycle. Only ever called
  // from user-facing mutators below — the sync engine's own write-back passes
  // { silent: true } to avoid re-triggering itself.
  try {
    chrome.runtime.sendMessage({ type: 'NOTA_NOTES_CHANGED' }, () => {
      void chrome.runtime.lastError;
    });
  } catch (_e) {
    // No listener yet, or extension context invalidated — harmless; the
    // periodic alarm and manual "Sync now" button are backstops.
  }
}

async function notaSaveAllNotes(notes, opts = {}) {
  await chrome.storage.local.set({ [NOTA_STORAGE_KEY]: notes });
  if (!opts.silent) notaNotifyChanged();
}

async function notaAddNote({ text, note, pageTitle, pageUrl, grammar }) {
  const notes = await notaGetAllNotesRaw();
  const now = new Date().toISOString();
  const entry = {
    id: notaGenerateId(),
    text: text.trim(),
    note: (note || '').trim(),
    pageTitle: pageTitle || '',
    pageUrl: pageUrl || '',
    grammar: grammar || null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  notes.unshift(entry);
  await notaSaveAllNotes(notes);
  return entry;
}

async function notaUpdateNote(id, changes) {
  const notes = await notaGetAllNotesRaw();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  notes[idx] = { ...notes[idx], ...changes, updatedAt: new Date().toISOString() };
  await notaSaveAllNotes(notes);
  return notes[idx];
}

async function notaDeleteNote(id) {
  const notes = await notaGetAllNotesRaw();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const now = new Date().toISOString();
  notes[idx] = { ...notes[idx], deletedAt: now, updatedAt: now };
  await notaSaveAllNotes(notes);
}

function notaNormalizeText(text) {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function notaFindByText(text) {
  const notes = await notaGetAllNotes();
  const norm = notaNormalizeText(text);
  return notes.find((n) => notaNormalizeText(n.text) === norm) || null;
}

const NOTA_SETTINGS_KEY = 'nota_settings';
const NOTA_DEFAULT_SETTINGS = {
  targetLang: 'en',
  syncBackend: 'off',
  swedishGrammarEnabled: false,
  translationEnabled: true,
};

async function notaGetSettings() {
  const result = await chrome.storage.local.get(NOTA_SETTINGS_KEY);
  return { ...NOTA_DEFAULT_SETTINGS, ...(result[NOTA_SETTINGS_KEY] || {}) };
}

async function notaSaveSettings(changes) {
  const current = await notaGetSettings();
  const next = { ...current, ...changes };
  await chrome.storage.local.set({ [NOTA_SETTINGS_KEY]: next });
  return next;
}

self.NotaStorage = {
  getAllNotes: notaGetAllNotes,
  getAllNotesRaw: notaGetAllNotesRaw,
  saveAllNotes: notaSaveAllNotes,
  addNote: notaAddNote,
  updateNote: notaUpdateNote,
  deleteNote: notaDeleteNote,
  findByText: notaFindByText,
  normalizeText: notaNormalizeText,
  generateId: notaGenerateId,
  getSettings: notaGetSettings,
  saveSettings: notaSaveSettings,
  STORAGE_KEY: NOTA_STORAGE_KEY,
  SETTINGS_KEY: NOTA_SETTINGS_KEY,
};
