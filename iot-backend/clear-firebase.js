'use strict';
/**
 * clear-firebase.js
 *
 * One-shot utility: wipes blocks/, nodes/, anchors/ from Firebase
 * so the hash-chain can start fresh on the new Firebase project.
 *
 * Run once:  node clear-firebase.js
 */
require('dotenv').config();
const { db } = require('./db-init');

async function main() {
  console.log('Clearing Firebase database paths…');
  await Promise.all([
    db.ref('blocks').remove(),
    db.ref('nodes').remove(),
    db.ref('anchors').remove(),
  ]);
  console.log('✓ blocks/, nodes/, anchors/ cleared');
  console.log('Restart server.js — the chain will rebuild from block #1 onward.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
