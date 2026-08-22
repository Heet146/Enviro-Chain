'use strict';

require('dotenv').config();
const { storeOnPolygon, anchorToGanache, verifyOnChain } = require('./blockchain');

const express = require('express');
const cors = require('cors');
const http = require('http');
const admin = require('firebase-admin');
const mqtt = require('mqtt');
const { WebSocketServer } = require('ws');

const log = require('./logger');
const { MQTT } = require('./config');
const { verifyChain } = require('./integrity');
const { startAnchorScheduler } = require('./services/anchor');
const { recoverTamperedBlocks } = require('./services/recovery');

const { handleIncomingBlock } = require('./mqtt/handler');

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── Firebase ──────────────────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json')),
  databaseURL: process.env.FIREBASE_URL,
});
const db = admin.database();
log.info('Firebase connected');

// ── WebSocket ─────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const wsClients = new Set();

// Browser location pushed from the dashboard — used for location enrichment
// when the device has no GPS fix. Null until the first push is received.
let browserLocation = { lat: null, lng: null };

wss.on('connection', ws => {
  wsClients.add(ws);
  log.info('Dashboard connected via WebSocket');

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'BROWSER_LOCATION' &&
        typeof msg.lat === 'number' && typeof msg.lng === 'number') {
        browserLocation = { lat: msg.lat, lng: msg.lng };
        log.info(`Browser location updated: ${msg.lat.toFixed(5)}, ${msg.lng.toFixed(5)}`);
      }
    } catch (_) { /* ignore malformed frames */ }
  });

  ws.on('close', () => wsClients.delete(ws));
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  wsClients.forEach(ws => { if (ws.readyState === 1) ws.send(payload); });
}

// ── Batch anchor counter ──
let blocksSinceAnchor = 0;
const ANCHOR_EVERY = 10;   // anchor to Ganache every 10 blocks



// Add this new API route for on-chain verification:
app.get('/api/verify-onchain', async (req, res) => {
  const chain = req.query.chain || 'polygon';
  const result = await verifyOnChain(chain === 'polygon');
  res.json(result);
});

// ── MQTT ──────────────────────────────────────────────────────────────────────
const mqttClient = mqtt.connect(MQTT.broker);

mqttClient.on('connect', () => {
  log.info('MQTT broker connected');
  mqttClient.subscribe(MQTT.topic, err => {
    if (err) log.error(`MQTT subscribe error: ${err.message}`);
    else log.info(`Subscribed to topic: ${MQTT.topic}`);
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const block = JSON.parse(message.toString());
    log.info(`Block #${block.seq} from ${block.nodeId} | temp=${block.temp}°C | pm25=${block.pm25}`);
    await handleIncomingBlock(block, { db, broadcast, browserLocation });

    // Store every block on Polygon sidechain
    const polyResult = await storeOnPolygon(block);
    if (polyResult.success) {
      console.log(`Polygon tx: ${polyResult.txHash}`);
    }

    // Anchor to Ganache every 10 blocks
    blocksSinceAnchor++;
    if (blocksSinceAnchor >= ANCHOR_EVERY) {
      const batchHash = block.hash;   // use latest block hash as anchor
      await anchorToGanache(batchHash, block.seq - ANCHOR_EVERY + 1, block.seq);
      blocksSinceAnchor = 0;
    }
  } catch (err) {
    log.error(`Error processing MQTT message: ${err.message}`);
  }
});

mqttClient.on('error', err => log.error(`MQTT error: ${err.message}`));

// ── API Routes ────────────────────────────────────────────────────────────────

app.get('/api/blocks', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const snapshot = await db.ref('blocks')
      .orderByChild('seq').limitToLast(limit).once('value');
    const blocks = [];
    snapshot.forEach(child => blocks.push(child.val()));
    res.json({ blocks: blocks.reverse() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/nodes', async (req, res) => {
  try {
    const snapshot = await db.ref('nodes').once('value');
    res.json(snapshot.val() || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/verify', async (req, res) => {
  try {
    res.json(await verifyChain(db));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Body: { issues: [{ seq, reason }] }  — or omit body to auto-detect via verifyChain
app.post('/api/recover', async (req, res) => {
  try {
    let issues = req.body?.issues;
    if (!issues) {
      const report = await verifyChain(db);
      if (report.tampered === 0) {
        return res.json({ message: 'Chain is intact — no recovery needed', report });
      }
      issues = report.issues;
    }
    const results = await recoverTamperedBlocks(db, issues);
    res.json({ recovered: results.filter(r => r.status === 'RESTORED').length, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/anchors', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const snapshot = await db.ref('anchors')
      .orderByChild('anchoredAt').limitToLast(limit).once('value');
    const anchors = [];
    snapshot.forEach(child => anchors.push(child.val()));
    res.json({ anchors: anchors.reverse() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  log.info(`Server running at http://localhost:${PORT}`);
  startAnchorScheduler(db);
});

