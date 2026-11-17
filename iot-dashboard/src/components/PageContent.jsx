import { useState } from 'react';
import KPICard from './KPICard';
import AQIBadge from './AQIBadge';
import { PM25Chart, PM10Chart, TempHumChart, AQIChart, COChart } from './Charts';
import MapView from './MapView';
import IntegrityCard from './IntegrityCard';
import DataTable from './DataTable';
import { isNodeFresh } from '../utils/sensorStatus';

function SectionHeading({ eyebrow, title, caption }) {
  return (
    <div className="section-heading">
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      {caption && <span className="section-caption">{caption}</span>}
    </div>
  );
}

function Conditions({ latest, aqi }) {
  if (!latest) {
    return <div className="card empty-state"><div className="empty-icon">📡</div><div className="empty-title">Waiting for ESP32 data</div><div className="empty-sub">Power on the device and make sure the backend is running.</div></div>;
  }

  return (
    <div className="kpi-row">
      <AQIBadge aqi={aqi} />
      <KPICard label="PM2.5" value={latest.pm25} unit="µg/m³" color="#F87171" sub="Particulate matter" />
      <KPICard label="PM10" value={latest.pm10} unit="µg/m³" color="#A78BFA" sub="Coarse particles" />
      <KPICard label="Temperature" value={latest.temp?.toFixed(1)} unit="°C" color="#FB923C" sub={`Block #${latest.seq}`} />
      <KPICard label="Humidity" value={latest.hum?.toFixed(1)} unit="%" color="#38BDF8" sub={`Node ${latest.nodeId}`} />
      <KPICard label="CO Raw" value={latest.co} color="#34D399" sub="MQ135 analog" />
    </div>
  );
}

function ChartGrid({ blocks }) {
  if (!blocks.length) return <div className="card trends-empty"><span className="empty-icon">📈</span><strong>Trends will appear when readings arrive</strong><span>Charts update as new sensor blocks are received.</span></div>;
  return <div className="trend-grid"><PM25Chart blocks={blocks} /><PM10Chart blocks={blocks} /><TempHumChart blocks={blocks} /><AQIChart blocks={blocks} /><div className="trend-wide"><COChart blocks={blocks} /></div></div>;
}

function SummaryTiles({ blocks, nodes, wsStatus, integrity, isAdmin }) {
  const activeNodes = Object.values(nodes || {}).filter(node => isNodeFresh(node)).length;
  const data = [
    ['Readings received', blocks.length, 'Blocks loaded'],
    ['Connected devices', `${activeNodes} / ${Object.keys(nodes || {}).length}`, 'Nodes active'],
    isAdmin ? ['Chain status', integrity?.status || 'Checking', 'Blockchain verification'] : ['Access scope', 'Place limited', 'Enforced by the API'],
    ['Backend status', wsStatus === 'Live' ? 'Connected' : wsStatus, 'Dashboard to sensor server'],
  ];
  return <div className="summary-grid">{data.map(([label, value, detail]) => <div className="summary-tile" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div>;
}

function AlertList({ alerts, integrity, isAdmin }) {
  const integrityAlerts = (isAdmin ? (integrity?.issues || []) : []).map((issue, index) => {
    const contentMismatch = issue.reason?.startsWith('Hash mismatch');
    return {
      key: `chain-${issue.seq}-${index}`, seq: issue.seq,
      severity: contentMismatch ? 'critical' : 'warning',
      title: contentMismatch ? 'Block content mismatch' : 'Chain link missing',
      detail: issue.reason,
    };
  });
  const items = [...integrityAlerts, ...alerts].slice(0, 30);
  if (!items.length) return <div className="card all-clear"><span className="clear-check">✓</span><div><strong>All clear</strong><p>{isAdmin ? 'No sensor threshold or chain integrity alerts were found in the loaded records.' : 'No sensor threshold alerts were found for your assigned place.'}</p></div></div>;

  return <div className="alert-list">{items.map(alert => (
    <article className={`card alert-item ${alert.severity}`} key={alert.key}>
      <span className="alert-mark">{alert.severity === 'critical' ? '!' : '•'}</span>
      <div className="alert-copy"><div><strong>{alert.title}</strong><span className="alert-block">Block #{alert.seq}</span></div><p>{alert.detail}</p></div>
      <span className="alert-level">{alert.severity === 'critical' ? 'CRITICAL' : 'WARNING'}</span>
    </article>
  ))}</div>;
}

function DeviceList({ nodes, blocks, locations, onAssignNode }) {
  const [assignments, setAssignments] = useState({});
  const [savingNode, setSavingNode] = useState('');
  const [message, setMessage] = useState('');
  const entries = Object.entries(nodes || {});
  if (!entries.length) return <div className="card empty-state"><div className="empty-icon">📟</div><div className="empty-title">No registered devices yet</div><div className="empty-sub">A node appears here after its first reading reaches the backend.</div></div>;
  return <div className="device-grid">{entries.map(([id, node]) => {
    const lastBlock = blocks.find(block => block.nodeId === id) || blocks.find(block => block.seq === node.lastBlock);
    const active = isNodeFresh(node);
    const selectedLocation = assignments[id] ?? node.locationId ?? '';
    return <article className="card device-card" key={id}>
      <div className="device-card-top"><div className="device-icon">▣</div><span className={`device-status ${active ? 'online' : ''}`}><i />{active ? 'Active' : (node.lastSeen ? 'Stale' : 'No readings')}</span></div>
      <p className="eyebrow">SENSOR NODE</p><h3>{id}</h3>
      <div className="device-details"><div><span>Last block</span><strong>{node.lastBlock ?? lastBlock?.seq ?? '—'}</strong></div><div><span>Last seen</span><strong>{node.lastSeen ? new Date(node.lastSeen).toLocaleString() : '—'}</strong></div><div><span>Latest PM2.5</span><strong>{lastBlock?.pm25 ?? '—'}{lastBlock ? ' µg/m³' : ''}</strong></div><div><span>GPS</span><strong>{node.lat && node.lng ? `${Number(node.lat).toFixed(3)}, ${Number(node.lng).toFixed(3)}` : 'No fix'}</strong></div></div>
      <div className="node-assignment"><label>Assigned place<select value={selectedLocation} onChange={event => setAssignments(previous => ({ ...previous, [id]: event.target.value }))}><option value="">Choose a place</option>{locations.map(location => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label><button type="button" disabled={!selectedLocation || savingNode === id || selectedLocation === node.locationId} onClick={async () => { setSavingNode(id); setMessage(''); try { await onAssignNode(id, selectedLocation); setMessage(`Saved place for ${id}.`); } catch (error) { setMessage(error.message); } finally { setSavingNode(''); } }}>{savingNode === id ? 'Saving…' : 'Save place'}</button></div>
    </article>;
  })}{message && <div className="form-feedback">{message}</div>}</div>;
}

function SettingsPanel({ wsStatus, nodes, blocks, locations, onCreateLocation, onCreateUser }) {
  const [locationId, setLocationId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [userLocationId, setUserLocationId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const settings = [
    ['Backend connection', wsStatus === 'Live' ? 'Connected' : wsStatus, 'Dashboard WebSocket to the local sensor backend'],
    ['Sensor API', 'localhost:3001/api', 'Blocks, device registry, and chain verification'],
    ['Location tiles', 'OpenStreetMap', 'Map tiles and attribution are provided by OpenStreetMap'],
    ['History window', `${blocks.length} / 100 blocks`, 'The dashboard keeps the latest 100 records in memory'],
    ['Registered nodes', Object.keys(nodes || {}).length, 'Node records are provided by Firebase through the backend'],
  ];
  const saveLocation = async event => {
    event.preventDefault(); setBusy(true); setFeedback('');
    try { await onCreateLocation({ id: locationId.trim().toLowerCase().replace(/\s+/g, '-'), name: locationName, lat: locationLat, lng: locationLng }); setLocationId(''); setLocationName(''); setLocationLat(''); setLocationLng(''); setFeedback('Place created.'); }
    catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  };
  const createAccount = async event => {
    event.preventDefault(); setBusy(true); setFeedback('');
    try { await onCreateUser({ email, displayName, password, role, locationIds: role === 'user' ? [userLocationId] : [] }); setEmail(''); setDisplayName(''); setPassword(''); setFeedback('Account created. Share its credentials securely with the intended user.'); }
    catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  };

  return <>
    <div className="settings-list">{settings.map(([name, value, detail]) => <div className="card setting-row" key={name}><div><strong>{name}</strong><p>{detail}</p></div><span>{value}</span></div>)}</div>
    <div className="admin-forms">
      <form className="card admin-form" onSubmit={saveLocation}><div className="card-title">Add a monitored place</div><label>Place name<input value={locationName} onChange={event => setLocationName(event.target.value)} placeholder="e.g. Campus North" required /></label><label>Place ID<input value={locationId} onChange={event => setLocationId(event.target.value)} placeholder="e.g. campus-north" required /></label><div className="coordinate-fields"><label>Latitude (optional)<input type="number" step="any" min="-90" max="90" value={locationLat} onChange={event => setLocationLat(event.target.value)} placeholder="19.07" /></label><label>Longitude (optional)<input type="number" step="any" min="-180" max="180" value={locationLng} onChange={event => setLocationLng(event.target.value)} placeholder="72.89" /></label></div><button className="btn-verify" disabled={busy}>Create place</button></form>
      <form className="card admin-form" onSubmit={createAccount}><div className="card-title">Create dashboard account</div><label>Full name<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Person A" /></label><label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>Initial password<input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={6} required /></label><label>Role<select value={role} onChange={event => setRole(event.target.value)}><option value="user">Location user</option><option value="admin">Administrator</option></select></label>{role === 'user' && <label>Assigned place<select value={userLocationId} onChange={event => setUserLocationId(event.target.value)} required><option value="">Choose a place</option>{locations.map(location => <option value={location.id} key={location.id}>{location.name}</option>)}</select></label>}<button className="btn-verify" disabled={busy || (role === 'user' && !userLocationId)}>Create account</button></form>
    </div>
    {feedback && <div className="form-feedback">{feedback}</div>}
  </>;
}

export default function PageContent({ page, blocks, nodes, latest, aqi, location, integrity, wsStatus, onRefreshIntegrity, onRecover, alerts, isAdmin, locations, onCreateLocation, onCreateUser, onAssignNode }) {
  const allCharts = <ChartGrid blocks={blocks} />;

  if (page === 'dashboard') return <>
    <section className="dashboard-section"><SectionHeading eyebrow="AT A GLANCE" title="Current conditions" caption="Most recent sensor block" /><Conditions latest={latest} aqi={aqi} /></section>
    <SummaryTiles blocks={blocks} nodes={nodes} wsStatus={wsStatus} integrity={integrity} isAdmin={isAdmin} />
    <section className="dashboard-section"><SectionHeading eyebrow="RECENT ACTIVITY" title="Air quality and location" caption="Live readings and route" /><div className="dashboard-panels"><div className="card"><div className="card-title">PM2.5 Trend</div>{blocks.length ? <PM25Chart blocks={blocks} /> : <div className="chart-placeholder">Waiting for readings</div>}</div><MapView blocks={blocks} location={location} /></div></section>
    {isAdmin && <section className="dashboard-section"><SectionHeading eyebrow="BLOCKCHAIN AUDIT" title="Data integrity" caption="Hash-chain verification and recovery" /><IntegrityCard integrity={integrity} onRefresh={onRefreshIntegrity} onRecover={onRecover} /></section>}
    <section className="dashboard-section"><SectionHeading eyebrow="DEVICE HISTORY" title="Recent data blocks" caption={`${blocks.length} loaded · newest first`} /><DataTable blocks={blocks} location={location} /></section>
  </>;

  if (page === 'monitoring') return <>
    <section className="dashboard-section"><SectionHeading eyebrow="LIVE SENSOR FEED" title="Current readings" caption={latest ? `Node ${latest.nodeId} · Block #${latest.seq}` : 'Waiting for device'} /><Conditions latest={latest} aqi={aqi} /></section>
    <section className="dashboard-section"><SectionHeading eyebrow="REAL-TIME HISTORY" title="Live sensor trends" caption="Most recent 50 blocks" /><ChartGrid blocks={blocks} /></section>
    <section className="dashboard-section"><SectionHeading eyebrow="LATEST RECORDS" title="Incoming data blocks" /><DataTable blocks={blocks} location={location} /></section>
  </>;

  if (page === 'location') return <>
    <section className="dashboard-section"><SectionHeading eyebrow="GPS TRACKING" title="Device location" caption={`${blocks.filter(block => block.effectiveLat || block.lat).length} locations in history`} /><div className="location-layout"><MapView blocks={blocks} location={location} /><div className="card location-details"><div className="card-title">Current position</div><span className="location-source"><i />{location.source}</span><div className="coordinate-value">{location.lat !== null && location.lng !== null ? <>{Number(location.lat).toFixed(5)}<br />{Number(location.lng).toFixed(5)}</> : 'Waiting for a live GPS fix'}</div><div className="location-facts"><div><span>Latest block</span><strong>{latest ? `#${latest.seq}` : '—'}</strong></div><div><span>GPS fix</span><strong>{latest?.gpsFix ? 'Device GPS' : location.source}</strong></div><div><span>Mapped points</span><strong>{blocks.filter(block => block.effectiveLat || block.lat).length}</strong></div></div></div></div></section>
  </>;

  if (page === 'analytics') return <section className="dashboard-section"><SectionHeading eyebrow="HISTORICAL ANALYSIS" title="Environmental trends" caption="Charts use the latest 50 sensor blocks" />{allCharts}</section>;

  if (page === 'alerts') return <>
    <section className="dashboard-section"><SectionHeading eyebrow="MONITORING EVENTS" title="Alert center" caption="PM2.5 > 35 · PM10 > 50 · Temperature / humidity out of range" /><div className="alert-summary"><div className="summary-tile"><span>Sensor alerts</span><strong>{alerts.length}</strong><small>Across loaded blocks</small></div>{isAdmin && <div className="summary-tile"><span>Chain issues</span><strong>{integrity?.tampered ?? '—'}</strong><small>Reported by verification</small></div>}<div className="summary-tile"><span>Overall status</span><strong>{alerts.length || (isAdmin && (integrity?.tampered || 0)) ? 'Attention' : 'Clear'}</strong><small>Current loaded history</small></div></div><AlertList alerts={alerts} integrity={integrity} isAdmin={isAdmin} /></section>
    {isAdmin && <section className="dashboard-section"><SectionHeading eyebrow="CHAIN VERIFICATION" title="Data integrity" /><IntegrityCard integrity={integrity} onRefresh={onRefreshIntegrity} onRecover={onRecover} /></section>}
  </>;

  if (page === 'devices' && isAdmin) return <section className="dashboard-section"><SectionHeading eyebrow="DEVICE REGISTRY" title="Sensor devices" caption={`${Object.keys(nodes || {}).length} registered`} /><DeviceList nodes={nodes} blocks={blocks} locations={locations} onAssignNode={onAssignNode} /></section>;

  if (page === 'settings' && isAdmin) return <section className="dashboard-section"><SectionHeading eyebrow="SYSTEM CONFIGURATION" title="Settings and connections" caption="Service information for this project build" /><SettingsPanel wsStatus={wsStatus} nodes={nodes} blocks={blocks} locations={locations} onCreateLocation={onCreateLocation} onCreateUser={onCreateUser} /></section>;

  return null;
}
