importScripts(
  'lib/storage.js',
  'lib/sync/compression.js',
  'lib/sync/hash.js',
  'lib/sync/merge.js',
  'lib/sync/chromeSyncBackend.js',
  'lib/sync/driveBackend.js',
  'lib/sync/engine.js'
);

const CONTEXT_MENU_ID = 'nota-add-note';
const NOTA_PERIODIC_SYNC_ALARM = 'nota-periodic-sync';
const NOTA_DEBOUNCED_SYNC_ALARM = 'nota-debounced-sync';

function notaEnsurePeriodicSyncAlarm() {
  chrome.alarms.create(NOTA_PERIODIC_SYNC_ALARM, { periodInMinutes: 15 });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Add Notera Nu note for "%s"',
    contexts: ['selection'],
  });
  notaEnsurePeriodicSyncAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  notaEnsurePeriodicSyncAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === NOTA_PERIODIC_SYNC_ALARM) {
    self.NotaSyncEngine.runSync({ trigger: 'periodic' });
  } else if (alarm.name === NOTA_DEBOUNCED_SYNC_ALARM) {
    self.NotaSyncEngine.runSync({ trigger: 'debounced' });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: 'NOTA_OPEN_EDITOR',
    text: info.selectionText || '',
  });
});

const NOTA_OPEN_EDITOR_COMMAND = 'open-note-editor';

function notaAskTabToOpenEditor(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'NOTA_OPEN_EDITOR_FROM_SELECTION' }, (response) => {
      // lastError is set on pages without our content script (chrome://, Web Store, ...).
      if (chrome.runtime.lastError) return resolve(false);
      resolve(!!(response && response.opened));
    });
  });
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== NOTA_OPEN_EDITOR_COMMAND) return;
  const opened = tab && tab.id ? await notaAskTabToOpenEditor(tab.id) : false;
  if (opened) return;
  try {
    await chrome.action.openPopup();
  } catch (err) {
    console.warn('Notera Nu: could not open popup from shortcut', err);
  }
});

// Swedish grammar lookup, sourced from Sprakbanken's (University of Gothenburg) Karp API,
// resource "saldom" (SALDO's morphology, CC-BY-4.0): https://spraakbanken.gu.se/en/resources/saldom
// This is not the Swedish Academy's SAOL itself (no public API / no licensed offline dataset
// exists for that), but a sibling academic lexicon built to track SAOL's standard headwords
// and inflection norms, live-queryable and openly licensed.
const NOTA_SAOL_BASE_URL = 'https://svenska.se/saol/?sok=';
const NOTA_GRAMMAR_CACHE = new Map(); // lowercased word -> response payload (best-effort, resets on service worker eviction)

// Only plain single-word classes; entries tagged with an "m" suffix (nnm, vbm, avm, abm, ...)
// or with a multi-word baseform are idioms/phrases and are filtered out.
const NOTA_SUPPORTED_POS = {
  nn: { label: 'Noun', forms: [
    ['sg indef nom', 'Indefinite singular'],
    ['sg def nom', 'Definite singular'],
    ['pl indef nom', 'Indefinite plural'],
    ['pl def nom', 'Definite plural'],
  ] },
  vb: { label: 'Verb', forms: [
    ['inf aktiv', 'Infinitive'],
    ['pres ind aktiv', 'Present'],
    ['pret ind aktiv', 'Past'],
    ['sup aktiv', 'Supine'],
    ['imper', 'Imperative'],
  ] },
  av: { label: 'Adjective', forms: [
    ['pos indef sg u nom', 'Indefinite (en-word)'],
    ['pos indef sg n nom', 'Indefinite (ett-word)'],
    ['pos def pl nom', 'Definite / plural'],
    ['komp nom', 'Comparative'],
    ['super indef nom', 'Superlative'],
  ] },
  ab: { label: 'Adverb', forms: [] },
};

async function notaLookupSwedishGrammar(word) {
  const lookupWord = word.trim().toLowerCase();
  if (!lookupWord || /\s/.test(lookupWord)) {
    throw new Error('Grammar lookup only supports single words');
  }
  if (NOTA_GRAMMAR_CACHE.has(lookupWord)) {
    return NOTA_GRAMMAR_CACHE.get(lookupWord);
  }

  const url =
    'https://spraakbanken4.it.gu.se/karp/v7/query/saldom' +
    `?q=equals%7CinflectionTable.writtenForm%7C${encodeURIComponent(lookupWord)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Grammar request failed (${res.status})`);
  const data = await res.json();
  const hits = Array.isArray(data && data.hits) ? data.hits : [];

  const seenPos = new Set();
  const entries = [];
  for (const hit of hits) {
    const entry = hit && hit.entry;
    if (!entry || !entry.baseform || /\s/.test(entry.baseform)) continue; // drop idioms/phrases
    const posConfig = NOTA_SUPPORTED_POS[entry.partOfSpeech];
    if (!posConfig || seenPos.has(entry.partOfSpeech)) continue;
    seenPos.add(entry.partOfSpeech);

    const table = Array.isArray(entry.inflectionTable) ? entry.inflectionTable : [];
    const forms = posConfig.forms
      .map(([msd, label]) => {
        const match = table.find((f) => f.msd === msd);
        return match ? { label, form: match.writtenForm } : null;
      })
      .filter(Boolean);

    entries.push({
      partOfSpeech: entry.partOfSpeech,
      partOfSpeechLabel: posConfig.label,
      baseform: entry.baseform,
      forms,
    });
    if (entries.length >= 3) break;
  }

  const result = {
    lookupWord,
    entries,
    saolUrl: NOTA_SAOL_BASE_URL + encodeURIComponent(lookupWord),
  };
  NOTA_GRAMMAR_CACHE.set(lookupWord, result);
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'NOTA_SWEDISH_GRAMMAR') return;
  (async () => {
    try {
      const result = await notaLookupSwedishGrammar(message.word || '');
      sendResponse({ ok: true, ...result });
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true; // keep the message channel open for the async sendResponse
});

// --- Sync ---

const NOTA_DRIVE_CONNECT_TIMEOUT_MS = 20000;

// chrome.identity.getAuthToken({interactive: true}) doesn't fail fast on a bad
// client_id — it first needs a Google account signed into the browser itself,
// and opens a real sign-in tab to get one. If the user never completes (or
// abandons) that tab, the callback never fires, leaving the popup stuck on
// "Connecting…" forever. Bound the wait so the popup always gets a response.
function notaWithTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(Object.assign(new Error(message), { code: 'CONNECT_TIMEOUT' }));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === 'NOTA_NOTES_CHANGED') {
    // Recreating an alarm with the same name resets its delay — that's the
    // debounce. Also kick a best-effort immediate attempt since the worker
    // is already awake to receive this message.
    chrome.alarms.create(NOTA_DEBOUNCED_SYNC_ALARM, { delayInMinutes: 1 });
    self.NotaSyncEngine.runSync({ trigger: 'debounced-immediate' });
    return false;
  }

  if (message.type === 'NOTA_SYNC_NOW') {
    self.NotaSyncEngine.runSync({ trigger: 'manual' }).then(sendResponse);
    return true;
  }

  if (message.type === 'NOTA_GET_SYNC_STATUS') {
    self.NotaSyncEngine.getSyncState().then(sendResponse);
    return true;
  }

  if (message.type === 'NOTA_CONNECT_DRIVE') {
    (async () => {
      try {
        await notaWithTimeout(
          self.NotaDriveBackend.getToken({ interactive: true }),
          NOTA_DRIVE_CONNECT_TIMEOUT_MS,
          "Google sign-in timed out. Make sure you're signed into Chrome and finish the sign-in tab, then try again."
        );
        await self.NotaStorage.saveSettings({ syncBackend: 'drive' });
        const result = await self.NotaSyncEngine.runSync({ trigger: 'connect' });
        sendResponse({ ok: true, syncResult: result });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }
});
