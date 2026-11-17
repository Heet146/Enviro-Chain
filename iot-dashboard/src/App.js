// src/App.js
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import './App.css';

import { computeAQI }  from './utils/aqi';
import { blockTimestamp, isDemoNode, isNodeFresh, toTimestamp } from './utils/sensorStatus';
import { useLocation } from './hooks/useLocation';
import Header          from './components/Header';
import Sidebar, { PAGE_TITLES } from './components/Sidebar';
import PageContent from './components/PageContent';
import LoginPage from './components/LoginPage';
import { auth } from './firebaseClient';

const API = 'http://localhost:3001/api';
const WS  = 'ws://localhost:3001';

async function authorizedRequest(user, method, path, data) {
  if (!user) throw new Error('Sign in to continue.');
  const token = await user.getIdToken();
  try {
    return await axios({
      method,
      url: `${API}${path}`,
      data,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    throw new Error(error.response?.data?.error || error.message || 'The request failed.');
  }
}

export default function App() {
  const [blocks,      setBlocks]      = useState([]);
  const [nodes,       setNodes]       = useState({});
  const [integrity,   setIntegrity]   = useState(null);
  const [wsStatus,    setWsStatus]    = useState('Connecting…');
  const [activePage, setActivePage] = useState('dashboard');
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [locations, setLocations] = useState([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState('all');
  const [theme, setTheme] = useState(() => window.localStorage.getItem('envirochain-theme') === 'light' ? 'light' : 'dark');
  const wsRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('envirochain-theme', theme);
  }, [theme]);

  // Verify Firebase sign-in and retrieve the server-assigned dashboard role.
  useEffect(() => {
    if (!auth) { setAuthLoading(false); return undefined; }
    return onAuthStateChanged(auth, async user => {
      setAuthUser(user);
      setProfile(null);
      setAuthError('');
      if (!user) {
        setAuthLoading(false);
        setBlocks([]); setNodes({}); setIntegrity(null); setLocations([]);
        return;
      }
      setAuthLoading(true);
      try {
        const response = await authorizedRequest(user, 'get', '/me');
        setProfile(response.data);
      } catch (error) {
        setAuthError(error.response?.data?.error || error.message || 'Could not load account access.');
      } finally {
        setAuthLoading(false);
      }
    });
  }, []);

  // Load only data allowed by the authenticated user's server-side profile.
  useEffect(() => {
    if (!authUser || !profile) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [blocksResponse, nodesResponse, locationsResponse] = await Promise.all([
          authorizedRequest(authUser, 'get', '/blocks?limit=100'),
          authorizedRequest(authUser, 'get', '/nodes'),
          authorizedRequest(authUser, 'get', '/locations'),
        ]);
        if (cancelled) return;
        setBlocks(blocksResponse.data.blocks || []);
        setNodes(nodesResponse.data || {});
        setLocations(locationsResponse.data || []);
        if (profile.role === 'admin') {
          const verifyResponse = await authorizedRequest(authUser, 'get', '/verify');
          if (!cancelled) setIntegrity(verifyResponse.data);
        } else {
          setIntegrity(null);
        }
      } catch (error) {
        if (!cancelled) setAuthError(error.response?.data?.error || error.message || 'Could not load dashboard data.');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [authUser, profile]);

  // Helper — fetch latest integrity result and update state
  const refreshIntegrity = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    const response = await authorizedRequest(authUser, 'get', '/verify');
    setIntegrity(response.data);
  }, [authUser, profile?.role]);

  // Tick "last updated" label every second
  const [, forceRender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceRender(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleIntegrityRefresh = refreshIntegrity;

  const handleRecover = async () => {
    try {
      if (profile?.role !== 'admin') throw new Error('Admin access required.');
      const res = await authorizedRequest(authUser, 'post', '/recover');
      const recoveredCount = res.data.recovered !== undefined ? res.data.recovered : 0;
      alert(res.data.message || `Recovery complete! ${recoveredCount} block(s) restored from IPFS.`);
      refreshIntegrity();
      // Reload blocks table
      const refreshed = await authorizedRequest(authUser, 'get', '/blocks?limit=100');
      setBlocks(refreshed.data.blocks || []);
    } catch (e) {
      alert(`Recovery failed: ${e.response?.data?.error || e.message}`);
    }
  };

  const handleCreateLocation = async location => {
    await authorizedRequest(authUser, 'post', '/admin/locations', location);
    const response = await authorizedRequest(authUser, 'get', '/locations');
    setLocations(response.data || []);
  };

  const handleCreateUser = async user => {
    await authorizedRequest(authUser, 'post', '/admin/users', user);
  };

  const handleAssignNode = async (nodeId, locationId) => {
    await authorizedRequest(authUser, 'patch', `/admin/nodes/${encodeURIComponent(nodeId)}/location`, { locationId });
    const [nodesResponse, blocksResponse] = await Promise.all([
      authorizedRequest(authUser, 'get', '/nodes'),
      authorizedRequest(authUser, 'get', '/blocks?limit=100'),
    ]);
    setNodes(nodesResponse.data || {});
    setBlocks(blocksResponse.data.blocks || []);
  };

  const isAdmin = profile?.role === 'admin';
  const placeFilterActive = isAdmin && activePage !== 'settings' && selectedPlaceId !== 'all';
  const selectedPlace = locations.find(item => item.id === selectedPlaceId);
  const currentHardwareNodes = Object.entries(nodes)
    .filter(([nodeId, node]) => !isDemoNode(nodeId, node) && isNodeFresh(node))
    .sort(([, a], [, b]) => (toTimestamp(b.lastSeen) || 0) - (toTimestamp(a.lastSeen) || 0));
  const currentHardwareNode = currentHardwareNodes[0] || null;
  const viewBlocks = placeFilterActive
    ? selectedPlaceId === 'current-hardware'
      ? (currentHardwareNode ? blocks.filter(block => block.nodeId === currentHardwareNode[0]) : [])
      : blocks.filter(block => (block.locationId || nodes[block.nodeId]?.locationId) === selectedPlaceId)
    : blocks;
  const viewNodes = placeFilterActive
    ? selectedPlaceId === 'current-hardware'
      ? (currentHardwareNode ? { [currentHardwareNode[0]]: currentHardwareNode[1] } : {})
      : Object.fromEntries(Object.entries(nodes).filter(([, node]) => node.locationId === selectedPlaceId))
    : nodes;
  const latest   = viewBlocks[0];
  const aqi      = computeAQI({ pm25: latest?.pm25, pm10: latest?.pm10, co: latest?.co });
  const defaultLocation = useLocation(latest, false);
  const blockLocationId = latest?.locationId || nodes[latest?.nodeId]?.locationId;
  const assignedPlace = profile?.role === 'user'
    ? ((profile.locations || []).find(item => item.id === blockLocationId) || (profile.locations || [])[0])
    : null;
  const hardwareAssignedPlace = selectedPlaceId === 'current-hardware' && currentHardwareNode
    ? locations.find(item => item.id === currentHardwareNode[1].locationId)
    : null;
  const displayPlace = profile?.role === 'user'
    ? assignedPlace
    : (selectedPlaceId === 'current-hardware' ? hardwareAssignedPlace : (placeFilterActive ? selectedPlace : null));
  const noLiveLocation = isAdmin
    && (selectedPlaceId === 'all' || selectedPlaceId === 'current-hardware')
    && (!latest || latest.locationSource === 'default');
  const location = noLiveLocation
    ? { lat: null, lng: null, source: 'No live GPS location', browserCoords: null }
    : displayPlace && Number.isFinite(Number(displayPlace.lat)) && Number.isFinite(Number(displayPlace.lng)) && (latest?.locationSource === 'default' || !latest)
    ? { ...defaultLocation, lat: Number(displayPlace.lat), lng: Number(displayPlace.lng), source: 'Assigned place', browserCoords: null }
    : defaultLocation;
  const alerts = viewBlocks.flatMap(block => {
    const warnings = [];
    if (block.pm25 > 35) warnings.push(`PM2.5 is high (${block.pm25} µg/m³)`);
    if (block.pm10 > 50) warnings.push(`PM10 is high (${block.pm10} µg/m³)`);
    if (block.temp > 40 || block.temp < 5) warnings.push(`Temperature out of range (${block.temp}°C)`);
    if (block.hum > 90 || block.hum < 10) warnings.push(`Humidity out of range (${block.hum}%)`);
    return warnings.map((detail, index) => ({
      key: `${block.hash || block.seq}-${index}`,
      seq: block.seq,
      detail,
      title: 'Sensor threshold exceeded',
      severity: block.pm25 > 55 || block.pm10 > 100 ? 'critical' : 'warning',
    }));
  });

  // Authenticate the live stream separately; blocks are filtered again on the server.
  useEffect(() => {
    if (!authUser || !profile) return undefined;
    const ws = new WebSocket(WS);
    wsRef.current = ws;
    ws.onopen = async () => {
      try { ws.send(JSON.stringify({ type: 'AUTH', token: await authUser.getIdToken() })); }
      catch (_) { ws.close(); }
    };
    ws.onclose = () => setWsStatus('Disconnected');
    ws.onerror = () => setWsStatus('Error');
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.type === 'AUTH_OK') { setWsStatus('Live'); return; }
      if (message.type !== 'NEW_BLOCK') return;
      setBlocks(previous => {
        const unique = new Map();
        [...previous, message.block].forEach(block => {
          unique.set(block.hash || `${block.nodeId}-${block.seq}`, block);
        });
        return [...unique.values()].sort((a, b) => Number(b.seq) - Number(a.seq)).slice(0, 100);
      });
      setNodes(previous => {
        const block = message.block;
        const existing = previous[block.nodeId] || {};
        return {
          ...previous,
          [block.nodeId]: {
            ...existing,
            locationId: block.locationId ?? existing.locationId ?? null,
            lastSeen: block.savedAt || Date.now(),
            lastBlock: block.seq,
            status: 'ACTIVE',
            lat: block.lat,
            lng: block.lng,
            effectiveLat: block.effectiveLat,
            effectiveLng: block.effectiveLng,
            locationSource: block.locationSource,
          },
        };
      });
      if (message.integrity && profile.role === 'admin') setIntegrity(message.integrity);
    };
    return () => { ws.close(); wsRef.current = null; };
  }, [authUser, profile]);

  useEffect(() => { setActivePage('dashboard'); }, [profile?.role]);

  if (!profile) {
    return <LoginPage loading={authLoading} error={authError} onSignOut={() => auth && signOut(auth)} />;
  }

  const [pageTitle, pageSubtitle] = PAGE_TITLES[activePage];
  const locationSummary = profile.role === 'admin'
    ? (placeFilterActive
      ? selectedPlaceId === 'current-hardware'
        ? currentHardwareNode ? `Current hardware · ${currentHardwareNode[0]}` : 'Current hardware · no live sensor'
        : selectedPlace?.name || 'Selected place'
      : 'All monitored places')
    : (profile.locations || []).map(item => item.name).join(', ') || 'No place assigned';

  return (
    <div className="app-root">
      <Sidebar activePage={activePage} onNavigate={setActivePage} alertCount={alerts.length} wsStatus={wsStatus} role={profile.role} />
      <div className="workspace">
        <Header wsStatus={wsStatus} nodes={viewNodes} lastUpdated={blockTimestamp(latest)} pageTitle={pageTitle} pageSubtitle={pageSubtitle} role={profile.role} email={profile.email} onSignOut={() => signOut(auth)} theme={theme} onToggleTheme={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} />
        <main className="content">
          <section className="dashboard-intro" aria-labelledby="page-title">
            <div>
              <p className="eyebrow">ENVIRONMENTAL MONITORING</p>
              <h1 id="page-title">{pageTitle}</h1>
              <p className="dashboard-subtitle">{pageSubtitle}. {locationSummary}.</p>
            </div>
            <div className="intro-tools">
              {profile.role === 'admin' && activePage !== 'settings' && <label className="place-filter"><span className="intro-meta-label">FILTER BY PLACE</span><select value={selectedPlaceId} onChange={event => setSelectedPlaceId(event.target.value)}><option value="all">All places</option><option value="current-hardware">{currentHardwareNode ? `Current hardware · ${currentHardwareNode[0]}` : 'Current hardware (no live node)'}</option>{locations.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>{selectedPlaceId === 'current-hardware' && !currentHardwareNode && <small className="filter-help">No non-simulator sensor has sent data in the last 60 seconds.</small>}</label>}
              <div className="intro-meta">
                <span className="intro-meta-label">LATEST READING</span>
                <strong>{latest ? `Block #${latest.seq}` : 'Waiting for data'}</strong>
              </div>
            </div>
          </section>
          <PageContent
            page={activePage}
            blocks={viewBlocks}
            nodes={viewNodes}
            latest={latest}
            aqi={aqi}
            location={location}
            integrity={integrity}
            wsStatus={wsStatus}
            onRefreshIntegrity={handleIntegrityRefresh}
            onRecover={handleRecover}
            alerts={alerts}
            isAdmin={profile.role === 'admin'}
            locations={locations}
            onCreateLocation={handleCreateLocation}
            onCreateUser={handleCreateUser}
            onAssignNode={handleAssignNode}
          />
        </main>
      </div>
    </div>
  );
}
