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

  const intact = integrity.status === 'INTACT';
  const chainBroken = integrity.status === 'CHAIN_BROKEN';
  const hashMismatches = integrity.hashMismatches ?? (integrity.status === 'COMPROMISED' ? integrity.tampered : 0);
  const chainBreaks = integrity.chainBreaks ?? 0;
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

      <div className={`integrity-status ${intact ? 'intact' : chainBroken ? 'broken' : 'compromised'}`}>
        <span className="integrity-icon">{intact ? '✓' : chainBroken ? '!' : '✗'}</span>
        <span>{intact ? 'INTACT' : chainBroken ? 'CHAIN BROKEN' : 'COMPROMISED'}</span>
      </div>

      <div className="integrity-bar-wrap">
        <div
          className="integrity-bar"
          style={{
            width: `${pct}%`,
            background: intact ? '#34D399' : chainBroken ? '#F5BD4F' : '#F87171'
          }}
        />
      </div>
      <div className="integrity-pct">{pct}% verified</div>

      <div className="integrity-stats">
        <div>Total blocks <strong>{integrity.totalBlocks}</strong></div>
        <div>Verified <strong style={{ color: '#34D399' }}>{integrity.verified}</strong></div>
        <div>Hash mismatches <strong style={{ color: hashMismatches ? '#F87171' : '#34D399' }}>{hashMismatches}</strong></div>
        <div>Broken links <strong style={{ color: chainBreaks ? '#F5BD4F' : '#34D399' }}>{chainBreaks}</strong></div>
      </div>

      {chainBroken && hashMismatches === 0 && <div className="chain-gap-note">A chain link is missing or out of order. This can happen after deleting stored blocks or restarting a device; it does not by itself mean a block’s readings were edited.</div>}

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

        {(hashMismatches > 0 || chainBreaks > 0) && onRecover && (
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
