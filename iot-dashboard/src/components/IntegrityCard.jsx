export default function IntegrityCard({ integrity, onRefresh }) {
  if (!integrity) {
    return (
      <div className="card integrity-card">
        <div className="card-title">Hash-Chain Integrity</div>
        <div className="skeleton-row" />
        <div className="skeleton-row" style={{ width: '60%' }} />
      </div>
    );
  }

  const intact  = integrity.status === 'INTACT';
  const pct     = integrity.totalBlocks > 0
    ? Math.round((integrity.verified / integrity.totalBlocks) * 100)
    : 0;

  return (
    <div className="card integrity-card">
      <div className="card-title">Hash-Chain Integrity</div>

      <div className={`integrity-status ${intact ? 'intact' : 'compromised'}`}>
        <span className="integrity-icon">{intact ? '✓' : '✗'}</span>
        <span>{intact ? 'INTACT' : 'COMPROMISED'}</span>
      </div>

      <div className="integrity-bar-wrap">
        <div
          className="integrity-bar"
          style={{
            width: `${pct}%`,
            background: intact ? '#34D399' : '#F87171'
          }}
        />
      </div>
      <div className="integrity-pct">{pct}% verified</div>

      <div className="integrity-stats">
        <div>Total blocks <strong>{integrity.totalBlocks}</strong></div>
        <div>Verified <strong style={{ color: '#34D399' }}>{integrity.verified}</strong></div>
        <div>Tampered <strong style={{ color: '#F87171' }}>{integrity.tampered}</strong></div>
      </div>

      {integrity.issues?.length > 0 && (
        <div className="integrity-issues">
          <div className="issue-header">Issues detected</div>
          {integrity.issues.map((iss, i) => (
            <div key={i} className="issue-row">
              Block #{iss.seq}: {iss.reason}
            </div>
          ))}
        </div>
      )}

      <button
        className="btn-verify"
        onClick={onRefresh}
      >
        Re-verify chain
      </button>
    </div>
  );
}
