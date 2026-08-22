 require('dotenv').config();
  const { storeCID, getLatestManifestCID, getManifestCount } = require('./services/polygon');

  async function test() {
    const count = await getManifestCount();
    console.log('Manifests on-chain before:', count);

    const testCID = 'bafkreitest' + Date.now();
    const txHash  = await storeCID(testCID);
    console.log('TX hash:', txHash);

    const latest  = await getLatestManifestCID();
    console.log('Latest CID from chain:', latest);
    console.log('Match:', latest === testCID ? '✓' : '✗');
  }

  test().catch(console.error);
