'use strict';
/**
 * test-ipfs.js — quick smoke-test for Pinata IPFS uploads
 * Run: node test-ipfs.js
 */
require('dotenv').config();
const { uploadToIPFS, fetchFromIPFS } = require('./services/ipfs');

(async () => {
  const testData = { test: true, ts: Date.now(), msg: 'IPFS smoke test' };
  console.log('Uploading test payload to IPFS via', process.env.IPFS_PROVIDER || 'pinata', '…');
  console.log('Payload:', testData);

  try {
    const cid = await uploadToIPFS(testData);
    console.log('✓ Upload succeeded! CID:', cid);
    console.log('  Gateway URL:', `${process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs'}/${cid}`);

    console.log('\nFetching back from gateway…');
    const result = await fetchFromIPFS(cid);
    console.log('✓ Fetch succeeded! Data:', result);
  } catch (err) {
    console.error('✗ IPFS test failed:', err.message);
    if (err.message.includes('PINATA_JWT')) {
      console.error('\n  → Get a free JWT at https://app.pinata.cloud/keys');
      console.error('  → Set PINATA_JWT=<your_token> in iot-backend/.env');
    }
    process.exit(1);
  }
})();