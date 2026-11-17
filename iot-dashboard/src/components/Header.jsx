import { isNodeFresh } from '../utils/sensorStatus';

export default function Header({ wsStatus, nodes, lastUpdated, pageTitle, pageSubtitle, role, email, onSignOut, theme, onToggleTheme }) {
  const nodeEntries = Object.entries(nodes || {});
  const activeCount = nodeEntries.filter(([, n]) => isNodeFresh(n)).length;

  const connected = wsStatus === 'Live';

  let updatedLabel = '';
  if (lastUpdated) {
    const secs = Math.floor((Date.now() - lastUpdated) / 1000);
    updatedLabel = secs < 5 ? 'just now' : `${secs}s ago`;
  }

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-page-mark">◈</div>
        <div>
          <div className="brand-title">{pageTitle || 'EnviroChain'}</div>
          <div className="brand-sub">{pageSubtitle || 'Hash-secured real-time air quality'}</div>
        </div>
      </div>

      <div className="header-right">
        {updatedLabel && (
          <div className="last-updated">Updated {updatedLabel}</div>
        )}
        {nodeEntries.length > 0 && (
          <div className="node-pill">
            {activeCount} / {nodeEntries.length} nodes active
          </div>
        )}
        <div className={`ws-badge ${connected ? 'ws-live' : 'ws-offline'}`}>
          <span className={`ws-dot ${connected ? 'dot-live' : 'dot-off'}`} />
          {connected ? 'Backend connected' : wsStatus}
        </div>
        <div className="user-session"><span className="user-avatar">{(email || 'U').slice(0, 1).toUpperCase()}</span><span className="user-session-copy"><strong>{email || 'Signed in'}</strong><small>{role === 'admin' ? 'Administrator' : 'Location user'}</small></span></div>
        <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>{theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <button className="signout-button" type="button" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}
