const CONTEXT_MENU_ID = 'nota-add-note';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Add Nota note for "%s"',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: 'NOTA_OPEN_EDITOR',
    text: info.selectionText || '',
  });
});

// Uses the free, unofficial endpoint behind translate.google.com (no API key
// needed). It is NOT an official Google API: there's no uptime guarantee, it
// can be rate-limited or change shape without notice, and it may occasionally
// fail or return junk. Treat it as best-effort, not a reliable dependency.
async function notaTranslateText(text, targetLang) {
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    `?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translate request failed (${res.status})`);
  const data = await res.json();
  const segments = data && data[0];
  if (!Array.isArray(segments)) throw new Error('Unexpected translate response');
  const translated = segments.map((seg) => seg[0]).join('');
  if (!translated) throw new Error('Empty translation');
  return { translated, detectedLang: data[2] || null };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'NOTA_TRANSLATE') return;
  (async () => {
    try {
      const stored = await chrome.storage.local.get('nota_settings');
      const targetLang = (stored.nota_settings && stored.nota_settings.targetLang) || 'en';
      const result = await notaTranslateText(message.text, targetLang);
      sendResponse({ ok: true, targetLang, ...result });
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true; // keep the message channel open for the async sendResponse
});
