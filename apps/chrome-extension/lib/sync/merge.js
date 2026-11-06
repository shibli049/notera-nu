// Pure, idempotent merge of two note arrays (local raw vs remote raw,
// tombstones included). Safe to call redundantly from concurrent trigger
// sources (debounce, periodic alarm, manual button) since it never depends
// on which side is "mine" vs "theirs" beyond updatedAt comparison.

const NOTA_TOMBSTONE_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function notaMergeNotes(localRaw, remoteRaw, { now = Date.now() } = {}) {
  const byId = new Map();
  for (const n of localRaw) byId.set(n.id, n);

  for (const rn of remoteRaw) {
    const ln = byId.get(rn.id);
    if (!ln) {
      byId.set(rn.id, rn); // remote-only note (created on another device): adopt
      continue;
    }
    const lt = new Date(ln.updatedAt).getTime();
    const rt = new Date(rn.updatedAt).getTime();
    if (rt > lt) {
      // Remote strictly newer wins. One rule covers edit-vs-edit,
      // edit-vs-delete, and delete-vs-delete, because a delete is just an
      // update that sets deletedAt and bumps updatedAt.
      byId.set(rn.id, rn);
    } else if (rt === lt && rn.id < ln.id) {
      // Exact tie (clock skew): deterministic tiebreak so every device
      // converges on the same winner independently.
      byId.set(rn.id, rn);
    }
    // else: local already newer, or wins the tie — keep ln (already in map).
  }

  const merged = [];
  const purgedIds = [];
  for (const n of byId.values()) {
    if (n.deletedAt && now - new Date(n.deletedAt).getTime() > NOTA_TOMBSTONE_GRACE_MS) {
      purgedIds.push(n.id);
      continue;
    }
    merged.push(n);
  }
  return { merged, purgedIds };
}

self.NotaMerge = { mergeNotes: notaMergeNotes, TOMBSTONE_GRACE_MS: NOTA_TOMBSTONE_GRACE_MS };
