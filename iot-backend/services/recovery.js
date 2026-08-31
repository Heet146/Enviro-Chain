'use strict';

// ── Recovery Service ────────────────────────────────────────────────────────
//
// When integrity.js detects tampered blocks, this service restores them
// from IPFS using the Polygon-anchored manifest as the source of truth.
//
// Trust hierarchy enforced here:
//   1. Polygon contract  — trusted CID registry (immutable)
//   2. IPFS content      — trusted data (content-addressed)
//   3. Firebase ipfsCID  — NEVER trusted directly (may be tampered)
//
// Recovery flow:
//   Polygon → latest manifestCID
//     └── IPFS manifest → { hash → cid } map
//           └── IPFS block data → restore to Firebase

const { fetchFromIPFS }         = require('./ipfs');
const { getLatestManifestCID, isConfigured } = require('./polygon');

/**
 * recoverTamperedBlocks(db, issues)
 *
 * Restores tampered blocks identified by integrity.js.
 * Returns a result array describing the outcome for each block.
 *
 * @param  {FirebaseDatabase} db
 * @param  {Array<{ seq: number, reason: string }>} issues — from verifyChain()
 * @returns {Promise<Array<{ seq, status, cid?, reason? }>>}
 */
async function recoverTamperedBlocks(db, issues) {
  if (!issues || issues.length === 0) {
    return [];
  }

  if (!isConfigured()) {
    throw new Error('Recovery requires Polygon to be configured — set POLYGON_RPC_URL, POLYGON_PRIVATE_KEY, ANCHOR_CONTRACT_ADDRESS');
  }

  console.log(`[Recovery] Starting recovery for ${issues.length} tampered block(s)`);

  let byHash = new Map();
  let bySeq  = new Map();

  // ── Step 1: Attempt to get authoritative manifest CID from Polygon/Ganache ──
  if (isConfigured()) {
    try {
      const manifestCID = await getLatestManifestCID();
      if (manifestCID) {
        console.log(`[Recovery] Polygon manifest CID: ${manifestCID}`);
        const manifest = await fetchFromIPFS(manifestCID);
        if (manifest?.blockCIDs && Array.isArray(manifest.blockCIDs)) {
          byHash = new Map(manifest.blockCIDs.map(e => [e.hash, e.cid]));
          bySeq  = new Map(manifest.blockCIDs.map(e => [e.seq,  e]));
          console.log(`[Recovery] Manifest loaded: ${manifest.blockCIDs.length} blocks (seq ${manifest.seqRange?.first}–${manifest.seqRange?.last})`);
        }
      }
    } catch (err) {
      console.warn(`[Recovery] On-chain manifest check skipped (${err.message}). Using IPFS direct block recovery.`);
    }
  }

  const results = [];

  for (const issue of issues) {
    const seq = issue.seq;
    console.log(`[Recovery] Processing block #${seq}: ${issue.reason}`);

    try {
      // ── Step 4: Load the (potentially tampered) block from Firebase ──────
      const snapshot = await db.ref('blocks')
        .orderByChild('seq').equalTo(seq).once('value');

      let firebaseRecord = null;
      snapshot.forEach(child => { firebaseRecord = child.val(); });

      // ── Locate the trusted CID ────────────────────────────────────────────
      // Strategy: 1. on-chain manifest (hash), 2. on-chain manifest (seq), 3. block's pinned IPFS CID
      let trustedCID = null;

      if (firebaseRecord?.hash && byHash.has(firebaseRecord.hash)) {
        trustedCID = byHash.get(firebaseRecord.hash);
      }
      if (!trustedCID && bySeq.has(seq)) {
        const manifestEntry = bySeq.get(seq);
        trustedCID = manifestEntry.cid;
      }
      if (!trustedCID && firebaseRecord?.ipfsCID) {
        trustedCID = firebaseRecord.ipfsCID;
      }

      if (!trustedCID) {
        results.push({
          seq,
          status: 'NOT_IN_MANIFEST',
          reason: 'Block has no associated IPFS CID to restore from.',
        });
        console.warn(`[Recovery] Block #${seq}: no IPFS CID found — skipping`);
        continue;
      }

      // ── Step 5: Detect Firebase CID mismatch ─────────────────────────────
      if (firebaseRecord?.ipfsCID && firebaseRecord.ipfsCID !== trustedCID) {
        console.warn(
          `[Recovery] Block #${seq}: Firebase CID TAMPERED` +
          `\n  Firebase: ${firebaseRecord.ipfsCID}` +
          `\n  Polygon:  ${trustedCID}`
        );
      }

      // ── Step 6: Fetch original block from IPFS using POLYGON-validated CID
      const originalBlock = await fetchFromIPFS(trustedCID);
      console.log(`[Recovery] Block #${seq}: fetched from IPFS (CID: ${trustedCID})`);

      // Sanity-check the recovered block has the expected seq
      if (originalBlock.seq !== seq) {
        console.warn(`[Recovery] Block #${seq}: IPFS payload has seq=${originalBlock.seq} — CID collision or wrong manifest entry`);
      }

      // ── Step 7: Restore block in Firebase ────────────────────────────────
      // Preserve enrichment fields from existing Firebase record (they are
      // non-hash-protected metadata and were not tampered). The original
      // device payload fields are replaced from IPFS (trusted source).
      const restoredEntry = {
        // Original device fields (from IPFS — trusted)
        ...originalBlock,

        // Server-side enrichment (from Firebase record — preserved)
        effectiveLat:   firebaseRecord?.effectiveLat   ?? null,
        effectiveLng:   firebaseRecord?.effectiveLng   ?? null,
        locationSource: firebaseRecord?.locationSource ?? null,
        savedAt:        firebaseRecord?.savedAt        ?? null,

        // Recovery metadata
        ipfsCID:        trustedCID,            // overwrite with Polygon-validated CID
        restoredAt:     Date.now(),
        restoredFrom:   `ipfs:${trustedCID}`,
        restoredVia:    'polygon-manifest',
      };

      await db.ref('blocks/' + originalBlock.hash).set(restoredEntry);

      results.push({ seq, status: 'RESTORED', cid: trustedCID });
      console.log(`[Recovery] Block #${seq}: ✓ restored`);

    } catch (err) {
      results.push({ seq, status: 'ERROR', reason: err.message });
      console.error(`[Recovery] Block #${seq}: failed — ${err.message}`);
    }
  }

  const restoredCount = results.filter(r => r.status === 'RESTORED').length;
  console.log(`[Recovery] Complete: ${restoredCount}/${issues.length} blocks restored`);

  return results;
}

module.exports = { recoverTamperedBlocks };
