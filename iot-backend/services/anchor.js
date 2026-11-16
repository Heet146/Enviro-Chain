'use strict';

// ── Anchor Service ──────────────────────────────────────────────────────────
//
// Runs an hourly job that:
//   1. Reads the last N blocks from Firebase
//   2. Builds a manifest JSON of all { seq, hash, ipfsCID } entries
//   3. Uploads the manifest to IPFS → gets manifestCID
//   4. Stores manifestCID on Polygon (CIDRegistry contract)
//   5. Records the anchor record in Firebase for dashboard visibility
//
// This creates a verifiable, tamper-evident audit trail:
//   Polygon → IPFS manifest → individual IPFS blocks → ESP32 hashes
//
// If Polygon is not configured (.env missing), the job logs a warning
// and skips the on-chain step (graceful degradation for dev environments).

const { uploadToIPFS }   = require('./ipfs');
const { storeCID, isConfigured } = require('./polygon');

const ANCHOR_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const ANCHOR_BATCH_SIZE  = 500;             // blocks per manifest

/**
 * createHourlyAnchor(db)
 *
 * Main anchor job. Called on startup and every hour thereafter.
 * Non-fatal: errors are logged but do not crash the server.
 *
 * @param  {FirebaseDatabase} db — admin.database() instance
 * @returns {Promise<{ manifestCID, txHash }|null>}
 */
async function createHourlyAnchor(db) {
  console.log('[Anchor] Job started');
  const startedAt = Date.now();

  try {
    // ── Step 1: Fetch last N blocks from Firebase ────────────────────────
    const snapshot = await db.ref('blocks')
      .orderByChild('seq')
      .limitToLast(ANCHOR_BATCH_SIZE)
      .once('value');

    const blocks = [];
    snapshot.forEach(child => blocks.push(child.val()));

    if (blocks.length === 0) {
      console.log('[Anchor] No blocks in Firebase — skipping');
      return null;
    }

    // ── Step 2: Extract blocks that have been uploaded to IPFS ───────────
    const cidEntries = blocks
      .filter(b => b.ipfsCID && b.hash && typeof b.seq === 'number')
      .map(b => ({ seq: b.seq, hash: b.hash, cid: b.ipfsCID }))
      .sort((a, b) => a.seq - b.seq);

    if (cidEntries.length === 0) {
      console.log('[Anchor] No blocks with ipfsCID yet — IPFS upload may be pending');
      return null;
    }

    // ── Step 3: Build manifest ───────────────────────────────────────────
    const manifest = {
      schemaVersion: 1,
      anchoredAt:    startedAt,
      blockCount:    cidEntries.length,
      seqRange:      { first: cidEntries[0].seq, last: cidEntries[cidEntries.length - 1].seq },
      blockCIDs:     cidEntries,   // [{ seq, hash, cid }, ...]
    };

    // ── Step 4: Upload manifest to IPFS ──────────────────────────────────
    const manifestCID = await uploadToIPFS(manifest);
    console.log(`[Anchor] Manifest (${cidEntries.length} blocks) → IPFS CID: ${manifestCID}`);

    // ── Step 5: Anchor manifestCID on Polygon ────────────────────────────
    let txHash = null;
    if (isConfigured()) {
      txHash = await storeCID(manifestCID);
      console.log(`[Anchor] Anchored on Polygon | TX: ${txHash}`);
    } else {
      console.warn('[Anchor] Polygon not configured — skipping on-chain anchor (set POLYGON_RPC_URL, POLYGON_PRIVATE_KEY, ANCHOR_CONTRACT_ADDRESS)');
    }

    // ── Step 6: Record anchor in Firebase for dashboard ──────────────────
    await db.ref('anchors').push({
      manifestCID,
      txHash:       txHash ?? null,
      blockCount:   cidEntries.length,
      seqRange:     manifest.seqRange,
      anchoredAt:   startedAt,
      durationMs:   Date.now() - startedAt,
      onChain:      txHash !== null,
    });

    console.log(`[Anchor] Done in ${Date.now() - startedAt}ms`);
    return { manifestCID, txHash };

  } catch (err) {
    // Non-fatal — log and continue. Next run will catch up.
    console.error('[Anchor] Job failed (non-fatal):', err.message);
    return null;
  }
}

/**
 * startAnchorScheduler(db)
 *
 * Starts the hourly anchor job. Runs once immediately on startup,
 * then on ANCHOR_INTERVAL_MS intervals.
 *
 * @param  {FirebaseDatabase} db
 * @returns {NodeJS.Timeout} interval handle (for cleanup if needed)
 */
function startAnchorScheduler(db) {
  // Delay first run by 30 s to let the server fully initialise
  setTimeout(() => createHourlyAnchor(db), 30_000);

  const id = setInterval(() => createHourlyAnchor(db), ANCHOR_INTERVAL_MS);
  console.log(`[Anchor] Scheduler started — interval: ${ANCHOR_INTERVAL_MS / 60_000} min`);
  return id;
}

module.exports = { createHourlyAnchor, startAnchorScheduler };
