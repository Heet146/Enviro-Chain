'use strict';

// ── IPFS Service ─────────────────────────────────────────────────────────────
//
// Supports two provider modes (set via .env):
//
//   MODE 1 — Pinata Cloud (recommended, no local daemon required)
//     IPFS_PROVIDER=pinata
//     PINATA_JWT=<your Pinata JWT from app.pinata.cloud>
//
//   MODE 2 — Local Kubo node (development, requires: ipfs daemon)
//     IPFS_PROVIDER=kubo   (or leave unset — kubo is the old default)
//     IPFS_API_URL=http://127.0.0.1:5001
//     IPFS_PROJECT_ID=     (leave blank for local node)
//     IPFS_PROJECT_SECRET= (leave blank for local node)
//
// Reads from IPFS still use a public gateway (content-addressed).
//
// Requires Node 18+ for built-in fetch, Blob, and FormData globals.

const IPFS_PROVIDER        = (process.env.IPFS_PROVIDER || 'pinata').toLowerCase();
const PINATA_JWT           = process.env.PINATA_JWT            || '';
const IPFS_API_URL         = process.env.IPFS_API_URL          || 'http://127.0.0.1:5001';
const IPFS_PROJECT_ID      = process.env.IPFS_PROJECT_ID       || '';
const IPFS_PROJECT_SECRET  = process.env.IPFS_PROJECT_SECRET   || '';
const IPFS_GATEWAY         = process.env.IPFS_GATEWAY          || 'https://gateway.pinata.cloud/ipfs';
const IPFS_TIMEOUT_MS      = parseInt(process.env.IPFS_TIMEOUT_MS) || 20_000;

// ── Timeout wrapper ──────────────────────────────────────────────────────────
function _fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), IPFS_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

// ── Provider: Pinata ─────────────────────────────────────────────────────────
// Uses https://api.pinata.cloud/pinning/pinFileToIPFS
// Requires a free account at https://app.pinata.cloud → API Keys → "New Key"
// Grants: pinFileToIPFS + pinJSONToIPFS

async function _uploadViaPinata(json) {
  if (!PINATA_JWT) {
    throw new Error(
      'Pinata JWT not set — add PINATA_JWT=<token> to .env\n' +
      '  Get a free token at https://app.pinata.cloud/keys'
    );
  }

  const body = new FormData();
  body.append(
    'file',
    new Blob([json], { type: 'application/json' }),
    'block.json'
  );
  // Optional metadata so it's searchable in Pinata dashboard
  body.append('pinataMetadata', JSON.stringify({ name: 'iot-env-block' }));

  const res = await _fetchWithTimeout(
    'https://api.pinata.cloud/pinning/pinFileToIPFS',
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      body,
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Pinata upload failed [${res.status}]: ${text}`);
  }

  const data = await res.json();
  return data.IpfsHash; // CID string
}

// ── Provider: Kubo (local daemon) ────────────────────────────────────────────
// Classic IPFS Kubo HTTP API — requires `ipfs daemon` running locally.

function _kuboAuthHeader() {
  if (!IPFS_PROJECT_ID || !IPFS_PROJECT_SECRET) return {};
  const token = Buffer.from(`${IPFS_PROJECT_ID}:${IPFS_PROJECT_SECRET}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function _uploadViaKubo(json) {
  const body = new FormData();
  body.append('file', new Blob([json], { type: 'application/json' }), 'block.json');

  const res = await _fetchWithTimeout(
    `${IPFS_API_URL}/api/v0/add?pin=true&cid-version=1`,
    { method: 'POST', headers: _kuboAuthHeader(), body }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`IPFS (Kubo) upload failed [${res.status}]: ${text}`);
  }

  // Kubo returns newline-delimited JSON; last line is the root entry
  const lines = (await res.text()).trim().split('\n');
  const entry = JSON.parse(lines[lines.length - 1]);
  return entry.Hash; // CID string
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * uploadToIPFS(data)
 *
 * Serialises `data` to JSON, pins it to IPFS, and returns the CID string.
 *
 * IMPORTANT: call with the raw MQTT block BEFORE any server-side enrichment
 * so the CID cryptographically represents the original device payload.
 *
 * @param  {object|string} data
 * @returns {Promise<string>} CID (e.g. "Qm..." or "bafy...")
 */
async function uploadToIPFS(data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data);

  if (IPFS_PROVIDER === 'pinata') {
    return _uploadViaPinata(json);
  }
  // Fall back to Kubo for any other value ('kubo', 'local', etc.)
  return _uploadViaKubo(json);
}

/**
 * fetchFromIPFS(cid)
 *
 * Retrieves and parses a JSON document from IPFS by CID.
 * Uses a public gateway — content-addressed so any gateway is equivalent.
 *
 * @param  {string} cid
 * @returns {Promise<object>}
 */
async function fetchFromIPFS(cid) {
  if (!cid) throw new Error('fetchFromIPFS: CID is required');

  const res = await _fetchWithTimeout(`${IPFS_GATEWAY}/${cid}`, {
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`IPFS fetch failed [${res.status}] for CID ${cid}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`IPFS response for ${cid} is not valid JSON`);
  }
}

module.exports = { uploadToIPFS, fetchFromIPFS };
