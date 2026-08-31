import { useState } from 'react';

export default function IntegrityCard({ integrity, onRefresh, onRecover }) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

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

  const handleVerifyClick = async () => {
    setIsVerifying(true);
    try {
      if (onRefresh) await onRefresh();
    } finally {
      setTimeout(() => setIsVerifying(false), 400);
    }
  };

  const handleRecoverClick = async () => {
    setIsRecovering(true);
    try {
      if (onRecover) await onRecover();
    } finally {
      setIsRecovering(false);
    }
  };

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
        <button
          className="btn-verify"
          disabled={isVerifying}
          onClick={handleVerifyClick}
        >
          {isVerifying ? 'Verifying Chain...' : 'Re-verify chain'}
        </button>

        {!intact && onRecover && (
          <button
            className="btn-verify"
            disabled={isRecovering}
            style={{
              background: 'rgba(248, 113, 113, 0.15)',
              borderColor: 'rgba(248, 113, 113, 0.4)',
              color: '#F87171'
            }}
            onClick={handleRecoverClick}
          >
            {isRecovering ? 'Restoring...' : 'Restore from IPFS & Blockchain'}
          </button>
        )}
      </div>
    </div>
  );
}
