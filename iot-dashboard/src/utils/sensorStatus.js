// The ESP32 publishes about every 15 seconds; allow a missed publish or two.
export const SENSOR_FRESHNESS_MS = 60_000;

export function toTimestamp(value) {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  // Accept epoch seconds as well as epoch milliseconds.
  return parsed < 1e12 ? parsed * 1000 : parsed;
}

export function isNodeFresh(node, now = Date.now()) {
  const lastSeen = toTimestamp(node?.lastSeen);
  return lastSeen !== null && now - lastSeen >= 0 && now - lastSeen <= SENSOR_FRESHNESS_MS;
}

export function isDemoNode(nodeId, node) {
  return node?.demo === true || /^SIM[-_]/i.test(nodeId || '');
}

export function blockTimestamp(block) {
  const savedAt = toTimestamp(block?.savedAt);
  if (savedAt !== null) return savedAt;

  const timestamp = toTimestamp(block?.timestamp);
  if (timestamp !== null) return timestamp;

  // Firmware `ts` is millis since boot (not wall-clock time); only accept it
  // as a timestamp when it looks like a real Unix epoch value.
  if (typeof block?.ts === 'number' && block.ts >= 1e9) {
    return block.ts < 1e12 ? block.ts * 1000 : block.ts;
  }
  return null;
}
