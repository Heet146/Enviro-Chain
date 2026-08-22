import { useRef, useEffect, useState } from 'react';

export default function KPICard({ label, value, unit, color, sub }) {
  const prevRef = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div className={`kpi-card${flash ? ' kpi-flash' : ''}`} style={{ '--accent': color }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>
        {value ?? '—'}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
