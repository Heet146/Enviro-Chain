'use strict';

// ── Centralised configuration ────────────────────────────────────────────────
// All runtime settings come from .env — nothing is hardcoded here.

module.exports = {
  // Fallback location when the device has no GPS fix and the browser
  // hasn't pushed a location yet. Override via .env (DEFAULT_LAT / DEFAULT_LNG).
  DEFAULT_LOCATION: {
    lat: parseFloat(process.env.DEFAULT_LAT) || 19.072836, // KJ Somaiya
    lng: parseFloat(process.env.DEFAULT_LNG) || 72.899803,
  },

  MQTT: {
    broker: process.env.MQTT_BROKER,
    topic:  process.env.MQTT_TOPIC,
  },

  FEATURES: {
    // Set IPFS_ENABLED=false in .env to skip IPFS uploads (e.g. CI / offline dev)
    ipfsEnabled: process.env.IPFS_ENABLED !== 'false',

    // Polygon is considered enabled when all three env vars are present
    polygonEnabled: !!(
      process.env.POLYGON_RPC_URL &&
      process.env.POLYGON_PRIVATE_KEY &&
      process.env.ANCHOR_CONTRACT_ADDRESS
    ),
  },
};
