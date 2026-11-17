const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'monitoring', label: 'Live Monitoring', icon: 'pulse' },
  { id: 'location', label: 'Location', icon: 'map' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
  { id: 'devices', label: 'Devices', icon: 'device' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const USER_NAV_ITEMS = NAV_ITEMS.filter(item => !['devices', 'settings'].includes(item.id));

function NavIcon({ name }) {
  const paths = {
    dashboard: <><circle cx="12" cy="12" r="8.5" /><path d="m14.8 9.2-2 4-4 2 2-4 4-2Z" /></>,
    pulse: <path d="M3 12h3l2-7 4 14 2-7h7" />,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15m6-12v15" /></>,
    analytics: <><path d="M4 19V5m0 14h16" /><path d="m7 15 3-4 3 2 5-7" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    device: <><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M10 18h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.2 2-2 2-2.1-1.2a8 8 0 0 1-1.5.6L14.5 21h-3l-.6-2.5a8 8 0 0 1-1.5-.6L7.3 19l-2-2 1.2-2.1a8 8 0 0 1-.6-1.5L3.5 13v-3l2.4-.6a8 8 0 0 1 .6-1.5L5.3 5.8l2-2 2.1 1.2a8 8 0 0 1 1.5-.6L11.5 2h3l.6 2.4a8 8 0 0 1 1.5.6l2.1-1.2 2 2-1.2 2.1a8 8 0 0 1 .6 1.5l2.4.6v3l-2.4.6a8 8 0 0 1-.7 1.4Z" /></>,
  };

  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export const PAGE_TITLES = {
  dashboard: ['Dashboard', 'Environmental monitoring overview'],
  monitoring: ['Live Monitoring', 'Real-time sensor readings'],
  location: ['Location', 'Device position and recent track'],
  analytics: ['Analytics', 'Historical environmental trends'],
  alerts: ['Alerts', 'Threshold and integrity events'],
  devices: ['Devices', 'Connected monitoring nodes'],
  settings: ['Settings', 'System and data source information'],
};

export default function Sidebar({ activePage, onNavigate, alertCount, wsStatus, role }) {
  const items = role === 'admin' ? NAV_ITEMS : USER_NAV_ITEMS;
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">⬡</div>
        <div><strong>EnviroChain</strong><span>MONITORING SYSTEM</span></div>
      </div>

      <div className={`mode-pill${wsStatus === 'Live' ? ' mode-live' : ''}`}><span className="mode-dot" /> {wsStatus === 'Live' ? 'BACKEND CONNECTED' : 'BACKEND OFFLINE'}</div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${activePage === item.id ? ' active' : ''}`}
            aria-label={item.label}
            title={item.label}
            aria-current={activePage === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
            {item.id === 'alerts' && alertCount > 0 && <span className="nav-count">{alertCount > 99 ? '99+' : alertCount}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer"><span className="footer-status-dot" /> {role === 'admin' ? 'Administrator' : 'Location user'} <span>v1.0</span></div>
    </aside>
  );
}
