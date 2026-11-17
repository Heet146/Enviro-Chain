'use strict';

// ── MQTT Block Handler ───────────────────────────────────────────────────────
//
// handleIncomingBlock() is the single entry point for every block received
// from the ESP32 via MQTT. It owns:
//   1. IPFS upload  — original block only, BEFORE enrichment
//   2. Location enrichment — derived fields appended, originals never modified
//   3. Firebase writes     — blocks/ and nodes/
//   4. WebSocket broadcast — to all connected dashboards
//
// CRITICAL RULE: block.lat, block.lng, block.hash, block.prev are NEVER
// modified. Only effectiveLat / effectiveLng / locationSource / ipfsCID
// are appended. Hash-chain integrity relies on this contract.

const { uploadToIPFS }        = require('../services/ipfs');
const { getEffectiveLocation } = require('../services/location');
const { verifyChain }          = require('../integrity');
const log                     = require('../logger');
const { FEATURES }            = require('../config');

/**
 * Process one incoming MQTT block end-to-end.
 *
 * @param {object} block                           — parsed JSON from MQTT
 * @param {object} ctx
 * @param {FirebaseDatabase}              ctx.db
 * @param {function}                      ctx.broadcast
 * @param {{ lat: number|null, lng: number|null }} ctx.browserLocation
 */
async function handleIncomingBlock(block, { db, broadcast, browserLocation }) {
  // ── Step 1: IPFS upload ───────────────────────────────────────────────────
  // Upload the raw block BEFORE any enrichment so the CID cryptographically
  // represents the original device payload. Non-fatal if IPFS is unavailable.
  let ipfsCID = null;
  if (FEATURES.ipfsEnabled) {
    try {
      ipfsCID = await uploadToIPFS(block);
      log.info(`Block #${block.seq} | IPFS CID: ${ipfsCID}`);
    } catch (err) {
      log.warn(`Block #${block.seq} | IPFS upload failed (non-fatal): ${err.message}`);
    }
  }

  // ── Step 2: Location enrichment ───────────────────────────────────────────
  const { lat: effectiveLat, lng: effectiveLng, source: locationSource } =
    getEffectiveLocation(block, browserLocation);

  log.info(
    `Block #${block.seq} | location: ${locationSource} → ` +
    `${effectiveLat.toFixed(5)}, ${effectiveLng.toFixed(5)}`
  );

  // Location assignments are administration metadata, separate from the
  // device payload, so they do not alter the block's hash-chain fields.
  const nodeSnapshot = await db.ref('nodes/' + block.nodeId).once('value');
  const locationId = nodeSnapshot.val()?.locationId || null;

  // ── Step 3: Firebase — persist block ─────────────────────────────────────
  // Original block fields are spread first; derived fields follow.
  // If there is ever a key collision, derived fields win — but none of
  // the derived keys (effectiveLat, effectiveLng, locationSource, ipfsCID,
  // savedAt) overlap with the device payload.
  const savedAt = Date.now();
  await db.ref('blocks/' + block.hash).set({
    ...block,
    effectiveLat,
    effectiveLng,
    locationSource,
    locationId,
    ipfsCID,   // null when IPFS unavailable — do NOT trust for recovery
    savedAt,
  });

  // ── Step 4: Firebase — update node status ─────────────────────────────────
  await db.ref('nodes/' + block.nodeId).update({
    lastSeen:      savedAt,
    lastBlock:     block.seq,
    status:        'ACTIVE',
    demo:          block.gpsSource === 'Demo simulator' || /^SIM[-_]/i.test(block.nodeId || ''),
    lat:           block.lat,
    lng:           block.lng,
    effectiveLat,
    effectiveLng,
    locationSource,
  });

  // ── Step 5: Verify chain (non-fatal) ──────────────────────────────────────
  let integrity = null;
  try {
    integrity = await verifyChain(db);
  } catch (err) {
    log.warn(`Block #${block.seq} | integrity check failed (non-fatal): ${err.message}`);
  }

  // ── Step 6: Broadcast to dashboards ──────────────────────────────────────
  broadcast({
    type:  'NEW_BLOCK',
    block: { ...block, effectiveLat, effectiveLng, locationSource, locationId, ipfsCID, savedAt },
    integrity,
  });
}

module.exports = { handleIncomingBlock };
