import { useState, useEffect } from 'react';

const DEFAULT_LOCATION = { lat: 19.072836, lng: 72.899803 }; // KJ Somaiya

/**
 * useLocation(latestBlock)
 *
 * Priority for MAP DISPLAY:
 *  1. Device GPS  — block.gpsFix === true && block.lat !== 0  → "Live GPS"
 *  2. Browser geo — navigator.geolocation (requested once)    → "Browser location"
 *  3. Default     — hardcoded fallback                        → "Default location"
 *
 * Also returns `browserCoords` so App.js can push it to the backend via
 * WebSocket, enabling server-side location enrichment before Firebase write.
 *
 * Returns { lat, lng, source, browserCoords }
 * Map always renders — never null.
 */
export function useLocation(latest) {
  const [browserCoords, setBrowserCoords] = useState(null);
  const [requested,     setRequested]     = useState(false);

  const deviceValid =
    latest?.gpsFix === true &&
    typeof latest?.lat === 'number' &&
    latest.lat !== 0;

  // Request browser location once on mount (regardless of device GPS state),
  // so the backend can immediately receive it via WebSocket for enrichment.
  useEffect(() => {
    if (requested || !navigator.geolocation) return;
    setRequested(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => setBrowserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()    => setBrowserCoords(null),
      { timeout: 8000, maximumAge: 300_000, enableHighAccuracy: false }
    );
  }, [requested]);

  // Resolve display location
  if (deviceValid) {
    return { lat: latest.lat, lng: latest.lng, source: 'Live GPS', browserCoords };
  }
  if (latest?.effectiveLat && latest?.locationSource === 'palm-beach-simulation') {
    return { lat: latest.effectiveLat, lng: latest.effectiveLng, source: 'Palm Beach Simulation', browserCoords };
  }
  if (browserCoords) {
    return { lat: browserCoords.lat, lng: browserCoords.lng, source: 'Browser location', browserCoords };
  }
  return { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng, source: 'Default location', browserCoords };
}
