'use strict';

// Synthetic multi-location publisher for project demonstrations.
// It writes through the normal MQTT ingestion path, so readings receive the
// same Firebase metadata and hash-chain verification as hardware readings.
require('dotenv').config();
const crypto = require('crypto');
const mqtt = require('mqtt');
const { db } = require('./db-init');

const BROKER_URL = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const TOPIC = process.env.MQTT_TOPIC || 'iot/envmonitor/data';
const INTERVAL_MS = Number(process.env.DEMO_INTERVAL_MS) || 5000;
const places = [
  { id: 'new-delhi', nodeId: 'NODE_DELHI_01', lat: 28.6139, lng: 77.2089, pm25: 95, pm10: 165, temp: 32.5, hum: 38, co: 820 },
  { id: 'bathinda-punjab', nodeId: 'NODE_BATHINDA_01', lat: 30.2300, lng: 74.9519, pm25: 48, pm10: 92, temp: 35.0, hum: 30, co: 610 },
  { id: 'rishikesh-uttarakhand', nodeId: 'NODE_RISHIKESH_01', lat: 30.1087, lng: 78.2916, pm25: 18, pm10: 35, temp: 26.0, hum: 62, co: 290 },
  { id: 'aizawl-mizoram', nodeId: 'NODE_AIZAWL_01', lat: 23.7300, lng: 92.7200, pm25: 24, pm10: 43, temp: 24.5, hum: 70, co: 340 },
];

function jitter(amount) {
  return (Math.random() * 2 - 1) * amount;
}

async function prepareChainAndAssignments() {
  for (const place of places) {
    const placeSnapshot = await db.ref(`locations/${place.id}`).once('value');
    if (!placeSnapshot.exists()) {
      throw new Error(`Place "${place.id}" is missing. Create all four places in admin Settings first.`);
    }
  }

  // Pre-register the demo nodes and assign them before their first readings.
  for (const place of places) {
    await db.ref(`nodes/${place.nodeId}`).update({
      locationId: place.id,
      status: 'INACTIVE',
      demo: true,
    });
  }

  const snapshot = await db.ref('blocks').orderByChild('seq').once('value');
  let latest = null;
  snapshot.forEach(child => { latest = child.val(); });
  return {
    seq: Number(latest?.seq || 0) + 1,
    prevHash: latest?.hash || 'GENESIS',
  };
}

async function main() {
  const chain = await prepareChainAndAssignments();
  let seq = chain.seq;
  let prevHash = chain.prevHash;
  let placeIndex = 0;
  let publishing = false;

  console.log(`Starting synthetic readings for ${places.length} places.`);
  console.log(`Publishing every ${INTERVAL_MS / 1000}s to ${TOPIC} via ${BROKER_URL}`);
  console.log('Stop the demo with Ctrl+C. These are simulated, not measured readings.');

  const client = mqtt.connect(BROKER_URL);
  client.on('error', error => console.error('MQTT error:', error.message));
  client.on('connect', () => {
    console.log('MQTT connected. Each node will publish in turn.');
    const timer = setInterval(() => {
      if (publishing) return;
      publishing = true;
      const place = places[placeIndex];
      const toHash = {
        seq,
        nodeId: place.nodeId,
        ts: Date.now(),
        temp: Number((place.temp + jitter(0.6)).toFixed(1)),
        hum: Number(Math.max(10, Math.min(95, place.hum + jitter(2))).toFixed(1)),
        co: Math.max(0, Math.round(place.co + jitter(35))),
        pm25: Math.max(1, Math.round(place.pm25 + jitter(7))),
        pm10: Math.max(1, Math.round(place.pm10 + jitter(12))),
        lat: Number((place.lat + jitter(0.00015)).toFixed(6)),
        lng: Number((place.lng + jitter(0.00015)).toFixed(6)),
        alt: 10.5,
        gpsFix: true,
        gpsSource: 'Demo simulator',
        prev: prevHash,
      };
      const hash = crypto.createHash('sha256').update(JSON.stringify(toHash)).digest('hex');
      client.publish(TOPIC, JSON.stringify({ ...toHash, hash }), error => {
        publishing = false;
        if (error) {
          console.error(`Publish failed for ${place.nodeId}:`, error.message);
          return;
        }
        console.log(`[${seq}] ${place.nodeId} → ${place.id} | PM2.5 ${toHash.pm25} | PM10 ${toHash.pm10}`);
        prevHash = hash;
        seq += 1;
        placeIndex = (placeIndex + 1) % places.length;
      });
    }, INTERVAL_MS);

    const stop = () => {
      clearInterval(timer);
      client.end(false, {}, () => process.exit(0));
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

main().catch(error => {
  console.error(`Demo setup failed: ${error.message}`);
  process.exitCode = 1;
});
