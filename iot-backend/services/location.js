'use strict';

// ── Location Service ─────────────────────────────────────────────────────────
//
// Determines the best available location for a block without touching any
// original block fields — hash-chain integrity is preserved.
// Priority:
//   1. Device GPS  (when hardware/phone GPS fix is valid on the device)
//   2. Browser GPS (when live browser location is pushed to the backend)
//   3. Default     (configured fallback from config.js / .env)

const { DEFAULT_LOCATION } = require('../config');

/**
 * Pick the best available location for a block.
 * NEVER modifies block.lat, block.lng, block.hash, block.prev.
 * Only produces derived fields to be appended alongside the original block.
 *
 * @param {object} block                             — raw block from MQTT
 * @param {{ lat: number|null, lng: number|null }} browserLocation
 * @returns {{ lat: number, lng: number, source: 'device'|'browser'|'default' }}
 */
function getEffectiveLocation(block, browserLocation) {
  const deviceValid =
    block.gpsFix === true &&
    typeof block.lat === 'number' &&
    block.lat !== 0;

  if (deviceValid) {
    return { lat: block.lat, lng: block.lng, source: 'device' };
  }

  const browserValid =
    browserLocation &&
    typeof browserLocation.lat === 'number' &&
    browserLocation.lat !== 0 &&
    typeof browserLocation.lng === 'number' &&
    browserLocation.lng !== 0;

  if (browserValid) {
    return {
      lat: parseFloat(browserLocation.lat.toFixed(6)),
      lng: parseFloat(browserLocation.lng.toFixed(6)),
      source: 'browser',
    };
  }

  return {
    lat: DEFAULT_LOCATION.lat,
    lng: DEFAULT_LOCATION.lng,
    source: 'default',
  };
}

module.exports = { getEffectiveLocation };

