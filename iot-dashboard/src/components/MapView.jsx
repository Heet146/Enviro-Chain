import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl:       require('leaflet/dist/images/marker-icon.png'),
  shadowUrl:     require('leaflet/dist/images/marker-shadow.png'),
});

const latestIcon = new L.Icon({
  iconUrl:       require('leaflet/dist/images/marker-icon.png'),
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  shadowUrl:     require('leaflet/dist/images/marker-shadow.png'),
  iconSize:    [30, 46],
  iconAnchor:  [15, 46],
  popupAnchor: [0, -46],
  shadowSize:  [41, 41],
});

function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.setView([lat, lng], 15, { animate: true });
  }, [lat, lng, map]);
  return null;
}

// Maps backend locationSource values → display labels + badge colours
const SOURCE_META = {
  device:  { label: 'Live GPS',          dot: '#16A34A', color: '#166534', bg: '#DCFCE7' },
  browser: { label: 'Browser location',  dot: '#CA8A04', color: '#713F12', bg: '#FEF9C3' },
  assigned: { label: 'Assigned place',   dot: '#0284C7', color: '#075985', bg: '#E0F2FE' },
  default: { label: 'Default location',  dot: '#6B7280', color: '#374151', bg: '#F3F4F6' },
};

// Resolve display-only source (from useLocation) to the same meta object
const DISPLAY_META = {
  'Live GPS':          SOURCE_META.device,
  'Browser location':  SOURCE_META.browser,
  'Assigned place':    SOURCE_META.assigned,
  'Default location':  SOURCE_META.default,
};

const LAST_N = 100;

// Helper to determine heatmap color based on PM2.5 emissions
function getEmissionColor(pm25) {
  if (pm25 < 35) return '#22c55e'; // Green (Good)
  if (pm25 < 45) return '#eab308'; // Yellow (Moderate)
  if (pm25 < 55) return '#f97316'; // Orange (Poor)
  return '#ef4444';                // Red (Severe)
}

/**
 * MapView — light OSM tile, always renders.
 *
 * Trail + markers prefer effectiveLat/effectiveLng (server-enriched, stored
 * in Firebase alongside the original lat/lng). Falls back to raw lat/lng for
 * backward-compatible blocks that predate enrichment.
 *
 * Props:
 *   blocks   — data blocks (may include effectiveLat, effectiveLng, locationSource)
 *   location — { lat, lng, source } from useLocation() — used only as map
 *              center when no enriched blocks are present yet
 */
export default function MapView({ blocks, location }) {
  if (location?.source === 'No live GPS location') {
    return (
      <div className="card map-empty-card">
        <div className="card-title">Emission Heatmap & Live Track</div>
        <div className="map-empty-state"><span>📡</span><strong>No live GPS location</strong><p>A sensor reading with a valid GPS fix will appear here when a node is connected.</p></div>
      </div>
    );
  }

  // Blocks with any plottable position (effective preferred, raw fallback)
  const plottable = blocks
    .filter(b => {
      const lat = b.effectiveLat ?? b.lat;
      return typeof lat === 'number' && lat !== 0;
    })
    .slice(0, LAST_N);

  const latestBlock = plottable[0];

  // Map center: use enriched latest block, then display fallback
  let centerLat = latestBlock
    ? (latestBlock.effectiveLat ?? latestBlock.lat)
    : location.lat;
  let centerLng = latestBlock
    ? (latestBlock.effectiveLng ?? latestBlock.lng)
    : location.lng;

  // Badge: prefer server-side locationSource from latest block
  let sourceMeta = latestBlock?.locationSource
    ? (SOURCE_META[latestBlock.locationSource] ?? SOURCE_META.default)
    : (DISPLAY_META[location.source] ?? SOURCE_META.default);

  // OVERRIDE: If the block fell back to default but we NOW have a live browser location,
  // upgrade the display to use the live browser location!
  if (latestBlock?.locationSource === 'default' && ['Browser location', 'Assigned place'].includes(location.source)) {
    centerLat = location.lat;
    centerLng = location.lng;
    sourceMeta = location.source === 'Assigned place' ? SOURCE_META.assigned : SOURCE_META.browser;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Title row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px 12px'
      }}>
        <div className="card-title" style={{ margin: 0 }}>Emission Heatmap & Live Track</div>
      </div>

      <MapContainer
        center={[centerLat, centerLng]}
        zoom={14}
        style={{ height: 400, width: '100%', borderRadius: '0 0 14px 14px' }}
        zoomControl
      >
        {/* Light OSM tile */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <RecenterMap lat={centerLat} lng={centerLng} />

        {/* Trail — older blocks with emission heatmap */}
        {plottable.slice(1).map((b, i) => {
          let bLat = b.effectiveLat ?? b.lat;
          let bLng = b.effectiveLng ?? b.lng;
          let bSrc = SOURCE_META[b.locationSource] ?? SOURCE_META.default;

          if (b.locationSource === 'default' && ['Browser location', 'Assigned place'].includes(location.source)) {
            bLat = location.lat;
            bLng = location.lng;
            bSrc = location.source === 'Assigned place' ? SOURCE_META.assigned : SOURCE_META.browser;
          }
          
          const emissionColor = getEmissionColor(b.pm25 || 0);

          return (
            <div key={b.hash || i}>
              {/* Heatmap Bloom */}
              <CircleMarker
                center={[bLat, bLng]}
                radius={24}
                pathOptions={{ color: 'transparent', fillColor: emissionColor, fillOpacity: 0.15, weight: 0 }}
              />
              {/* Core Point */}
              <CircleMarker
                center={[bLat, bLng]}
                radius={5}
                pathOptions={{ color: emissionColor, fillColor: emissionColor, fillOpacity: 0.8, weight: 2 }}
              >
                <Popup>
                  <b>Block #{b.seq}</b><br />
                  PM2.5: <span style={{ color: emissionColor, fontWeight: 'bold' }}>{b.pm25} µg/m³</span><br />
                  Temp: {b.temp?.toFixed(1)}°C | Hum: {b.hum?.toFixed(1)}%<br />
                  Location: {bSrc.label}<br />
                  {bLat?.toFixed(5)}, {bLng?.toFixed(5)}
                </Popup>
              </CircleMarker>
            </div>
          );
        })}

        {/* Latest block marker */}
        {latestBlock && (() => {
          let bLat  = latestBlock.effectiveLat ?? latestBlock.lat;
          let bLng  = latestBlock.effectiveLng ?? latestBlock.lng;
          let bSrc  = SOURCE_META[latestBlock.locationSource] ?? SOURCE_META.default;

          if (latestBlock.locationSource === 'default' && ['Browser location', 'Assigned place'].includes(location.source)) {
            bLat = location.lat;
            bLng = location.lng;
            bSrc = location.source === 'Assigned place' ? SOURCE_META.assigned : SOURCE_META.browser;
          }
          
          const emissionColor = getEmissionColor(latestBlock.pm25 || 0);
          
          return (
            <div key="latest-marker">
              {/* Latest Heatmap Bloom */}
              <CircleMarker
                center={[bLat, bLng]}
                radius={35}
                pathOptions={{ color: 'transparent', fillColor: emissionColor, fillOpacity: 0.25, weight: 0 }}
              />
              <Marker position={[bLat, bLng]} icon={latestIcon}>
                <Popup>
                  <b>Latest · Block #{latestBlock.seq}</b><br />
                  PM2.5: <span style={{ color: emissionColor, fontWeight: 'bold' }}>{latestBlock.pm25} µg/m³</span><br />
                  Temp: {latestBlock.temp?.toFixed(1)}°C | Hum: {latestBlock.hum?.toFixed(1)}%<br />
                  Location: {bSrc.label}<br />
                  {bLat?.toFixed(5)}, {bLng?.toFixed(5)}
                </Popup>
              </Marker>
            </div>
          );
        })()}

        {/* Fallback marker when no blocks plotted yet */}
        {!latestBlock && (
          <Marker position={[centerLat, centerLng]}>
            <Popup>
              <b>{sourceMeta.label}</b><br />
              No device data yet. Showing {sourceMeta.label.toLowerCase()}.
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
