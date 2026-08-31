// src/App.js
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './App.css';

import { computeAQI }  from './utils/aqi';
import { useLocation } from './hooks/useLocation';
import Header          from './components/Header';
import KPICard         from './components/KPICard';
import AQIBadge        from './components/AQIBadge';
import { PM25Chart, PM10Chart, TempHumChart, AQIChart, COChart } from './components/Charts';
import MapView         from './components/MapView';
import IntegrityCard   from './components/IntegrityCard';
import DataTable       from './components/DataTable';

const API = 'http://localhost:3001/api';
const WS  = 'ws://localhost:3001';

export default function App() {
  const [blocks,      setBlocks]      = useState([]);
  const [nodes,       setNodes]       = useState({});
  const [integrity,   setIntegrity]   = useState(null);
  const [wsStatus,    setWsStatus]    = useState('Connecting…');
  const [lastUpdated, setLastUpdated] = useState(null);
  const wsRef = useRef(null);

  // Load initial data
  useEffect(() => {
    axios.get(`${API}/blocks?limit=100`)
      .then(r => setBlocks(r.data.blocks || []))
      .catch(() => {});

    axios.get(`${API}/nodes`)
      .then(r => setNodes(r.data || {}))
      .catch(() => {});

    axios.get(`${API}/verify`)
      .then(r => setIntegrity(r.data))
      .catch(() => {});
  }, []);

  // Helper — fetch latest integrity result and update state
  const refreshIntegrity = useCallback(() => {
    axios.get(`${API}/verify`)
      .then(r => setIntegrity(r.data))
      .catch(() => {});
  }, []);

  // WebSocket — live block updates from server
  useEffect(() => {
    const ws = new WebSocket(WS);
    wsRef.current = ws;

    ws.onopen  = () => setWsStatus('Live');
    ws.onclose = () => setWsStatus('Disconnected');
    ws.onerror = () => setWsStatus('Error');

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'NEW_BLOCK') {
        console.log('PM2.5:', msg.block.pm25, 'PM10:', msg.block.pm10);
        setBlocks(prev => [msg.block, ...prev].slice(0, 100));
        setLastUpdated(Date.now());
        // Use the integrity calculated directly from the server on block insertion!
        if (msg.integrity) {
          setIntegrity(msg.integrity);
        }
      }
    };

    return () => ws.close();
  }, []);

  // Tick "last updated" label every second
  const [, forceRender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceRender(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleIntegrityRefresh = refreshIntegrity;

  const handleRecover = async () => {
    try {
      const res = await axios.post(`${API}/recover`);
      const recoveredCount = res.data.recovered !== undefined ? res.data.recovered : 0;
      alert(res.data.message || `Recovery complete! ${recoveredCount} block(s) restored from IPFS.`);
      refreshIntegrity();
      // Reload blocks table
      axios.get(`${API}/blocks?limit=100`)
        .then(r => setBlocks(r.data.blocks || []))
        .catch(() => {});
    } catch (e) {
      alert(`Recovery failed: ${e.response?.data?.error || e.message}`);
    }
  };

  const latest   = blocks[0];
  const aqi      = computeAQI({ pm25: latest?.pm25, pm10: latest?.pm10, co: latest?.co });
  const location = useLocation(latest);

  // ── Send browser location to backend over WebSocket ──────────────────────
  // Fires once when browserCoords becomes available. The backend stores it
  // server-side and uses it to enrich subsequent MQTT blocks before Firebase
  // write — without touching original block fields (hash-chain safe).
  useEffect(() => {
    const { browserCoords } = location;
    const ws = wsRef.current;
    if (!browserCoords || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'BROWSER_LOCATION',
      lat:  browserCoords.lat,
      lng:  browserCoords.lng,
    }));
  }, [location.browserCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-root">
      <Header
        wsStatus={wsStatus}
        nodes={nodes}
        lastUpdated={lastUpdated}
      />

      <div className="content">

        {/* KPI row */}
        {latest ? (
          <div className="kpi-row">
            <KPICard
              label="Temperature"
              value={latest.temp?.toFixed(1)}
              unit="°C"
              color="#FB923C"
              sub={`Block #${latest.seq}`}
            />
            <KPICard
              label="Humidity"
              value={latest.hum?.toFixed(1)}
              unit="%"
              color="#38BDF8"
              sub={`Node ${latest.nodeId}`}
            />
            <KPICard
              label="PM2.5"
              value={latest.pm25}
              unit="µg/m³"
              color="#F87171"
              sub="Particulate matter"
            />
            <KPICard
              label="PM10"
              value={latest.pm10}
              unit="µg/m³"
              color="#A78BFA"
              sub="Coarse particles"
            />
            <AQIBadge aqi={aqi} />
            <KPICard
              label="CO Raw"
              value={latest.co}
              color="#34D399"
              sub="MQ135 analog"
            />
          </div>
        ) : (
          <div className="card empty-state">
            <div className="empty-icon">📡</div>
            <div className="empty-title">Waiting for ESP32 data</div>
            <div className="empty-sub">
              Make sure the device is powered on and the backend is running.
            </div>
          </div>
        )}

        {/* Charts — Row 2: PM2.5 + PM10 */}
        {blocks.length > 0 && (
          <div className="charts-row">
            <PM25Chart blocks={blocks} />
            <PM10Chart blocks={blocks} />
          </div>
        )}

        {/* Charts — Row 3: Temp/Humidity + AQI */}
        {blocks.length > 0 && (
          <div className="charts-row">
            <TempHumChart blocks={blocks} />
            <AQIChart blocks={blocks} />
          </div>
        )}

        {/* Charts — Row 4: CO trend */}
        {blocks.length > 0 && (
          <div className="charts-row">
            <COChart blocks={blocks} />
          </div>
        )}

        {/* Map + Integrity */}
        <div className="map-integrity-row">
          <MapView blocks={blocks} location={location} />
          <IntegrityCard
            integrity={integrity}
            onRefresh={handleIntegrityRefresh}
            onRecover={handleRecover}
          />
        </div>

        {/* Data table */}
        <DataTable blocks={blocks} location={location} />

      </div>
    </div>
  );
}
