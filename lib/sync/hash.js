// Deterministic string hashing for bucket assignment (not security-sensitive,
// just used to partition notes across chrome.storage.sync keys).

function notaHashBucket(id, bucketCount) {
  // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % bucketCount;
}

self.NotaHash = { bucket: notaHashBucket };
