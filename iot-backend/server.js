'use strict';

require('dotenv').config();
const { storeOnPolygon, anchorToGanache, verifyOnChain } = require('./blockchain');

const express = require('express');
const cors = require('cors');
const http = require('http');
const mqtt = require('mqtt');
const { WebSocketServer } = require('ws');

const log = require('./logger');
const { MQTT } = require('./config');
const { verifyChain } = require('./integrity');
const { startAnchorScheduler } = require('./services/anchor');
const { recoverTamperedBlocks } = require('./services/recovery');

const { handleIncomingBlock } = require('./mqtt/handler');
const { createAuthMiddleware, requireRole, userLocationIds } = require('./middleware/auth');

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── Database ──────────────────────────────────────────────────────────────────
const { db, auth } = require('./db-init');
const authenticate = createAuthMiddleware(auth, db);
app.use('/api', authenticate);

// ── WebSocket ─────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const wsClients = new Set();

// Sensor GPS or the configured default location is used for block enrichment.
// Browser geolocation is kept out of the shared server stream.
let browserLocation = { lat: null, lng: null };

wss.on('connection', ws => {
  const client = { ws, user: null };
  const authTimer = setTimeout(() => {
    if (!client.user) ws.close(4401, 'Authentication required');
  }, 8000);

  ws.on('message', async raw => {
    if (client.user) return;
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'AUTH' || typeof msg.token !== 'string' || !auth) {
        ws.close(4401, 'Authentication required');
        return;
      }
      const decoded = await auth.verifyIdToken(msg.token, true);
      const snapshot = await db.ref(`accessControl/users/${decoded.uid}`).once('value');
      const profile = snapshot.val();
      if (!profile || profile.active === false || !['admin', 'user'].includes(profile.role)) {
        ws.close(4403, 'Dashboard role required');
        return;
      }
      client.user = { ...profile, uid: decoded.uid, email: decoded.email || '' };
      clearTimeout(authTimer);
      wsClients.add(client);
      ws.send(JSON.stringify({ type: 'AUTH_OK', role: client.user.role }));
      log.info(`Dashboard connected (${client.user.role})`);
    } catch (_) {
      ws.close(4401, 'Invalid dashboard session');
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    wsClients.delete(client);
  });
});

async function broadcast(data) {
  try {
    for (const client of wsClients) {
      const { ws, user } = client;
      if (ws.readyState !== 1) continue;
      const snapshot = await db.ref(`accessControl/users/${user.uid}`).once('value');
      const freshProfile = snapshot.val();
      if (!freshProfile || freshProfile.active === false) continue;
      if (freshProfile.role === 'admin') {
        ws.send(JSON.stringify(data));
        continue;
      }
      if (freshProfile.role !== 'user' || data.type !== 'NEW_BLOCK' || !data.block.locationId) continue;
      if (userLocationIds(freshProfile).includes(data.block.locationId)) {
        ws.send(JSON.stringify({ type: 'NEW_BLOCK', block: data.block }));
      }
    }
  } catch (error) {
    log.warn(`Dashboard broadcast failed: ${error.message}`);
  }
}

// ── Batch anchor counter ──
let blocksSinceAnchor = 0;
const ANCHOR_EVERY = 10;   // anchor to Ganache every 10 blocks



// Add this new API route for on-chain verification:
app.get('/api/verify-onchain', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
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

app.get('/api/me', async (req, res) => {
  const locationIds = userLocationIds(req.user);
  const locationsSnapshot = await db.ref('locations').once('value');
  const allLocations = locationsSnapshot.val() || {};
  const locations = req.user.role === 'admin'
    ? Object.entries(allLocations).map(([id, value]) => ({ id, ...value }))
    : locationIds.map(id => allLocations[id] ? ({ id, ...allLocations[id] }) : null).filter(Boolean);
  res.json({ uid: req.user.uid, email: req.user.email, role: req.user.role, locationIds, locations });
});

app.get('/api/locations', async (req, res) => {
  const snapshot = await db.ref('locations').once('value');
  const entries = Object.entries(snapshot.val() || {});
  const visible = req.user.role === 'admin'
    ? entries
    : entries.filter(([id]) => userLocationIds(req.user).includes(id));
  res.json(visible.map(([id, value]) => ({ id, ...value })));
});

app.post('/api/admin/locations', requireRole('admin'), async (req, res) => {
  const { id, name, lat, lng } = req.body || {};
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,39}$/i.test(id) || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Provide a simple location ID and a display name.' });
  }
  const hasLat = lat !== '' && lat !== undefined && lat !== null;
  const hasLng = lng !== '' && lng !== undefined && lng !== null;
  if (hasLat !== hasLng || (hasLat && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180))) {
    return res.status(400).json({ error: 'Provide both valid latitude and longitude values, or leave both blank.' });
  }
  const ref = db.ref(`locations/${id}`);
  const existing = await ref.once('value');
  if (existing.exists()) return res.status(409).json({ error: 'That location ID already exists.' });
  const location = { name: name.trim(), createdAt: Date.now() };
  if (hasLat) { location.lat = Number(lat); location.lng = Number(lng); }
  await ref.set(location);
  return res.status(201).json({ id, ...location });
});

app.patch('/api/admin/nodes/:nodeId/location', requireRole('admin'), async (req, res) => {
  const { locationId } = req.body || {};
  if (typeof locationId !== 'string' || !locationId.trim()) return res.status(400).json({ error: 'A location ID is required.' });
  const [nodeSnapshot, locationSnapshot] = await Promise.all([
    db.ref(`nodes/${req.params.nodeId}`).once('value'),
    db.ref(`locations/${locationId}`).once('value'),
  ]);
  if (!nodeSnapshot.exists()) return res.status(404).json({ error: 'Sensor node not found.' });
  if (!locationSnapshot.exists()) return res.status(404).json({ error: 'Location not found.' });
  await db.ref(`nodes/${req.params.nodeId}`).update({ locationId });
  // Give historical readings a stable place assignment. Later node moves do
  // not silently transfer old records to another user's dashboard.
  const blocksSnapshot = await db.ref('blocks').once('value');
  const updates = [];
  blocksSnapshot.forEach(child => {
    const block = child.val();
    if (block.nodeId === req.params.nodeId && !block.locationId) {
      updates.push(db.ref(`blocks/${child.key}`).update({ locationId }));
    }
  });
  await Promise.all(updates);
  return res.json({ nodeId: req.params.nodeId, locationId });
});

app.get('/api/admin/users', requireRole('admin'), async (_req, res) => {
  const snapshot = await db.ref('accessControl/users').once('value');
  const users = Object.entries(snapshot.val() || {}).map(([uid, profile]) => ({ uid, ...profile }));
  return res.json(users);
});

app.post('/api/admin/users', requireRole('admin'), async (req, res) => {
  const { email, password, displayName, role, locationIds = [] } = req.body || {};
  if (!auth) return res.status(503).json({ error: 'Firebase Authentication is not configured.' });
  if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Provide a valid email and a password with at least 6 characters.' });
  }
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Role must be admin or user.' });
  if (!Array.isArray(locationIds)) return res.status(400).json({ error: 'locationIds must be a list.' });
  if (role === 'user' && locationIds.length === 0) return res.status(400).json({ error: 'Assign at least one location to a user.' });
  if (role === 'user') {
    const checks = await Promise.all(locationIds.map(id => db.ref(`locations/${id}`).once('value')));
    if (checks.some(check => !check.exists())) return res.status(400).json({ error: 'One or more assigned locations do not exist.' });
  }

  let account;
  try {
    account = await auth.createUser({ email: email.trim(), password, displayName: typeof displayName === 'string' ? displayName.trim() : undefined });
    const profile = { email: account.email, displayName: account.displayName || '', role, locationIds: role === 'user' ? [...new Set(locationIds)] : [], active: true, createdAt: Date.now() };
    await db.ref(`accessControl/users/${account.uid}`).set(profile);
    return res.status(201).json({ uid: account.uid, ...profile });
  } catch (error) {
    if (account) {
      try { await auth.deleteUser(account.uid); } catch (_) { /* account cleanup is best-effort */ }
    }
    return res.status(400).json({ error: error.message || 'Could not create the account.' });
  }
});

app.get('/api/blocks', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 100));
    const blocks = [];
    if (req.user.role === 'admin') {
      const snapshot = await db.ref('blocks').orderByChild('seq').limitToLast(limit).once('value');
      snapshot.forEach(child => blocks.push(child.val()));
    } else {
      const locationIds = userLocationIds(req.user);
      const snapshots = await Promise.all(locationIds.map(locationId =>
        db.ref('blocks').orderByChild('locationId').equalTo(locationId).limitToLast(limit).once('value')
      ));
      snapshots.forEach(snapshot => snapshot.forEach(child => blocks.push(child.val())));
    }
    blocks.sort((a, b) => (b.seq || 0) - (a.seq || 0));
    res.json({ blocks: blocks.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/nodes', async (req, res) => {
  try {
    const snapshot = await db.ref('nodes').once('value');
    const nodes = snapshot.val() || {};
    if (req.user.role === 'admin') return res.json(nodes);
    const locationIds = new Set(userLocationIds(req.user));
    return res.json(Object.fromEntries(Object.entries(nodes).filter(([, node]) => locationIds.has(node.locationId))));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/verify', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  try {
    res.json(await verifyChain(db));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Body: { issues: [{ seq, reason }] }  — or omit body to auto-detect via verifyChain
app.post('/api/recover', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
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
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  try {
    const limit = parseInt(req.query.limit) || 20;
    const snapshot = await db.ref('anchors')
      .orderByChild('anchoredAt').limitToLast(limit).once('value');
    const anchors = [];
    snapshot.forEach(child => {
      anchors.push(child.val());
    });
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

