// chrome.storage.sync backend: hash-buckets notes across a fixed number of
// keys and gzip+base64-compresses each bucket, to survive sync's per-item
// (8KB), total (100KB), and item-count (512) quotas as the note collection
// grows, while only rewriting buckets whose contents actually changed.

const NOTA_SYNC_BUCKET_COUNT = 400;
const NOTA_SYNC_SCHEMA_VERSION = 1;
const NOTA_SYNC_MANIFEST_KEY = 'nota_sync_manifest';
const NOTA_SYNC_CHECKSUMS_KEY = 'nota_sync_bucket_checksums'; // local only, not synced
const NOTA_SYNC_MAX_BUCKETS_PER_CYCLE = 50; // spreads large rewrites across cycles
const NOTA_SYNC_BUCKET_BYTE_LIMIT = 7800; // headroom under the 8192 per-item cap

function notaCheapChecksum(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h + ':' + str.length;
}

async function pull() {
  const manifestResult = await chrome.storage.sync.get(NOTA_SYNC_MANIFEST_KEY);
  const manifest = manifestResult[NOTA_SYNC_MANIFEST_KEY];
  if (!manifest) return []; // nothing remote yet

  let bucketIndices;
  if (manifest.schemaVersion !== NOTA_SYNC_SCHEMA_VERSION || manifest.bucketCount !== NOTA_SYNC_BUCKET_COUNT) {
    // Schema/bucket-count mismatch: don't trust populatedBuckets from the old
    // scheme, scan every possible bucket key instead.
    bucketIndices = Array.from({ length: NOTA_SYNC_BUCKET_COUNT }, (_, i) => i);
  } else {
    bucketIndices = manifest.populatedBuckets || [];
  }
  if (bucketIndices.length === 0) return [];

  const keys = bucketIndices.map((i) => `nchunk_${i}`);
  const stored = await chrome.storage.sync.get(keys);
  const notes = [];
  for (const key of keys) {
    if (!stored[key]) continue;
    const bucketNotes = await self.NotaCompression.gunzipFromBase64(stored[key]);
    notes.push(...bucketNotes);
  }
  return notes;
}

async function push(mergedNotes) {
  const buckets = new Map(); // bucketIndex -> notes[]
  for (const n of mergedNotes) {
    const idx = self.NotaHash.bucket(n.id, NOTA_SYNC_BUCKET_COUNT);
    if (!buckets.has(idx)) buckets.set(idx, []);
    buckets.get(idx).push(n);
  }

  const checksumResult = await chrome.storage.local.get(NOTA_SYNC_CHECKSUMS_KEY);
  const checksums = checksumResult[NOTA_SYNC_CHECKSUMS_KEY] || {};
  const nextChecksums = { ...checksums };
  const toSet = {};
  const toRemove = [];
  let touched = 0;
  let anyBucketDropped = false;
  let deferredToNextCycle = false;

  const prevManifestResult = await chrome.storage.sync.get(NOTA_SYNC_MANIFEST_KEY);
  const prevPopulated = new Set((prevManifestResult[NOTA_SYNC_MANIFEST_KEY] || {}).populatedBuckets || []);

  for (const [idx, notes] of buckets) {
    if (touched >= NOTA_SYNC_MAX_BUCKETS_PER_CYCLE) {
      deferredToNextCycle = true;
      break; // defer the rest to next cycle
    }

    let payload = await self.NotaCompression.gzipToBase64(notes);
    if (payload.length > NOTA_SYNC_BUCKET_BYTE_LIMIT) {
      // Bucket too large for the per-item quota (e.g. an oversized grammar
      // table landed here). Degrade gracefully: drop grammar data from this
      // bucket's notes rather than aborting the whole sync cycle.
      const stripped = notes.map((n) => ({ ...n, grammar: null }));
      const strippedPayload = await self.NotaCompression.gzipToBase64(stripped);
      if (strippedPayload.length > NOTA_SYNC_BUCKET_BYTE_LIMIT) {
        anyBucketDropped = true;
        continue; // give up on this bucket this cycle
      }
      payload = strippedPayload;
    }

    const checksum = notaCheapChecksum(payload);
    if (checksums[idx] === checksum) continue; // unchanged, skip write
    toSet[`nchunk_${idx}`] = payload;
    nextChecksums[idx] = checksum;
    touched++;
  }

  for (const idx of prevPopulated) {
    if (!buckets.has(idx)) {
      toRemove.push(`nchunk_${idx}`);
      delete nextChecksums[idx];
    }
  }

  if (Object.keys(toSet).length) await chrome.storage.sync.set(toSet);
  if (toRemove.length) await chrome.storage.sync.remove(toRemove);

  const manifest = {
    schemaVersion: NOTA_SYNC_SCHEMA_VERSION,
    bucketCount: NOTA_SYNC_BUCKET_COUNT,
    populatedBuckets: [...buckets.keys()],
    lastPushedAt: new Date().toISOString(),
  };
  await chrome.storage.sync.set({ [NOTA_SYNC_MANIFEST_KEY]: manifest });
  await chrome.storage.local.set({ [NOTA_SYNC_CHECKSUMS_KEY]: nextChecksums });

  const bytesInUse = await chrome.storage.sync.getBytesInUse(null);
  const quota = chrome.storage.sync.QUOTA_BYTES;
  return {
    bytesInUse,
    quota,
    quotaWarning: bytesInUse >= 0.85 * quota,
    incomplete: anyBucketDropped || deferredToNextCycle,
  };
}

self.NotaChromeSyncBackend = { pull, push };
