(() => {
  const HOST_ID = 'nota-host-root';
  if (document.getElementById(HOST_ID)) return; // already injected (e.g. frameset edge case)

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  let notaSettings = { swedishGrammarEnabled: false, translationEnabled: true };
  self.NotaStorage.getSettings().then((s) => {
    notaSettings = s;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[self.NotaStorage.SETTINGS_KEY]) {
      notaSettings = changes[self.NotaStorage.SETTINGS_KEY].newValue || notaSettings;
    }
  });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      --nota-ink: #221f1a;
      --nota-muted: #7a7266;
      --nota-paper: #ffffff;
      --nota-line: #e7e0d1;
      --nota-accent: #8a5817;
      --nota-accent-hover: #6f4512;
      --nota-accent-soft: #f5ead8;
      --nota-accent-soft-border: #e8d3ab;
      --nota-success-bg: #eaf4ea;
      --nota-success-border: #cfe6cf;
      --nota-success-text: #2f6b3f;
      --nota-error-bg: #fbeae7;
      --nota-error-border: #f0c9c0;
      --nota-error-text: #9c3524;
      --nota-warn-bg: #fdf3e0;
      --nota-warn-border: #ecd9a6;
      --nota-warn-text: #7d5a12;
      --nota-radius-sm: 6px;
      --nota-radius-md: 9px;
      --nota-radius-lg: 14px;
    }

    button:focus-visible, textarea:focus-visible {
      outline: 2px solid var(--nota-accent);
      outline-offset: 2px;
    }

    .nota-btn {
      position: absolute;
      z-index: 2147483647;
      display: none;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 999px;
      background: var(--nota-accent);
      color: #fff;
      font: 600 16px/1 system-ui, sans-serif;
      box-shadow: 0 2px 8px rgba(34,31,26,.3), 0 0 0 3px var(--nota-accent-soft);
      cursor: pointer;
      border: none;
      user-select: none;
      transition: transform 120ms ease, background 120ms ease;
    }
    .nota-btn:hover { background: var(--nota-accent-hover); transform: scale(1.06); }
    .nota-btn:active { transform: scale(0.86); }
    .nota-btn.visible { display: flex; }

    .nota-card {
      position: absolute;
      z-index: 2147483647;
      display: none;
      flex-direction: column;
      gap: 8px;
      width: 280px;
      padding: 12px;
      border-radius: var(--nota-radius-lg);
      background: var(--nota-paper);
      color: var(--nota-ink);
      box-shadow: 0 8px 30px rgba(34,31,26,.28);
      font: 13px/1.4 system-ui, -apple-system, sans-serif;
      border: 1px solid var(--nota-line);
    }
    .nota-card.visible { display: flex; animation: notaPopIn 140ms ease-out; }
    @keyframes notaPopIn {
      from { opacity: 0; transform: translateY(4px) scale(.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .nota-card .nota-selected {
      font-weight: 700;
      font-size: 14px;
      color: var(--nota-accent);
      max-height: 60px;
      overflow-y: auto;
      word-break: break-word;
    }
    .nota-card textarea {
      resize: vertical;
      min-height: 56px;
      max-height: 160px;
      padding: 6px 8px;
      border-radius: var(--nota-radius-sm);
      border: 1px solid var(--nota-line);
      font: 13px/1.4 system-ui, sans-serif;
      outline: none;
      box-sizing: border-box;
      width: 100%;
      color: var(--nota-ink);
    }
    .nota-card textarea:focus { border-color: var(--nota-accent); }
    .nota-translate-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .nota-translate-btn {
      border: 1px solid var(--nota-accent-soft-border);
      background: var(--nota-accent-soft);
      color: var(--nota-accent-hover);
      border-radius: var(--nota-radius-sm);
      padding: 4px 8px;
      font: 600 11px system-ui, sans-serif;
      cursor: pointer;
      letter-spacing: .01em;
    }
    .nota-translate-btn:hover { background: var(--nota-accent-soft-border); }
    .nota-translate-btn:disabled { opacity: .6; cursor: default; }
    .nota-translate-status {
      font-size: 11px;
      color: var(--nota-muted);
      flex: 1;
    }
    .nota-translate-warning {
      font-size: 10.5px;
      color: var(--nota-warn-text);
      background: var(--nota-warn-bg);
      border: 1px solid var(--nota-warn-border);
      border-radius: var(--nota-radius-sm);
      padding: 4px 6px;
      line-height: 1.35;
    }
    .nota-grammar-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--nota-accent-soft);
      border: 1px solid var(--nota-accent-soft-border);
      border-radius: var(--nota-radius-sm);
      padding: 8px;
    }
    .nota-grammar-status {
      font-size: 11px;
      color: var(--nota-muted);
    }
    .nota-grammar-entry + .nota-grammar-entry {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--nota-accent-soft-border);
    }
    .nota-grammar-pos {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--nota-accent-hover);
      margin-bottom: 3px;
    }
    .nota-grammar-forms {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 10px;
      font-size: 11.5px;
    }
    .nota-grammar-form-label { color: var(--nota-muted); }
    .nota-grammar-form-value { font-weight: 600; color: var(--nota-ink); word-break: break-word; }
    .nota-grammar-link {
      align-self: flex-start;
      font-size: 11px;
      font-weight: 600;
      color: var(--nota-accent-hover);
      text-decoration: none;
    }
    .nota-grammar-link:hover { text-decoration: underline; }

    .nota-row { display: flex; gap: 8px; justify-content: flex-end; }
    .nota-row button {
      border: none;
      border-radius: var(--nota-radius-sm);
      padding: 6px 12px;
      font: 600 12px system-ui, sans-serif;
      cursor: pointer;
    }
    .nota-cancel { background: #f1efe9; color: #45403a; }
    .nota-cancel:hover { background: #e7e3d9; }
    .nota-save { background: var(--nota-accent); color: #fff; }
    .nota-save:hover { background: var(--nota-accent-hover); }

    .nota-edit-view, .nota-conflict-view { display: flex; flex-direction: column; gap: 8px; }
    .nota-edit-view[hidden], .nota-conflict-view[hidden] { display: none; }
    .nota-grammar-box[hidden], .nota-translate-row[hidden] { display: none; }
    .nota-conflict-msg { font-size: 13px; }
    .nota-conflict-msg strong { color: var(--nota-accent); }
    .nota-conflict-existing {
      background: #faf8f4;
      border: 1px solid var(--nota-line);
      border-radius: var(--nota-radius-sm);
      padding: 6px 8px;
      font-size: 12px;
      color: #45403a;
      max-height: 80px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .nota-conflict-actions { display: flex; flex-direction: column; gap: 6px; }
    .nota-conflict-actions button {
      border: none;
      border-radius: var(--nota-radius-sm);
      padding: 7px 10px;
      font: 600 12px system-ui, sans-serif;
      cursor: pointer;
      width: 100%;
    }
    .nota-conflict-override { background: var(--nota-accent); color: #fff; }
    .nota-conflict-override:hover { background: var(--nota-accent-hover); }
    .nota-conflict-addnew { background: #f1efe9; color: #45403a; }
    .nota-conflict-addnew:hover { background: #e7e3d9; }
    .nota-conflict-back { background: transparent; color: var(--nota-muted); }
    .nota-conflict-back:hover { color: var(--nota-ink); }
    .nota-toast {
      position: absolute;
      z-index: 2147483647;
      display: none;
      max-width: 260px;
      padding: 6px 10px;
      border-radius: var(--nota-radius-sm);
      background: var(--nota-ink);
      color: #fff;
      font: 600 12px system-ui, sans-serif;
    }
    .nota-toast.visible { display: block; animation: notaPopIn 140ms ease-out; }
    .nota-toast.error { background: var(--nota-error-text); }

    @media (prefers-reduced-motion: reduce) {
      .nota-card.visible, .nota-toast.visible { animation: none; }
      .nota-btn { transition: none; }
    }
  `;

  const btn = document.createElement('button');
  btn.className = 'nota-btn';
  btn.type = 'button';
  btn.title = 'Add a Notera Nu note';
  btn.textContent = '+';

  const card = document.createElement('div');
  card.className = 'nota-card';
  card.innerHTML = `
    <div class="nota-edit-view" id="nota-edit-view">
      <div class="nota-selected" id="nota-selected-text"></div>
      <div class="nota-translate-row" id="nota-translate-row">
        <button type="button" class="nota-translate-btn" id="nota-translate-btn">Suggest translation</button>
        <span class="nota-translate-status" id="nota-translate-status"></span>
      </div>
      <div class="nota-translate-warning" id="nota-translate-warning">Translations are generated on-device by Chrome's built-in translator. Double-check them.</div>
      <div class="nota-grammar-box" id="nota-grammar-box" hidden>
        <div class="nota-grammar-status" id="nota-grammar-status"></div>
        <div class="nota-grammar-entries" id="nota-grammar-entries"></div>
        <a class="nota-grammar-link" id="nota-grammar-link" target="_blank" rel="noopener noreferrer" hidden>Open in SAOL ↗</a>
      </div>
      <textarea id="nota-note-input" placeholder="Add a meaning or note…"></textarea>
      <div class="nota-row">
        <button type="button" class="nota-cancel" id="nota-cancel-btn">Cancel</button>
        <button type="button" class="nota-save" id="nota-save-btn">Save</button>
      </div>
    </div>
    <div class="nota-conflict-view" id="nota-conflict-view" hidden>
      <div class="nota-conflict-msg">You already have a note for <strong id="nota-conflict-text"></strong>:</div>
      <div class="nota-conflict-existing" id="nota-conflict-existing"></div>
      <div class="nota-conflict-actions">
        <button type="button" class="nota-conflict-override" id="nota-conflict-override-btn">Override existing note</button>
        <button type="button" class="nota-conflict-addnew" id="nota-conflict-addnew-btn">Add as a new, separate entry</button>
        <button type="button" class="nota-conflict-back" id="nota-conflict-back-btn">Back to editing</button>
      </div>
    </div>
  `;

  const toast = document.createElement('div');
  toast.className = 'nota-toast';
  toast.textContent = 'Saved!';

  shadow.append(style, btn, card, toast);

  const editView = card.querySelector('#nota-edit-view');
  const selectedTextEl = card.querySelector('#nota-selected-text');
  const noteInput = card.querySelector('#nota-note-input');
  const saveBtn = card.querySelector('#nota-save-btn');
  const cancelBtn = card.querySelector('#nota-cancel-btn');
  const translateRow = card.querySelector('#nota-translate-row');
  const translateWarning = card.querySelector('#nota-translate-warning');
  const translateBtn = card.querySelector('#nota-translate-btn');
  const translateStatus = card.querySelector('#nota-translate-status');

  const grammarBox = card.querySelector('#nota-grammar-box');
  const grammarStatus = card.querySelector('#nota-grammar-status');
  const grammarEntriesEl = card.querySelector('#nota-grammar-entries');
  const grammarLink = card.querySelector('#nota-grammar-link');

  const conflictView = card.querySelector('#nota-conflict-view');
  const conflictTextEl = card.querySelector('#nota-conflict-text');
  const conflictExistingEl = card.querySelector('#nota-conflict-existing');
  const conflictOverrideBtn = card.querySelector('#nota-conflict-override-btn');
  const conflictAddNewBtn = card.querySelector('#nota-conflict-addnew-btn');
  const conflictBackBtn = card.querySelector('#nota-conflict-back-btn');

  const NOTA_SAOL_URL_PREFIX = 'https://svenska.se/saol/?sok=';

  let pendingText = '';
  let lastRect = null;
  let translateToken = 0;
  let lastAutoFill = null; // value we pre-filled; replaced on re-translate if the user hasn't edited it
  let grammarToken = 0;
  let pendingExisting = null;
  let pendingGrammar = null;

  function showEditView() {
    editView.hidden = false;
    conflictView.hidden = true;
  }

  function showConflictView(existing) {
    pendingExisting = existing;
    conflictTextEl.textContent = existing.text;
    conflictExistingEl.textContent = existing.note || '(no note saved)';
    editView.hidden = true;
    conflictView.hidden = false;
  }

  async function performSave(text, noteText, existingId) {
    const rect = lastRect;
    const payload = {
      note: noteText,
      pageTitle: document.title,
      pageUrl: location.href,
    };
    // Only touch the grammar field when this session actually looked something up —
    // otherwise an override-save (or a save with the feature disabled) would null out
    // grammar data an earlier save already attached to this note.
    if (pendingGrammar) payload.grammar = pendingGrammar;
    if (existingId) {
      await self.NotaStorage.updateNote(existingId, payload);
    } else {
      await self.NotaStorage.addNote({ text, grammar: pendingGrammar, ...payload });
    }
    hideAll();
    if (rect) showToastAt(rect, existingId ? 'Updated!' : 'Saved!');
  }

  async function runTranslate(text, { fromClick = false } = {}) {
    const myToken = ++translateToken;
    translateBtn.disabled = true;
    translateStatus.textContent = 'Translating…';
    // translate() never rejects; on failure it returns the original text.
    const result = await self.NotaTranslate.translate(text, {
      targetLang: notaSettings.targetLang || 'en',
      assumedSourceLang: notaSettings.assumedSourceLang || 'sv',
      hasUserActivation: fromClick,
      onProgress: (loaded) => {
        if (myToken !== translateToken) return;
        translateStatus.textContent = `Downloading model… ${Math.round((loaded || 0) * 100)}%`;
      },
    });
    if (myToken !== translateToken) return; // a newer selection/card superseded this request
    translateBtn.disabled = false;
    if (!noteInput.value.trim() || noteInput.value === lastAutoFill) {
      noteInput.value = result.translated;
      lastAutoFill = result.translated;
    }
    if (result.failed) {
      translateStatus.textContent = result.reason === 'NEEDS_ACTIVATION'
        ? 'Click "Suggest translation" to download the language model'
        : 'Translation unavailable';
    } else if (result.sameLanguage) {
      translateStatus.textContent = `Already in ${result.targetLang}${result.assumed ? ' (assumed)' : ''}`;
    } else {
      translateStatus.textContent = `Translated ${result.sourceLang} → ${result.targetLang}${result.assumed ? ' (assumed)' : ''}`;
    }
    if (notaSettings.swedishGrammarEnabled && result.sourceLang === 'sv' && text && !/\s/.test(text)) {
      runGrammarLookup(text);
    } else {
      resetGrammarBox();
    }
  }

  function resetGrammarBox() {
    grammarToken++;
    pendingGrammar = null;
    grammarBox.hidden = true;
    grammarStatus.textContent = '';
    grammarEntriesEl.textContent = '';
    grammarLink.hidden = true;
  }

  function requestGrammar(word) {
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

  function renderGrammarEntries(entries) {
    grammarEntriesEl.textContent = '';
    for (const entry of entries) {
      const section = document.createElement('div');
      section.className = 'nota-grammar-entry';

      const posLabel = document.createElement('div');
      posLabel.className = 'nota-grammar-pos';
      posLabel.textContent = entry.partOfSpeechLabel;
      section.appendChild(posLabel);

      if (entry.forms && entry.forms.length) {
        const grid = document.createElement('div');
        grid.className = 'nota-grammar-forms';
        for (const f of entry.forms) {
          const labelEl = document.createElement('span');
          labelEl.className = 'nota-grammar-form-label';
          labelEl.textContent = f.label;
          const valueEl = document.createElement('span');
          valueEl.className = 'nota-grammar-form-value';
          valueEl.textContent = f.form;
          grid.append(labelEl, valueEl);
        }
        section.appendChild(grid);
      }
      grammarEntriesEl.appendChild(section);
    }
  }

  async function runGrammarLookup(word) {
    const myToken = ++grammarToken;
    pendingGrammar = null;
    grammarBox.hidden = false;
    grammarStatus.textContent = 'Looking up grammar…';
    grammarEntriesEl.textContent = '';
    grammarLink.href = NOTA_SAOL_URL_PREFIX + encodeURIComponent(word.toLowerCase());
    grammarLink.hidden = false;

    let result;
    try {
      result = await requestGrammar(word);
    } catch (err) {
      result = { ok: false, error: (err && err.message) || String(err) };
    }
    if (myToken !== grammarToken) return; // superseded by a newer selection/card

    if (result && result.ok) {
      if (result.entries && result.entries.length) {
        pendingGrammar = { lookupWord: result.lookupWord, entries: result.entries, saolUrl: result.saolUrl };
        grammarStatus.textContent = '';
        renderGrammarEntries(result.entries);
      } else {
        grammarStatus.textContent = 'Not found in the dictionary.';
      }
    } else if (/context invalidated/i.test(result?.error || '')) {
      grammarStatus.textContent = 'Extension updated — refresh this page';
    } else {
      grammarStatus.textContent = 'Grammar lookup unavailable right now.';
    }
  }

  function hideAll() {
    btn.classList.remove('visible');
    card.classList.remove('visible');
    translateToken++; // invalidate any in-flight translation for the closed card
    grammarToken++; // invalidate any in-flight grammar lookup for the closed card
  }

  function showButtonAt(rect) {
    lastRect = rect;
    btn.style.left = `${window.scrollX + rect.right - 16}px`;
    btn.style.top = `${window.scrollY + rect.top - 40}px`;
    btn.classList.add('visible');
    card.classList.remove('visible');
  }

  function showCardAt(rect, text) {
    pendingText = text;
    pendingExisting = null;
    showEditView();
    resetGrammarBox();
    selectedTextEl.textContent = text;
    noteInput.value = '';
    lastAutoFill = null;
    translateStatus.textContent = '';

    const top = window.scrollY + rect.top - 8;
    let left = window.scrollX + rect.left;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - 296;
    if (left > maxLeft) left = Math.max(window.scrollX + 8, maxLeft);

    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
    card.classList.add('visible');
    btn.classList.remove('visible');
    requestAnimationFrame(() => noteInput.focus());

    const translationEnabled = notaSettings.translationEnabled !== false;
    translateRow.hidden = !translationEnabled;
    translateWarning.hidden = !translationEnabled;
    if (translationEnabled) runTranslate(text);
  }

  function showToastAt(rect, message = 'Saved!', isError = false) {
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.style.left = `${window.scrollX + rect.left}px`;
    toast.style.top = `${window.scrollY + rect.top - 8}px`;
    toast.classList.add('visible');
    clearTimeout(showToastAt._t);
    showToastAt._t = setTimeout(() => toast.classList.remove('visible'), isError ? 4500 : 1200);
  }

  // chrome.* calls throw "Extension context invalidated" once the extension
  // has been reloaded/updated but this content script (injected into an
  // already-open tab) hasn't been replaced yet — only a page refresh fixes it.
  function describeError(err) {
    const message = (err && err.message) || String(err || 'Unknown error');
    if (/context invalidated/i.test(message)) {
      return 'Notera Nu was updated — refresh this page to keep using it.';
    }
    return 'Something went wrong: ' + message;
  }

  function reportError(err) {
    showToastAt(lastRect || { top: 20, left: 20 }, describeError(err), true);
  }

  function isEventInsideHost(e) {
    return e.composedPath && e.composedPath().includes(host);
  }

  document.addEventListener('mouseup', (e) => {
    if (isEventInsideHost(e)) return;
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : '';
      if (!text || text.length > 500 || selection.rangeCount === 0) {
        if (!card.classList.contains('visible')) hideAll();
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      showButtonAt(rect);
    }, 0);
  });

  document.addEventListener('mousedown', (e) => {
    if (isEventInsideHost(e)) return;
    hideAll();
  });

  btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
  btn.addEventListener('click', () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (!text) return;
    showCardAt(lastRect, text);
  });

  cancelBtn.addEventListener('click', hideAll);
  translateBtn.addEventListener('click', () => runTranslate(pendingText, { fromClick: true }));

  saveBtn.addEventListener('click', async () => {
    try {
      const noteText = noteInput.value.trim();
      const existing = await self.NotaStorage.findByText(pendingText);
      if (existing) {
        showConflictView(existing);
        return;
      }
      await performSave(pendingText, noteText);
    } catch (err) {
      reportError(err);
    }
  });

  conflictBackBtn.addEventListener('click', showEditView);

  conflictAddNewBtn.addEventListener('click', async () => {
    try {
      await performSave(pendingText, noteInput.value.trim());
    } catch (err) {
      reportError(err);
    }
  });

  conflictOverrideBtn.addEventListener('click', async () => {
    if (!pendingExisting) return;
    try {
      await performSave(pendingText, noteInput.value.trim(), pendingExisting.id);
    } catch (err) {
      reportError(err);
    }
  });

  noteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAll();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveBtn.click();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'NOTA_OPEN_EDITOR') {
      const text = (message.text || '').trim();
      if (!text) return;
      const selection = window.getSelection();
      let rect;
      if (selection && selection.rangeCount > 0 && selection.toString().trim() === text) {
        rect = selection.getRangeAt(0).getBoundingClientRect();
      }
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        rect = { top: window.innerHeight / 2 - 100, left: window.innerWidth / 2 - 140, right: window.innerWidth / 2 + 140 };
      }
      showCardAt(rect, text);
    }
  });
})();
