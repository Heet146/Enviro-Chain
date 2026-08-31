// iot-backend/blockchain.js
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ── Load compiled contract ABI ──
let ABI = [];
try {
  const contractJSON = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../blockchain/build/contracts/EnvMonitor.json'), 'utf8')
  );
  ABI = contractJSON.abi;
} catch (e) {
  console.warn('[Blockchain] EnvMonitor.json not loaded:', e.message);
}

// ── Ganache (Main Chain) connection ──
const ganacheRpc = process.env.GANACHE_RPC_URL || 'http://127.0.0.1:7545';
const GANACHE_CONTRACT_ADDRESS = process.env.GANACHE_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.POLYGON_PRIVATE_KEY || '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';

// ── Sidechain / Polygon connection ──
const polygonRpc = process.env.POLYGON_RPC_URL;
const POLYGON_CONTRACT_ADDRESS = process.env.POLYGON_CONTRACT_ADDRESS || process.env.ANCHOR_CONTRACT_ADDRESS;

let ganacheContract = null;
let polygonContract = null;

function getGanacheContract() {
  if (ganacheContract) return ganacheContract;
  if (!GANACHE_CONTRACT_ADDRESS || ABI.length === 0) return null;
  try {
    const provider = new ethers.JsonRpcProvider(ganacheRpc, undefined, { staticNetwork: true });
    const wallet = new ethers.Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : '0x' + PRIVATE_KEY, provider);
    ganacheContract = new ethers.Contract(GANACHE_CONTRACT_ADDRESS, ABI, wallet);
    return ganacheContract;
  } catch (e) {
    return null;
  }
}

function getPolygonContract() {
  if (polygonContract) return polygonContract;
  if (!POLYGON_CONTRACT_ADDRESS || !polygonRpc || ABI.length === 0) return null;
  try {
    const provider = new ethers.JsonRpcProvider(polygonRpc, undefined, { staticNetwork: true });
    const wallet = new ethers.Wallet(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : '0x' + PRIVATE_KEY, provider);
    polygonContract = new ethers.Contract(POLYGON_CONTRACT_ADDRESS, ABI, wallet);
    return polygonContract;
  } catch (e) {
    return null;
  }
}

function ensureBytes32(hexStr) {
  if (!hexStr) return '0x' + '0'.repeat(64);
  let clean = hexStr.startsWith('0x') ? hexStr.slice(2) : hexStr;
  if (clean.length > 64) clean = clean.slice(0, 64);
  else if (clean.length < 64) clean = clean.padEnd(64, '0');
  return '0x' + clean;
}

// ── Store block on Polygon (every sensor reading) ──
async function storeOnPolygon(block) {
  const contract = getPolygonContract();
  if (!contract) return { success: false, error: 'Polygon not configured' };
  try {
    const tx = await contract.storeBlock(
      block.seq || 0,
      block.nodeId || 'UNKNOWN',
      Math.round((block.temp || 0) * 100),
      Math.round((block.hum || 0) * 100),
      Math.round((block.co || 0) * 100),
      Math.round((block.pm25 || 0) * 100),
      Math.round((block.pm10 || 0) * 100),
      Math.round((block.lat || 0) * 1000000),
      Math.round((block.lng || 0) * 1000000),
      ensureBytes32(block.hash),
      ensureBytes32(block.prev)
    );
    const receipt = await tx.wait();
    console.log(`Polygon tx: ${receipt.hash} (Block #${block.seq})`);
    return { success: true, txHash: receipt.hash, chain: 'polygon' };
  } catch (err) {
    console.error('Polygon store failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Anchor batch to Ganache (every 10 blocks) ──
async function anchorToGanache(batchHash, fromSeq, toSeq) {
  const contract = getGanacheContract();
  if (!contract) return { success: false, error: 'Ganache not configured' };
  try {
    const tx = await contract.storeBlock(
      toSeq,
      'BATCH_ANCHOR',
      0, 0, 0, 0, 0, 0, 0,
      ensureBytes32(batchHash),
      '0x' + '0'.repeat(64)
    );
    const receipt = await tx.wait();
    console.log(`Ganache anchor tx: ${receipt.hash} (blocks ${fromSeq}-${toSeq})`);
    return { success: true, txHash: receipt.hash, chain: 'ganache' };
  } catch (err) {
    console.error('Ganache anchor failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Verify chain integrity via smart contract ──
async function verifyOnChain(usePolygon = true) {
  try {
    const contract = usePolygon ? getPolygonContract() : getGanacheContract();
    if (!contract) return { error: `${usePolygon ? 'Polygon' : 'Ganache'} not configured` };
    const result = await contract.verifyChain();
    return {
      intact: result[0] !== undefined ? result[0] : result.intact,
      tamperedAt: Number(result[1] !== undefined ? result[1] : result.tamperedAt),
      chain: usePolygon ? 'polygon' : 'ganache'
    };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { storeOnPolygon, anchorToGanache, verifyOnChain };