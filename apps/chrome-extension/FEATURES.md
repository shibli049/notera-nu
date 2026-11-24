# Features

A reference list of everything Notera Nu currently does, grouped by area.

## Capturing notes

- **Select-to-note** — highlighting text on any page shows a floating `+` button next to the selection; clicking it opens a note editor card anchored to that spot.
- **Context menu entry** — right-clicking a selection offers "Add Notera Nu note for…" as an alternative to the floating button, opening the same editor card.
- **Keyboard shortcut** — `Alt+Shift+N` (configurable at `chrome://extensions/shortcuts`) opens the same editor card for the current selection; with no selection, or on pages the extension can't run on, it opens the word-list popup instead. Settings shows the current binding with a "Change…" link.
- **Duplicate detection** — saving a note for text that already has one shows a conflict view with the existing note, letting the user **override** it, **add a separate entry** instead, or go back to editing.
- **Toast confirmations** — a small toast near the selection confirms "Saved!" / "Updated!", or reports an error (e.g. after an extension update invalidates the page's content script, prompting a page refresh).
- Each note stores its selected text, the user's note, the source page's title and URL, and creation/update timestamps.

## Translation suggestions

- **On-demand and automatic translation**: opening the note editor automatically translates the selection on-device with Chrome's built-in Language Detector and Translator APIs (Chrome 138+), and pre-fills the note if it's empty. A "Suggest translation" button re-runs it manually. That click is also needed the first time a language pair's model has to be downloaded.
- **Assumed source language**: if detection confidence is below 0.7 (common for single words), the selection is treated as the configured assumed language (Swedish by default, configurable in settings). The card shows `(assumed)` when this happens.
- **Preferred language for similar languages**: closely related languages (Swedish/Danish/Norwegian, Spanish/Portuguese, Czech/Slovak, ...) often score close together. If the preferred (assumed) language is among the detector's candidates with at least 25% of the top guess's confidence, it is used instead, and the card shows `(preferred)`. (Confidences sum to at most 1 and this only applies when the top guess is ≥ 0.7, so the ratio can't usefully exceed ~43%.)
- **Detection scores (debug)**: when "Show debug tools" is on in Settings (off by default), a "Scores" button next to the "From" picker shows the detector's score for each candidate language, which one was used and why, and the current thresholds.
- **"From" language picker**: after a translation, the note card shows the source language in a dropdown (detected candidates first, then common languages). Picking a different one re-translates the selection from that language.
- **Graceful failure**: if the APIs are missing, the language pair is unsupported, or anything else fails, the note is pre-filled with the original text and the user can type whatever they want.
- **Configurable target language** — a settings dropdown covers 20 common languages, plus a custom ISO 639-1 code entry for anything else.
- **Toggle on/off** — translation suggestions can be disabled entirely in settings (enabled by default); when off, the translate button, status, and warning are hidden from the note editor and no request is made.
- An in-editor and in-settings note says that translations are machine-generated on-device and should be double-checked.

## Swedish grammar lookup

- **Automatic single-word lookup**: when a translated selection is detected (or assumed) as Swedish and is a single word, its grammar/inflection table is fetched automatically and shown in the note editor.
- **Manual re-lookup from the notes list** — a "Grammar" button appears on any single-word note that doesn't yet have grammar data, fetching it on demand.
- Covers **nouns, verbs, adjectives, and adverbs**, showing the relevant inflected forms (e.g. singular/plural, definite/indefinite, tense) and a link to look the word up on [SAOL](https://svenska.se/saol/).
- Sourced live from Språkbanken Text's Karp API (`saldom` resource, CC BY 4.0) — nothing is bundled or redistributed; multi-word entries and idioms are filtered out.
- **Toggle on/off** — disabled by default. When off, the grammar box/button is hidden everywhere (note editor and notes list) but any grammar data already saved on a note is left untouched in storage.
- **Clear grammar** — a "Clear grammar" action on any note with saved grammar data removes just that data (keeping the rest of the note), and re-reveals the manual lookup button for single-word notes.

## Notes manager (popup)

- **List, search, and filter** — the popup lists all saved notes with live search across both the selected text and the note body.
- **Alphabetical sorting and pagination** — notes are sorted alphabetically by their selected text and paginated 20 per page, with prev/next controls and a page indicator; searching resets to page 1, while edits, deletes, and sync keep the reader on the current page.
- **Inline edit and delete** — edit a note's text in place, or delete it with a confirm-to-avoid-accidents step (the delete button asks for a second click within a few seconds).
- **Source link** — each note links back to the page it was captured from (falls back to the hostname if no title was captured).
- **Relative timestamps** — "just now" / "5m ago" / "3d ago", falling back to a full date after 30 days.
- **Full tab view** — an "⤢ Full view" button opens the same popup UI in a full browser tab for more room.

## Quiz mode

Available from a "🎴 Quiz" button in the full tab view (see **Full tab view** above):

- **Random flip cards** — shows one saved word at a time on a card; clicking it flips (with a 3D rotation) to reveal the note and, if present and enabled, the Swedish grammar for that entry.
- **No-repeat shuffling** — "Next word ›" draws another random word without repeating any word until every saved word has been shown once, then reshuffles.
- **Adapts to content** — the answer side emphasizes the note text over the (smaller, muted) grammar details, and centers itself when there's no grammar data to show.
- Falls back to an empty-state message if there are no saved notes yet.

## Settings

All settings live behind a "⚙ Settings" toggle in the popup header:

- **Translation**: on/off switch, target language selector, assumed-source-language selector, and an on-device translation note (all hidden together when translation is off).
- **Swedish grammar lookup**: on/off switch (see above).
- **Debug tools**: off by default. When on, the note card shows a "Scores" button with the language detector's per-language scores.
- **Sync**: backend selector and status (see below).

## Import & export

- **JSON export** — downloads all notes (including any grammar data) as a timestamped `.json` backup file.
- **CSV export** — downloads notes as a UTF-8, Excel-compatible CSV (BOM included), with grammar data JSON-encoded into its own column.
- **Import (JSON or CSV)** — merges notes from a file into the existing collection, matching duplicates by normalized text (not by id, since ids don't round-trip through spreadsheet edits) and reporting how many were added vs. skipped as duplicates.

## Sync across devices

Off by default; two backends to choose from, both driven by the same merge logic:

- **Chrome Sync** — no setup required. Notes are gzip-compressed, base64-encoded, and distributed across hashed storage buckets to stay under Chrome Sync's per-item (8KB), total (100KB), and item-count (512) quotas as the collection grows; only changed buckets are rewritten, and large rewrites are spread across multiple sync cycles.
- **Google Drive** — for larger note collections. Stores one gzip-compressed JSON file in the user's hidden Drive `appDataFolder` via `chrome.identity` OAuth (registered against a fixed extension ID, pinned in the manifest so it doesn't shift if the unpacked extension is moved or reloaded), with a bounded connect timeout and automatic re-authentication handling if the Drive token expires.
- **Conflict-free merge** — sync is last-write-wins per note (by `updatedAt`, with a deterministic id-based tiebreak on exact ties), so concurrent edits/deletes across devices always converge to the same result without user intervention.
- **Soft-deleted tombstones** — deleting a note marks it deleted rather than removing it immediately, so the deletion propagates to other devices on the next sync; tombstones are purged 30 days after deletion.
- **Automatic and manual triggers** — a periodic alarm (every 15 minutes), a debounced sync shortly after any local change, and a "Sync now" button in settings.
- **Status reporting** — last synced time, last error, a "needs reconnecting" state for expired Google auth, and a quota-warning banner when Chrome Sync storage is nearly full.

## Other

- Extension icon action opens the popup directly; its title and the browser tab title both read "Notera Nu".
- All data is stored locally in `chrome.storage.local` regardless of sync backend — sync only mirrors it, it doesn't replace local storage.
