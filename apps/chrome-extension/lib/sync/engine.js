// Orchestrates a sync cycle: pull remote, merge with local, write back
// locally, push merged result to the active backend. Serializes concurrent
// callers (debounce message, periodic alarm, manual button) onto one
// in-flight promise so they never race each other.

const NOTA_SYNC_STATE_KEY = 'nota_sync_state';

let notaSyncPromise = null;

function notaGetBackendModule(name) {
  return name === 'drive' ? self.NotaDriveBackend : self.NotaChromeSyncBackend;
}

function notaNotesFingerprint(notes) {
  // Cheap "did anything change" check — not a deep equal, just id+updatedAt pairs.
  return notes.map((n) => n.id + ':' + n.updatedAt).sort().join('|');
}

async function notaSetSyncState(patch) {
  const result = await chrome.storage.local.get(NOTA_SYNC_STATE_KEY);
  const current = result[NOTA_SYNC_STATE_KEY] || {};
  await chrome.storage.local.set({ [NOTA_SYNC_STATE_KEY]: { ...current, ...patch } });
}

async function notaGetSyncState() {
  const result = await chrome.storage.local.get(NOTA_SYNC_STATE_KEY);
  return result[NOTA_SYNC_STATE_KEY] || {};
}

async function notaRunSyncInner() {
  const settings = await self.NotaStorage.getSettings();
  if (settings.syncBackend === 'off') return { ok: true, skipped: true };
  const backend = notaGetBackendModule(settings.syncBackend);
  const isDrive = settings.syncBackend === 'drive';

  try {
    const localRaw = await self.NotaStorage.getAllNotesRaw();
    const pulled = isDrive ? await backend.pull() : { notes: await backend.pull() };
    const remoteRaw = pulled.notes;

    const { merged } = self.NotaMerge.mergeNotes(localRaw, remoteRaw);
    if (notaNotesFingerprint(localRaw) !== notaNotesFingerprint(merged)) {
      await self.NotaStorage.saveAllNotes(merged, { silent: true });
    }

    let pushResult;
    try {
      pushResult = isDrive
        ? await backend.push(merged, { fileId: pulled.fileId, headRevisionId: pulled.headRevisionId })
        : await backend.push(merged);
    } catch (err) {
      if (err.code === 'CONCURRENT_WRITE') {
        const rePulled = await backend.pull();
        const { merged: reMerged } = self.NotaMerge.mergeNotes(merged, rePulled.notes);
        await self.NotaStorage.saveAllNotes(reMerged, { silent: true });
        pushResult = await backend.push(reMerged, { fileId: rePulled.fileId, headRevisionId: rePulled.headRevisionId });
      } else {
        throw err;
      }
    }

    await notaSetSyncState({
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      needsReauth: false,
      backend: settings.syncBackend,
      quotaWarning: !!(pushResult && pushResult.quotaWarning),
      bytesInUse: pushResult && pushResult.bytesInUse,
    });
    return { ok: true };
  } catch (err) {
    await notaSetSyncState({
      lastError: err.message || String(err),
      needsReauth: err.code === 'NEEDS_REAUTH',
    });
    return { ok: false, error: err.message || String(err) };
  }
}

function notaRunSync(_opts = {}) {
  if (notaSyncPromise) return notaSyncPromise;
  notaSyncPromise = notaRunSyncInner().finally(() => {
    notaSyncPromise = null;
  });
  return notaSyncPromise;
}

self.NotaSyncEngine = { runSync: notaRunSync, getSyncState: notaGetSyncState };
