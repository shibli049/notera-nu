# Notera Nu — Word & Phrase Notes

[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](../../LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](manifest.json)

A Chrome extension for saving notes on words and phrases as you read the web. Select text on any page, jot down a meaning, and Notera Nu offers a translation suggestion and — for single Swedish words — a grammar/inflection lookup.

## Features

- **Select-to-note** — highlight text on any page and a floating `+` button opens a note editor next to the selection.
- **Context menu** — right-click a selection and choose "Add Notera Nu note" as an alternative to the floating button.
- **Keyboard shortcut** — press `Alt+Shift+N` with text selected to open the add-note card; with nothing selected it opens your word list. Change it at `chrome://extensions/shortcuts` (or via Settings → Keyboard shortcut).
- **Translation suggestions**: suggests a translation into your chosen target language and pre-fills the note. It uses Chrome's built-in, on-device Language Detector and Translator APIs (Chrome 138+). When detection confidence is low (common for single words), or when a similar language (e.g. Danish vs. Swedish) scores close to it, your preferred source language is used (Swedish by default). A "From" dropdown on the note card lets you correct the source language and re-translate.
- **Swedish grammar lookup** — for single Swedish words, Notera Nu automatically looks up noun/verb/adjective/adverb inflection tables and links out to [SAOL](https://svenska.se/saol/).
- **Duplicate handling** — saving a note for text you've already noted lets you override the existing note or add a separate entry.
- **Popup manager** — search, inline-edit, and delete saved notes; expand into a full browser tab for more room.
- **Import/export** — back up or move notes via JSON or CSV, with duplicate detection on import.

## How it works

| Piece | Role |
|---|---|
| `manifest.json` | Manifest V3 config — permissions, content scripts, background worker, popup. |
| `background.js` | Service worker. Registers the context-menu item and handles `NOTA_SWEDISH_GRAMMAR` and sync messages from the content script and popup. |
| `content/content.js` | Injected into every page inside a shadow DOM. Renders the selection button, note editor card, and toast notifications. |
| `lib/translate.js` | On-device translation (`self.NotaTranslate`) via Chrome's `LanguageDetector`/`Translator` APIs, loaded in the content script (the APIs aren't available in service workers). Never throws: on any failure it returns the original text. |
| `lib/storage.js` | Shared storage layer (`self.NotaStorage`) wrapping `chrome.storage.local`. All reads/writes to notes and settings go through here. |
| `popup/` | The extension popup — note list, search, export/import, and the translation settings (target language, assumed source language). |

Notes are stored locally in `chrome.storage.local` under the key `nota_notes_v1`; there's no sync backend yet (see the popup footer).

### External services

Notera Nu calls one external endpoint at runtime — see [`NOTICE.md`](../../NOTICE.md) for full attribution:

- **Translation**: none. Translation runs on-device using Chrome's built-in APIs. Chrome downloads the language model the first time a language pair is used.
- **Swedish grammar** — [Språkbanken Text](https://spraakbanken.gu.se/)'s Karp API (`saldom` resource, CC BY 4.0), queried live per word. Nothing from it is bundled or redistributed with the extension.

## Installing (development)

Notera Nu is plain vanilla JS/HTML/CSS — no build step, no dependencies.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this directory (`apps/chrome-extension/`).
4. Select text on any webpage to try it out.

After editing source files, click the reload icon on the extension's card in `chrome://extensions` to pick up changes. Content scripts already injected into open tabs need a page refresh.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Persist notes and settings in `chrome.storage.local`. |
| `contextMenus` | Add the "Add Notera Nu note" right-click menu item. |
| `host_permissions` (`spraakbanken4.it.gu.se`) | Fetch Swedish grammar data. |

## License

MIT — see [`LICENSE`](../../LICENSE). Third-party data attribution is in [`NOTICE.md`](../../NOTICE.md).
