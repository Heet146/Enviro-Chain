export default function Header({ wsStatus, nodes, lastUpdated }) {
  const nodeEntries = Object.entries(nodes || {});
  const activeCount = nodeEntries.filter(([, n]) => n.status === 'ACTIVE').length;

  const live = wsStatus === 'Live';

  let updatedLabel = '';
  if (lastUpdated) {
    const secs = Math.floor((Date.now() - lastUpdated) / 1000);
    updatedLabel = secs < 5 ? 'just now' : `${secs}s ago`;
  }

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-icon">⬡</div>
        <div>
          <div className="brand-title">EnviroChain</div>
          <div className="brand-sub">Hash-secured real-time air quality</div>
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
        <div className={`ws-badge ${live ? 'ws-live' : 'ws-offline'}`}>
          <span className={`ws-dot ${live ? 'dot-live' : 'dot-off'}`} />
          {live ? 'Live' : wsStatus}
        </div>
      </div>
    </header>
  );
}
