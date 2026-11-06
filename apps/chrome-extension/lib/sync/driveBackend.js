// Google Drive backend: stores one gzip+base64 JSON file in the user's
// hidden appDataFolder via chrome.identity OAuth + raw fetch() (no SDK, to
// avoid MV3's remote-code restriction and keep the project dependency-free).

const NOTA_DRIVE_FILENAME = 'nota-sync.json.gz';

function getToken({ interactive }) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: !!interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(Object.assign(new Error(chrome.runtime.lastError?.message || 'No token'), { code: 'NEEDS_REAUTH' }));
        return;
      }
      resolve(token);
    });
  });
}

function invalidateToken(token) {
  return new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}

async function notaDriveFetch(url, token, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    await invalidateToken(token);
    throw Object.assign(new Error('Drive auth expired'), { code: 'NEEDS_REAUTH' });
  }
  if (!res.ok) {
    throw new Error(`Drive request failed (${res.status})`);
  }
  return res;
}

async function findFile(token) {
  const query = `name='${NOTA_DRIVE_FILENAME}' and trashed=false`;
  const url =
    'https://www.googleapis.com/drive/v3/files' +
    `?spaces=appDataFolder&q=${encodeURIComponent(query)}` +
    '&fields=files(id,headRevisionId)&pageSize=1';
  const res = await notaDriveFetch(url, token);
  const data = await res.json();
  return (data.files && data.files[0]) || null;
}

async function pull() {
  const token = await getToken({ interactive: false });
  const file = await findFile(token);
  if (!file) return { notes: [], fileId: null, headRevisionId: null };
  const res = await notaDriveFetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
    token
  );
  const base64Text = await res.text();
  const notes = await self.NotaCompression.gunzipFromBase64(base64Text);
  return { notes, fileId: file.id, headRevisionId: file.headRevisionId };
}

async function createFile(token, payload) {
  const boundary = 'nota-sync-boundary';
  const metadata = { name: NOTA_DRIVE_FILENAME, parents: ['appDataFolder'] };
  const body =
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain\r\n\r\n${payload}\r\n--${boundary}--`;
  await notaDriveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', token, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function push(mergedNotes, { fileId, headRevisionId } = {}) {
  const token = await getToken({ interactive: false });
  const payload = await self.NotaCompression.gzipToBase64(mergedNotes);

  if (!fileId) {
    await createFile(token, payload);
    return;
  }

  // Optimistic-concurrency check against another device's concurrent write.
  const fresh = await notaDriveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=headRevisionId`,
    token
  ).then((r) => r.json());
  if (fresh.headRevisionId !== headRevisionId) {
    throw Object.assign(new Error('Remote changed concurrently'), { code: 'CONCURRENT_WRITE' });
  }

  await notaDriveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'text/plain' },
    body: payload,
  });
}

self.NotaDriveBackend = { pull, push, getToken };
