// ── Breakpoint tables (EPA standard) ──────────────────────────────────────

const BP_PM25 = [
  { cLo: 0.0,   cHi: 12.0,  iLo: 0,   iHi: 50  },
  { cLo: 12.1,  cHi: 35.4,  iLo: 51,  iHi: 100 },
  { cLo: 35.5,  cHi: 55.4,  iLo: 101, iHi: 150 },
  { cLo: 55.5,  cHi: 150.4, iLo: 151, iHi: 200 },
  { cLo: 150.5, cHi: 250.4, iLo: 201, iHi: 300 },
  { cLo: 250.5, cHi: 500.4, iLo: 301, iHi: 500 },
];

const BP_PM10 = [
  { cLo: 0,   cHi: 54,  iLo: 0,   iHi: 50  },
  { cLo: 55,  cHi: 154, iLo: 51,  iHi: 100 },
  { cLo: 155, cHi: 254, iLo: 101, iHi: 150 },
  { cLo: 255, cHi: 354, iLo: 151, iHi: 200 },
  { cLo: 355, cHi: 424, iLo: 201, iHi: 300 },
  { cLo: 425, cHi: 604, iLo: 301, iHi: 500 },
];

// MQ135 raw (0–4095) → normalised to 0–50 µg/m³-equivalent
// Low-confidence sensor: no NAAQS calibration. Used only as a weak signal.
const BP_CO_NORM = [
  { cLo: 0.0,  cHi: 4.4,  iLo: 0,   iHi: 50  },
  { cLo: 4.5,  cHi: 9.4,  iLo: 51,  iHi: 100 },
  { cLo: 9.5,  cHi: 12.4, iLo: 101, iHi: 150 },
  { cLo: 12.5, cHi: 15.4, iLo: 151, iHi: 200 },
  { cLo: 15.5, cHi: 30.4, iLo: 201, iHi: 300 },
  { cLo: 30.5, cHi: 50.0, iLo: 301, iHi: 500 },
];

const AQI_LEVELS = [
  { max: 50,  category: 'Good',                          color: '#16A34A' },
  { max: 100, category: 'Moderate',                       color: '#CA8A04' },
  { max: 150, category: 'Unhealthy for Sensitive Groups', color: '#EA580C' },
  { max: 200, category: 'Unhealthy',                      color: '#DC2626' },
  { max: 300, category: 'Very Unhealthy',                 color: '#9333EA' },
  { max: 500, category: 'Hazardous',                      color: '#9F1239' },
];

// CO sub-index must reach this threshold to act as an extreme safety override.
// Prevents uncalibrated MQ135 noise from inflating the AQI.
const CO_EXTREME_THRESHOLD = 300;

// ── Core formula ───────────────────────────────────────────────────────────

/**
 * calculateSubIndex(concentration, breakpointTable)
 *
 * EPA linear interpolation:
 *   AQI = ((I_hi - I_lo) / (BP_hi - BP_lo)) * (C - BP_lo) + I_lo
 *
 * Returns integer sub-index, or null if concentration is unavailable/invalid.
 */
export function calculateSubIndex(c, bpTable) {
  if (c == null || c < 0) return null;
  const bp = bpTable.find(b => c >= b.cLo && c <= b.cHi)
    ?? bpTable[bpTable.length - 1];
  return Math.round(
    ((bp.iHi - bp.iLo) / (bp.cHi - bp.cLo)) * (c - bp.cLo) + bp.iLo
  );
}

/**
 * getAQICategory(value)
 * Returns { category, color } for a numeric AQI value.
 */
export function getAQICategory(value) {
  return AQI_LEVELS.find(l => value <= l.max) ?? AQI_LEVELS[AQI_LEVELS.length - 1];
}

// ── PM2.5-priority dominance logic ────────────────────────────────────────
//
// Real AQI standards (US EPA / CPCB India):
//   • AQI = MAX(sub-indices) — never averaged
//   • PM2.5 is the globally dominant health indicator
//   • CO from uncalibrated sensors (MQ135) must not override PM readings
//
// Priority chain applied here:
//
//   ① PM2.5 ≥ 50 (Moderate or worse)
//       → PM2.5 is authoritative. Final AQI = sub_pm25.
//         Rationale: PM2.5 is the most health-critical pollutant once it
//         leaves the "Good" band; no other sensor should override it.
//
//   ② PM2.5 < 50 (Good band)
//       → Final AQI = max(sub_pm25, sub_pm10)
//         Rationale: both PM sensors are credible; pick the higher of the two.
//
//   ③ PM2.5 unavailable → fall back to PM10 alone.
//
//   ④ Neither PM sensor available → CO only.
//
//   ⑤ CO extreme override (≥ 300, i.e., Very Unhealthy/Hazardous)
//       → CO overrides current value ONLY if it exceeds it.
//         Rationale: a completely uncalibrated sensor should only escalate
//         the AQI when it signals a genuinely alarming level, not suppress
//         a lower-quality PM reading on routine noise.

/**
 * computeAQI({ pm25, pm10, co })
 *   pm25 — µg/m³ (PMS5003 PM_AE_UG_2_5 field from firmware)
 *   pm10 — µg/m³ (PMS5003 PM_AE_UG_10_0 field from firmware)
 *   co   — raw MQ135 analog 0–4095 (firmware field: "co")
 *
 * Returns { value, category, color, dominant }
 */
export function computeAQI({ pm25, pm10, co } = {}) {
  // Normalise CO: raw ADC count → 0–50 equivalent range
  const coNorm = co != null ? (co / 4095) * 50 : null;

  // Compute all three sub-indices independently
  const sub_pm25 = calculateSubIndex(pm25,   BP_PM25);
  const sub_pm10 = calculateSubIndex(pm10,   BP_PM10);
  const sub_co   = calculateSubIndex(coNorm, BP_CO_NORM);

  // No sensor data available
  if (sub_pm25 === null && sub_pm10 === null && sub_co === null) {
    return { value: null, category: 'No Data', color: '#6B7280', dominant: null };
  }

  // ── Apply priority chain ───────────────────────────────────────────────

  let value;
  let dominant;

  if (sub_pm25 !== null) {
    if (sub_pm25 >= 50) {
      // ① PM2.5 in Moderate or worse — it is the sole authority
      value    = sub_pm25;
      dominant = 'PM2.5';
    } else {
      // ② PM2.5 in Good band — compare with PM10, keep higher
      const pmPeak = Math.max(sub_pm25, sub_pm10 ?? 0);
      value    = pmPeak;
      dominant = (sub_pm10 !== null && sub_pm10 > sub_pm25) ? 'PM10' : 'PM2.5';
    }
  } else if (sub_pm10 !== null) {
    // ③ PM2.5 unavailable — degrade to PM10
    value    = sub_pm10;
    dominant = 'PM10';
  } else {
    // ④ Neither PM sensor — CO only
    value    = sub_co;
    dominant = 'CO';
  }

  // ⑤ CO extreme safety override — only when genuinely alarming
  if (sub_co !== null && sub_co >= CO_EXTREME_THRESHOLD && sub_co > value) {
    value    = sub_co;
    dominant = 'CO';
  }

  value = Math.min(value, 500);
  const level = getAQICategory(value);

  return { value, category: level.category, color: level.color, dominant };
}
