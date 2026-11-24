# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This is a monorepo. The only app so far is the Chrome extension in `apps/chrome-extension/`. An Android app (`apps/android/`) is planned. User-facing docs are in `apps/chrome-extension/README.md` and `FEATURES.md`; update them when you add a feature. Third-party data attribution goes in `NOTICE.md`.

## Development

The extension is plain vanilla JS/HTML/CSS (Manifest V3). There is no build step, no package manager, and no lint config.

- **Run:** go to `chrome://extensions`, turn on Developer mode, click Load unpacked, and pick `apps/chrome-extension/`. After editing, click reload on the extension's card. Tabs that were already open keep the old content script until you refresh them; until then `chrome.*` calls throw "Extension context invalidated".
- **Quick check:** `node --check <file>.js` checks syntax, and `python3 -m json.tool manifest.json` validates the manifest.
- **Tests:** none yet. The planned setup is `node:test` with a fake `chrome`, then jsdom, then Playwright (GitHub issues #2–#4).
- **Releases:** bump `version` in `manifest.json` in its own commit ("Bump extension version to X.Y.Z").

## Architecture

**No modules.** Every file is a classic script that attaches its API to a global on `self`: `self.NotaStorage`, `self.NotaTranslate`, `self.NotaMerge`, `self.NotaSyncEngine`, `self.NotaDriveBackend`, and so on. Load order matters, and it is set in three places:
- the service worker, through `importScripts(...)` at the top of `background.js`
- the content script, through `content_scripts[].js` in `manifest.json` (`storage.js`, then `translate.js`, then `content.js`)
- the popup, through `<script>` tags in `popup/popup.html`

When you add a `lib/` file, add it everywhere it's needed. Scripts loaded together share one global scope, which is why every top-level name has a `nota`/`NOTA_` prefix.

**Three contexts, which talk through `chrome.runtime` messages with `type: 'NOTA_*'`:**
- `background.js` (service worker): the context menu, the `open-note-editor` keyboard shortcut (`chrome.commands`), Swedish grammar lookup (`NOTA_SWEDISH_GRAMMAR`, which fetches Språkbanken's Karp `saldom` API), and everything about sync (`NOTA_NOTES_CHANGED`, `NOTA_SYNC_NOW`, `NOTA_GET_SYNC_STATUS`, `NOTA_CONNECT_DRIVE`). Its in-memory state, such as the grammar cache, is lost whenever Chrome stops the worker. Each `onMessage` listener handles only its own types and returns `true` only when it will call `sendResponse` asynchronously.
- `content/content.js`: an IIFE that renders the floating `+` button, the note card and the toasts inside a shadow DOM host. `NOTA_OPEN_EDITOR` (right-click menu, carries the text) and `NOTA_OPEN_EDITOR_FROM_SELECTION` (shortcut; replies `{opened}`) both go through `openEditorForText` and then `showCardAt`.
- `popup/`: the same page serves both the toolbar popup and a full-tab view (`popup.html?view=tab`, which is the only place the quiz appears). It holds the note list, search, pagination, import/export and settings.

**Translation** (`lib/translate.js`) uses Chrome's on-device `LanguageDetector` and `Translator` APIs (Chrome 138+). It runs only in the content script, because those APIs don't exist in service workers. It never throws; if anything fails, it returns the original text. `notaResolveSourceLang` picks the source language in this order:
1. the language the user picked in the card's "From" dropdown (`sourceLang` option);
2. the preferred language (`assumedSourceLang`), if the top guess's confidence is below `NOTA_DETECT_CONFIDENCE_THRESHOLD` (0.7);
3. the preferred language, if it scores at least `NOTA_PREFER_ASSUMED_RATIO` of the top guess. This is for similar languages such as Swedish, Danish and Norwegian. Detector confidences sum to at most 1, so this ratio is capped at (1 − T)/T, about 0.43; a higher value could never apply;
4. otherwise, the top guess.

The card's "Scores" panel shows the detector's raw per-language scores and why a language was chosen. It's hidden unless the `debugEnabled` setting is on.

**Storage** (`lib/storage.js`): every read and write of notes and settings must go through `NotaStorage`.
- Notes are stored in `chrome.storage.local` under `nota_notes_v1`, and settings under `nota_settings`. Settings are merged over `NOTA_DEFAULT_SETTINGS`, so a new setting only needs a default added there.
- Deleting a note doesn't remove it. It sets `deletedAt` and bumps `updatedAt`, leaving a "tombstone" record that tells other devices about the delete when they sync.
- `getAllNotes()` hides tombstones. Anything that reads and then writes the list must use `getAllNotesRaw()` instead, or the tombstones are lost before they can sync.
- User-facing writes send `NOTA_NOTES_CHANGED`, which starts a debounced sync. The sync engine's own write-back passes `{ silent: true }` so it doesn't trigger itself.
- Duplicates are matched by `normalizeText`, not by ID, both when saving and on import, because IDs don't survive CSV or spreadsheet edits. Open popups re-render through `chrome.storage.onChanged`.

**Sync** (`lib/sync/`): sync can be off, use Chrome Sync, or use Google Drive, set by `settings.syncBackend`.
- A sync runs when a note changes (debounced through an alarm), every 15 minutes, or when the user clicks Sync now. `engine.js` makes every trigger share one in-flight run.
- Each run pulls from the active backend, merges with the local copy, saves the result locally, and pushes it back. On a `CONCURRENT_WRITE` error it pulls, merges and pushes once more.
- `merge.js` is a pure function: for each note, whichever copy has the newer `updatedAt` wins. Tombstones older than 30 days are purged.
- `chromeSyncBackend.js` gzips and base64-encodes the notes, then splits them across hashed buckets (`hash.js`) to stay inside `chrome.storage.sync` quotas.
- `driveBackend.js` stores one gzipped file in Drive's `appDataFolder` and uses `chrome.identity` with the OAuth client in `manifest.json`. The manifest `key` keeps the extension ID stable so that the OAuth client matches.

## Gotchas

- `README.md`'s "How it works" section still says there is no sync backend, which is out of date. Trust the code.
