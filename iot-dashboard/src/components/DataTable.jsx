import { useState } from 'react';

const PAGE_SIZE = 15;

function isAbnormal(b) {
  return (
    b.temp > 40 || b.temp < 5 ||
    b.hum  > 90 || b.hum < 10 ||
    b.pm25 > 35 ||
    b.pm10 > 50
  );
}

export default function DataTable({ blocks, location }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(blocks.length / PAGE_SIZE);
  const slice = blocks.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="card table-card">
      <div className="table-header-row">
        <div className="card-title" style={{ margin: 0 }}>Data Blocks</div>
        <div className="pagination">
          <button
            className="page-btn"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >‹</button>
          <span className="page-info">{page + 1} / {Math.max(totalPages, 1)}</span>
          <button
            className="page-btn"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >›</button>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {['#', 'Temp °C', 'Hum %', 'PM2.5', 'PM10', 'CO raw', 'GPS', 'Hash', 'Chain'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((b, i) => {
              const abnormal = isAbnormal(b);
              return (
                <tr key={b.hash || i} className={abnormal ? 'row-alert' : i % 2 === 0 ? 'row-even' : ''}>
                  <td className="td-seq">#{b.seq}</td>
                  <td className={b.temp > 40 || b.temp < 5 ? 'td-warn' : ''}>
                    {b.temp?.toFixed(1)}
                  </td>
                  <td className={b.hum > 90 || b.hum < 10 ? 'td-warn' : ''}>
                    {b.hum?.toFixed(1)}
                  </td>
                  <td className={b.pm25 > 35 ? 'td-alert' : ''}>
                    {b.pm25}
                  </td>
                  <td className={b.pm10 > 50 ? 'td-alert' : ''}>
                    {b.pm10}
                  </td>
                  <td>{b.co}</td>
                  <td className="td-gps" title={`Source: ${b.locationSource === 'default' && location?.source === 'Browser location' ? 'browser override' : (b.locationSource || 'raw')}`}>
                    {(() => {
                      let lat = b.effectiveLat ?? b.lat;
                      let lng = b.effectiveLng ?? b.lng;
                      if (b.locationSource === 'default' && location?.source === 'Browser location') {
                        lat = location.lat;
                        lng = location.lng;
                      }
                      return (lat && lat !== 0)
                        ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                        : <span className="td-dim">No fix</span>;
                    })()}
                  </td>
                  <td className="td-hash">{b.hash?.substring(0, 12)}…</td>
                  <td>
                    <span className="badge-linked">linked</span>
                  </td>
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td colSpan={9} className="td-empty">No blocks yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
