'use strict';

// ── Structured logger ────────────────────────────────────────────────────────
// Lightweight wrapper — no external dependencies.
// Output format:  [2026-03-31T10:00:00.000Z] [LEVEL] message

const fmt = (level, msg) => `[${new Date().toISOString()}] [${level}] ${msg}`;

module.exports = {
  info:  (msg) => console.log(fmt('INFO',  msg)),
  warn:  (msg) => console.warn(fmt('WARN',  msg)),
  error: (msg) => console.error(fmt('ERROR', msg)),
};
