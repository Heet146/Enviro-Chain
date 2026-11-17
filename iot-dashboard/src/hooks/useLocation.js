import { useState, useEffect } from 'react';

const DEFAULT_LOCATION = { lat: 19.072836, lng: 72.899803 }; // KJ Somaiya

/**
 * useLocation(latestBlock, enabled)
 *
 * Priority for MAP DISPLAY:
 *  1. Device GPS  — block.gpsFix === true && block.lat !== 0  → "Live GPS"
 *  2. Browser geo — only if explicitly enabled                → "Browser location"
 *  3. Default     — hardcoded fallback                        → "Default location"
 *
 * Returns { lat, lng, source, browserCoords }
 * Map always renders — never null.
 */
export function useLocation(latest, enabled = true) {
  const [browserCoords, setBrowserCoords] = useState(null);
  const [requested,     setRequested]     = useState(false);

  const deviceValid =
    latest?.gpsFix === true &&
    typeof latest?.lat === 'number' &&
    latest.lat !== 0;

  // Browser geolocation is opt-in. The role-based dashboard disables it so
  // a viewer's personal coordinates never become shared sensor metadata.
  useEffect(() => {
    if (!enabled || requested || !navigator.geolocation) return;
    setRequested(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => setBrowserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()    => setBrowserCoords(null),
      { timeout: 8000, maximumAge: 300_000, enableHighAccuracy: false }
    );
  }, [enabled, requested]);

  // Resolve display location
  if (deviceValid) {
    return { lat: latest.lat, lng: latest.lng, source: 'Live GPS', browserCoords };
  }
  if (latest?.effectiveLat && latest?.effectiveLng && latest?.locationSource && latest?.locationSource !== 'default') {
    return { 
      lat: latest.effectiveLat, 
      lng: latest.effectiveLng, 
      source: latest.locationSource === 'browser' ? 'Browser location' : 'Live GPS', 
      browserCoords 
    };
  }
  if (browserCoords) {
    return { lat: browserCoords.lat, lng: browserCoords.lng, source: 'Browser location', browserCoords };
  }
  return { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng, source: 'Default location', browserCoords };
}
