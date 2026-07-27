// Shared storage layer for Nota.
//
// Everything reads/writes through this module instead of touching
// chrome.storage directly, so a future sync backend (Firebase, etc.)
// can be swapped in by changing only this file — the content script
// and popup UI don't need to know where notes are actually persisted.

const NOTA_STORAGE_KEY = 'nota_notes_v1';

function notaGenerateId() {
  if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

async function notaGetAllNotes() {
  const result = await chrome.storage.local.get(NOTA_STORAGE_KEY);
  return result[NOTA_STORAGE_KEY] || [];
}

async function notaSaveAllNotes(notes) {
  await chrome.storage.local.set({ [NOTA_STORAGE_KEY]: notes });
}

async function notaAddNote({ text, note, pageTitle, pageUrl }) {
  const notes = await notaGetAllNotes();
  const now = new Date().toISOString();
  const entry = {
    id: notaGenerateId(),
    text: text.trim(),
    note: (note || '').trim(),
    pageTitle: pageTitle || '',
    pageUrl: pageUrl || '',
    createdAt: now,
    updatedAt: now,
  };
  notes.unshift(entry);
  await notaSaveAllNotes(notes);
  return entry;
}

async function notaUpdateNote(id, changes) {
  const notes = await notaGetAllNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  notes[idx] = { ...notes[idx], ...changes, updatedAt: new Date().toISOString() };
  await notaSaveAllNotes(notes);
  return notes[idx];
}

async function notaDeleteNote(id) {
  const notes = await notaGetAllNotes();
  const filtered = notes.filter((n) => n.id !== id);
  await notaSaveAllNotes(filtered);
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
const NOTA_DEFAULT_SETTINGS = { targetLang: 'en' };

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
