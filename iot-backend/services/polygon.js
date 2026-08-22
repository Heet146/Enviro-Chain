'use strict';

// ── Polygon Service ─────────────────────────────────────────────────────────
//
// Interacts with the CIDRegistry smart contract deployed on Polygon.
//
// Required .env:
//   POLYGON_RPC_URL         — JSON-RPC endpoint (Infura/Alchemy/public)
//   POLYGON_PRIVATE_KEY     — wallet private key (hex, with 0x prefix)
//   ANCHOR_CONTRACT_ADDRESS — deployed CIDRegistry address
//
// Recommended network: Polygon Amoy testnet for dev, Polygon Mainnet for prod.
// RPC example: https://polygon-amoy.infura.io/v3/<PROJECT_KEY>
//
// ABI must stay in sync with contracts/CIDRegistry.sol

const { ethers } = require('ethers');

// Human-readable ABI — matches CIDRegistry.sol exactly
const ABI = [
  'function storeCID(string calldata cid) external',
  'function getLatestManifestCID() external view returns (string memory)',
  'function getManifest(uint256 index) external view returns (string memory cid, uint256 timestamp, address submitter)',
  'function getManifestCount() external view returns (uint256)',
  'event CIDAnchored(uint256 indexed index, string cid, uint256 timestamp, address submitter)',
];

// Singleton — lazily initialised on first use
let _provider = null;
let _wallet   = null;
let _contract = null;

/**
 * _init()
 * Initialises ethers provider, wallet, and contract instance.
 * Throws clearly if required env vars are missing.
 */
function _init() {
  if (_contract) return; // already initialised

  const rpcUrl          = process.env.POLYGON_RPC_URL;
  const privateKey      = process.env.POLYGON_PRIVATE_KEY;
  const contractAddress = process.env.ANCHOR_CONTRACT_ADDRESS;

  if (!rpcUrl)          throw new Error('POLYGON_RPC_URL is not set in .env');
  if (!privateKey)      throw new Error('POLYGON_PRIVATE_KEY is not set in .env');
  if (!contractAddress) throw new Error('ANCHOR_CONTRACT_ADDRESS is not set in .env');

  _provider = new ethers.JsonRpcProvider(rpcUrl);
  _wallet   = new ethers.Wallet(privateKey, _provider);
  _contract = new ethers.Contract(contractAddress, ABI, _wallet);

  console.log(`[Polygon] Contract: ${contractAddress}`);
  console.log(`[Polygon] Signer:   ${_wallet.address}`);
}

/**
 * isConfigured()
 * Returns true if all Polygon env vars are present.
 * Use this to skip Polygon ops gracefully when not configured.
 */
function isConfigured() {
  return !!(
    process.env.POLYGON_RPC_URL &&
    process.env.POLYGON_PRIVATE_KEY &&
    process.env.ANCHOR_CONTRACT_ADDRESS
  );
}

/**
 * storeCID(manifestCID)
 *
 * Writes a manifest CID to the CIDRegistry contract on-chain.
 * This is the immutable anchor — once mined, the CID cannot be altered.
 *
 * @param  {string} manifestCID — IPFS CID of the batch manifest
 * @returns {Promise<string>}     transaction hash
 */
async function storeCID(manifestCID) {
  _init();
  if (!manifestCID) throw new Error('storeCID: manifestCID is required');

  console.log(`[Polygon] Submitting CID: ${manifestCID}`);
  const tx      = await _contract.storeCID(manifestCID);
  const receipt = await tx.wait();          // wait for 1 confirmation

  console.log(`[Polygon] Confirmed in block ${receipt.blockNumber} | tx: ${receipt.hash}`);
  return receipt.hash;
}

/**
 * getLatestManifestCID()
 *
 * Reads the most recently anchored manifest CID from the contract.
 * This is the authoritative source of truth for recovery.
 *
 * @returns {Promise<string>} IPFS CID string
 */
async function getLatestManifestCID() {
  _init();
  return await _contract.getLatestManifestCID();
}

/**
 * getManifestCount()
 * @returns {Promise<number>}
 */
async function getManifestCount() {
  _init();
  return Number(await _contract.getManifestCount());
}

/**
 * getManifestByIndex(index)
 * @param  {number} index
 * @returns {Promise<{ cid, timestamp, submitter }>}
 */
async function getManifestByIndex(index) {
  _init();
  const [cid, timestamp, submitter] = await _contract.getManifest(index);
  return { cid, timestamp: Number(timestamp) * 1000, submitter };
}

module.exports = { isConfigured, storeCID, getLatestManifestCID, getManifestCount, getManifestByIndex };
