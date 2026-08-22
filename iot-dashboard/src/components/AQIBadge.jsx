export default function AQIBadge({ aqi }) {
  const { value, category, color, dominant } = aqi;

  return (
    <div className="kpi-card aqi-primary" style={{ '--accent': color, borderTopColor: color }}>
      <div className="kpi-label">Air Quality Index</div>
      <div className="aqi-value" style={{ color }}>
        {value ?? '—'}
      </div>
      <div className="aqi-category-badge" style={{ background: color + '18', color, borderColor: color + '33' }}>
        {category}
      </div>
      {dominant && (
        <div className="kpi-sub">Dominant: {dominant}</div>
      )}
    </div>
  );
}
