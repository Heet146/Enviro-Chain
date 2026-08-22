'use strict';

// ── Location Service ─────────────────────────────────────────────────────────
//
// Determines the best available location for a block without touching any
// original block fields — hash-chain integrity is preserved.

// ── Palm Beach Road Waypoints (Navi Mumbai) ───────────────────────────────────
// We interpolate smoothly between these key points to simulate a moving vehicle.
const waypoints = [
  { lat: 19.0682, lng: 73.0035 }, // Vashi
  { lat: 19.0560, lng: 73.0085 }, // Sanpada
  { lat: 19.0300, lng: 73.0160 }, // Nerul
  { lat: 19.0150, lng: 73.0245 }  // Belapur
];

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

function getNextSimulatedLocation() {
  const point = route[currentPointIdx];
  currentPointIdx++;
  if (currentPointIdx >= route.length) {
    route.reverse();
    currentPointIdx = 0;
  }
  return point;
}

/**
 * Pick the best available location for a block.
 * NEVER modifies block.lat, block.lng, block.hash, block.prev.
 * Only produces derived fields to be appended alongside the original block.
 *
 * @param {object} block                             — raw block from MQTT
 * @param {{ lat: number|null, lng: number|null }} browserLocation
 * @returns {{ lat: number, lng: number, source: 'device'|'palm-beach-simulation' }}
 */
function getEffectiveLocation(block, browserLocation) {
  const deviceValid =
    block.gpsFix === true &&
    typeof block.lat === 'number' &&
    block.lat !== 0;

  if (deviceValid) {
    return { lat: block.lat, lng: block.lng, source: 'device' };
  }

  const p = getNextSimulatedLocation();
  return { 
    lat: parseFloat(p.lat.toFixed(6)), 
    lng: parseFloat(p.lng.toFixed(6)), 
    source: 'palm-beach-simulation' 
  };
}

module.exports = { getEffectiveLocation };
