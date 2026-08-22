import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, LineElement, PointElement,
  LinearScale, CategoryScale, Tooltip, Legend, Filler
} from 'chart.js';
import { computeAQI } from '../utils/aqi';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const BASE_OPTIONS = {
  responsive: true,
  animation: { duration: 300 },
  plugins: {
    legend: {
      position: 'top',
      labels: { color: '#94A3B8', font: { size: 11 }, boxWidth: 12 }
    },
    tooltip: {
      backgroundColor: '#1E2D45',
      titleColor: '#F1F5F9',
      bodyColor: '#94A3B8',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
    }
  },
  scales: {
    x: {
      ticks: { color: '#64748B', maxTicksLimit: 8, font: { size: 10 } },
      grid: { color: 'rgba(255,255,255,0.04)' }
    },
    y: {
      ticks: { color: '#64748B', font: { size: 10 } },
      grid: { color: 'rgba(255,255,255,0.04)' }
    }
  }
};

// ── Reusable single-metric chart ──────────────────────────────────────────
export function MetricChart({ title, blocks, dataKey, label, color, yLabel }) {
  const chartBlocks = [...blocks].slice(0, 50).reverse();
  const data = {
    labels: chartBlocks.map(b => `#${b.seq}`),
    datasets: [{
      label: label || dataKey,
      data: chartBlocks.map(b => b[dataKey]),
      borderColor: color,
      backgroundColor: color.replace(')', ', 0.08)').replace('rgb', 'rgba'),
      tension: 0.3,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 5,
    }]
  };
  const opts = {
    ...BASE_OPTIONS,
    scales: {
      ...BASE_OPTIONS.scales,
      y: { ...BASE_OPTIONS.scales.y, title: yLabel ? { display: true, text: yLabel, color: '#64748B', font: { size: 10 } } : undefined }
    }
  };
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <Line data={data} options={opts} />
    </div>
  );
}

export function PM25Chart({ blocks }) {
  const chartBlocks = [...blocks].slice(0, 50).reverse();
  const data = {
    labels: chartBlocks.map(b => `#${b.seq}`),
    datasets: [{
      label: 'PM2.5 (µg/m³)',
      data: chartBlocks.map(b => b.pm25),
      borderColor: '#F87171',
      backgroundColor: 'rgba(248,113,113,0.08)',
      tension: 0.4,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 5,
    }]
  };
  return (
    <div className="card">
      <div className="card-title">PM2.5 Particulate Matter</div>
      <Line data={data} options={BASE_OPTIONS} />
    </div>
  );
}

export function PM10Chart({ blocks }) {
  const chartBlocks = [...blocks].slice(0, 50).reverse();
  const data = {
    labels: chartBlocks.map(b => `#${b.seq}`),
    datasets: [{
      label: 'PM10 (µg/m³)',
      data: chartBlocks.map(b => b.pm10),
      borderColor: '#A78BFA',
      backgroundColor: 'rgba(167,139,250,0.08)',
      tension: 0.3,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 5,
    }]
  };
  return (
    <div className="card">
      <div className="card-title">PM10 Coarse Particles</div>
      <Line data={data} options={BASE_OPTIONS} />
    </div>
  );
}

export function AQIChart({ blocks }) {
  const chartBlocks = [...blocks].slice(0, 50).reverse();
  const data = {
    labels: chartBlocks.map(b => `#${b.seq}`),
    datasets: [{
      label: 'AQI',
      data: chartBlocks.map(b => {
        const result = computeAQI({ pm25: b.pm25, pm10: b.pm10, co: b.co });
        return result.value;
      }),
      borderColor: '#FBBF24',
      backgroundColor: 'rgba(251,191,36,0.08)',
      tension: 0.3,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 5,
    }]
  };
  return (
    <div className="card">
      <div className="card-title">AQI Trend</div>
      <Line data={data} options={BASE_OPTIONS} />
    </div>
  );
}

export function COChart({ blocks }) {
  const chartBlocks = [...blocks].slice(0, 50).reverse();
  const data = {
    labels: chartBlocks.map(b => `#${b.seq}`),
    datasets: [{
      label: 'CO Raw (ADC)',
      data: chartBlocks.map(b => b.co),
      borderColor: '#34D399',
      backgroundColor: 'rgba(52,211,153,0.08)',
      tension: 0.3,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 5,
    }]
  };
  return (
    <div className="card">
      <div className="card-title">CO Raw (MQ135 ADC)</div>
      <Line data={data} options={BASE_OPTIONS} />
    </div>
  );
}

export function TempHumChart({ blocks }) {
  const chartBlocks = [...blocks].slice(0, 50).reverse();
  const data = {
    labels: chartBlocks.map(b => `#${b.seq}`),
    datasets: [
      {
        label: 'Temperature (°C)',
        data: chartBlocks.map(b => b.temp),
        borderColor: '#FB923C',
        backgroundColor: 'transparent',
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
      },
      {
        label: 'Humidity (%)',
        data: chartBlocks.map(b => b.hum),
        borderColor: '#38BDF8',
        backgroundColor: 'transparent',
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
      }
    ]
  };
  return (
    <div className="card">
      <div className="card-title">Temperature &amp; Humidity</div>
      <Line data={data} options={BASE_OPTIONS} />
    </div>
  );
}
