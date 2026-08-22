require('dotenv').config();
const mqtt = require('mqtt');
const crypto = require('crypto');

// ── Configuration ────────────────────────────────────────────────────────────
const BROKER_URL = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const TOPIC = process.env.MQTT_TOPIC || 'iot/envmonitor/data';
const PUBLISH_INTERVAL_MS = 3000; // Publish every 3 seconds
const NODE_ID = 'SIM-PALMBEACH-01';

// ── Palm Beach Road Waypoints (Navi Mumbai) ───────────────────────────────────
// We will interpolate smoothly between these key points.
const waypoints = [
  { lat: 19.0682, lng: 73.0035 }, // Vashi
  { lat: 19.0560, lng: 73.0085 }, // Sanpada
  { lat: 19.0300, lng: 73.0160 }, // Nerul
  { lat: 19.0150, lng: 73.0245 }  // Belapur
];

// Helper to interpolate exactly `totalPoints` along the entire route
function generateRoute(waypoints, totalPoints) {
  const segments = [];
  let totalDist = 0;
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    const dist = Math.sqrt(Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2));
    segments.push({ start, end, dist });
    totalDist += dist;
  }

  const route = [waypoints[0]];
  const interval = totalDist / (totalPoints - 1);
  let accumulatedDist = 0;
  let currentSegmentIdx = 0;

  for (let i = 1; i < totalPoints - 1; i++) {
    const targetDist = i * interval;
    
    while (currentSegmentIdx < segments.length && accumulatedDist + segments[currentSegmentIdx].dist < targetDist) {
      accumulatedDist += segments[currentSegmentIdx].dist;
      currentSegmentIdx++;
    }

    if (currentSegmentIdx >= segments.length) break;

    const segment = segments[currentSegmentIdx];
    const distIntoSegment = targetDist - accumulatedDist;
    const fraction = distIntoSegment / segment.dist;

    route.push({
      lat: segment.start.lat + (segment.end.lat - segment.start.lat) * fraction,
      lng: segment.start.lng + (segment.end.lng - segment.start.lng) * fraction
    });
  }
  
  route.push(waypoints[waypoints.length - 1]);
  return route;
}

const route = generateRoute(waypoints, 50); // Exactly 50 locations total
let currentPointIdx = 0;

// ── Sensor State ─────────────────────────────────────────────────────────────
let seq = 1000;
let prevHash = "GENESIS";
let baseTemp = 32.0;
let baseHum = 65.0;

// ── MQTT Client Setup ────────────────────────────────────────────────────────
console.log(`Connecting to MQTT broker: ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
  console.log(`Connected to broker! Starting Palm Beach road simulation...`);
  console.log(`Publishing to topic: ${TOPIC}\n`);
  
  // Start simulation loop
  setInterval(publishNextBlock, PUBLISH_INTERVAL_MS);
});

client.on('error', (err) => {
  console.error('MQTT error:', err.message);
});

// ── Simulation Logic ─────────────────────────────────────────────────────────
function publishNextBlock() {
  const point = route[currentPointIdx];
  
  // Simulate slight fluctuations in environment
  baseTemp += (Math.random() - 0.5) * 0.5; 
  baseHum += (Math.random() - 0.5) * 1.5;

  // 1. Build exactly the object structure the backend expects for hashing
  const toHash = {
    seq:       seq,
    nodeId:    NODE_ID,
    ts:        Date.now(),
    temp:      parseFloat(baseTemp.toFixed(1)),
    hum:       parseFloat(baseHum.toFixed(1)),
    co:        parseFloat((Math.random() * 2 + 1).toFixed(2)), // 1.0 - 3.0
    pm25:      Math.floor(Math.random() * 20 + 30),            // 30 - 50
    pm10:      Math.floor(Math.random() * 30 + 50),            // 50 - 80
    lat:       parseFloat(point.lat.toFixed(6)),
    lng:       parseFloat(point.lng.toFixed(6)),
    alt:       10.5,
    gpsFix:    true,
    gpsSource: "Hardware GPS",
    prev:      prevHash
  };

  // 2. Hash it exactly as the ESP32 and integrity.js do
  const payloadStr = JSON.stringify(toHash);
  const hash = crypto.createHash('sha256').update(payloadStr).digest('hex');

  // 3. Construct the final block to send
  const finalBlock = {
    ...toHash,
    hash: hash
  };

  // 4. Publish
  client.publish(TOPIC, JSON.stringify(finalBlock), (err) => {
    if (err) {
      console.error('Publish failed:', err);
      return;
    }
    
    console.log(`[Seq ${seq}] Published block at Lat: ${toHash.lat}, Lng: ${toHash.lng}`);
    console.log(`  Hash: ${hash.substring(0, 16)}...`);
    console.log(`  Temp: ${toHash.temp}°C | Hum: ${toHash.hum}%\n`);
    
    // Update state for next tick
    prevHash = hash;
    seq++;
    
    // Move car along the route, loop back if we reach the end
    currentPointIdx++;
    if (currentPointIdx >= route.length) {
      console.log("== Reached end of Palm Beach road. Turning around! ==");
      route.reverse(); // drive back
      currentPointIdx = 0;
    }
  });
}
