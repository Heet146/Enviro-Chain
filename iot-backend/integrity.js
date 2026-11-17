// iot-backend/integrity.js
const crypto = require('crypto');

async function verifyChain(db) {
  const snapshot = await db.ref('blocks')
    .orderByChild('seq').once('value');

  const blocks = [];
  snapshot.forEach(child => {
    blocks.push(child.val());
  });

  if (blocks.length === 0) {
    return { status: 'NO_DATA', message: 'No blocks stored yet', totalBlocks: 0 };
  }

  let verified = 0;
  let tampered = 0;
  let hashMismatches = 0;
  let chainBreaks = 0;
  const issues = [];

  // Treat the first block still present in Firebase as the local chain anchor.
  // Its payload hash is verified, but its predecessor is not required to be
  // present (it may predate retention or a database cleanup).
  let expectedPrev = blocks[0].prev; // start from whatever the first block claims

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // ── Re-build the EXACT same object that was hashed on the ESP32 ──────────
    // Field order MUST match the Arduino serializeJson() output (insertion order).
    const toHash = {
      seq:       block.seq,
      nodeId:    block.nodeId,
      ts:        block.ts,
      temp:      block.temp,
      hum:       block.hum,
      co:        block.co,
      pm25:      block.pm25,
      pm10:      block.pm10,
      lat:       block.lat,
      lng:       block.lng,
      alt:       block.alt,
      gpsFix:    block.gpsFix,
      gpsSource: block.gpsSource, // included in ESP32 serializeJson before hashing
      prev:      block.prev
    };

    const payloadStr = JSON.stringify(toHash);
    const recomputed = crypto
      .createHash('sha256')
      .update(payloadStr)
      .digest('hex');

    if (recomputed !== block.hash) {
      // The block's payload was altered after it left the ESP32
      tampered++;
      hashMismatches++;
      issues.push({
        seq:     block.seq,
        reason:  'Hash mismatch — data was changed after storage',
        expected: recomputed.substring(0, 16) + '...',
        stored:   block.hash ? block.hash.substring(0, 16) + '...' : 'missing'
      });
    } else if (block.prev !== expectedPrev) {
      // A block is missing between this one and the previous stored block
      tampered++;
      chainBreaks++;
      issues.push({
        seq:    block.seq,
        reason: 'Chain broken — a block was deleted or reordered',
        missingPrevHash: block.prev
      });
    } else {
      verified++;
    }

    expectedPrev = block.hash;
  }

  return {
    status:         hashMismatches > 0 ? 'COMPROMISED' : chainBreaks > 0 ? 'CHAIN_BROKEN' : 'INTACT',
    totalBlocks:    blocks.length,
    verified,
    tampered,
    hashMismatches,
    chainBreaks,
    integrityScore: ((verified / blocks.length) * 100).toFixed(1) + '%',
    issues
  };
}

module.exports = { verifyChain };
