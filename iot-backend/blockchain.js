// iot-backend/blockchain.js
const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');

// ── Load compiled contract ABI ──
// After truffle compile, the ABI is in blockchain/build/contracts/EnvMonitor.json
const contractJSON = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, '../blockchain/build/contracts/EnvMonitor.json')
    )
);
const ABI = contractJSON.abi;

// ── Ganache (Main Chain) connection ──
const ganacheWeb3 = new Web3(process.env.GANACHE_RPC_URL || 'http://127.0.0.1:7545');
const GANACHE_CONTRACT_ADDRESS = process.env.GANACHE_CONTRACT_ADDRESS;
let ganacheContract = null;
if (GANACHE_CONTRACT_ADDRESS && GANACHE_CONTRACT_ADDRESS !== '0x3EB17310E79835dB5eaDb1bFCF1cbb8B471D98E9') {
    try { ganacheContract = new ganacheWeb3.eth.Contract(ABI, GANACHE_CONTRACT_ADDRESS); } catch (e) { }
}

// ── Polygon (Sidechain) connection ──
const polygonWeb3 = new Web3(process.env.POLYGON_RPC_URL || 'http://127.0.0.1:8545');
const POLYGON_CONTRACT_ADDRESS = process.env.ANCHOR_CONTRACT_ADDRESS;
let polygonContract = null;
if (POLYGON_CONTRACT_ADDRESS && POLYGON_CONTRACT_ADDRESS !== '0x78887Fc60AB402f9D81C84a01aC533de75fC2d6e') {
    try { polygonContract = new polygonWeb3.eth.Contract(ABI, POLYGON_CONTRACT_ADDRESS); } catch (e) { }
}

// Your wallet private key
const PRIVATE_KEY = '0x784baab85e6c45aa49da97adfb6dc7845e79675ad738d6e897cf1148ef1d9417';
// ── Store block on Polygon (every sensor reading) ──
async function storeOnPolygon(block) {
    if (!polygonContract || !PRIVATE_KEY) return { success: false, error: 'Polygon not configured' };
    try {
        const account = polygonWeb3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
        polygonWeb3.eth.accounts.wallet.add(account);

        // Convert float values to integers (Solidity doesn't support floats)
        const tx = await polygonContract.methods.storeBlock(
            block.seq,
            block.nodeId,
            Math.round((block.temp || 0) * 100),   // 29.4 → 2940
            Math.round((block.hum || 0) * 100),
            block.co || 0,
            Math.round((block.pm25 || 0) * 100),
            Math.round((block.pm10 || 0) * 100),
            Math.round((block.lat || 0) * 1000000),
            Math.round((block.lng || 0) * 1000000),
            '0x' + block.hash,                       // convert to bytes32
            '0x' + block.prev
        ).send({
            from: account.address,
            gas: 300000,
            gasPrice: '20000000000'
        });

        console.log(`Polygon tx: ${tx.transactionHash} (Block #${block.seq})`);
        return { success: true, txHash: tx.transactionHash, chain: 'polygon' };

    } catch (err) {
        console.error('Polygon store failed:', err.message);
        return { success: false, error: err.message };
    }
}

// ── Anchor batch to Ganache (every 10 blocks) ──
async function anchorToGanache(batchHash, fromSeq, toSeq) {
    if (!ganacheContract) return { success: false, error: 'Ganache not configured' };
    try {
        const accounts = await ganacheWeb3.eth.getAccounts();

        const tx = await ganacheContract.methods.storeBlock(
            toSeq,
            'BATCH_ANCHOR',
            0, 0, 0, 0, 0, 0, 0,
            '0x' + batchHash,
            '0x' + '0'.repeat(64)
        ).send({
            from: accounts[0],
            gas: 300000
        });

        console.log(`Ganache anchor tx: ${tx.transactionHash} (blocks ${fromSeq}-${toSeq})`);
        return { success: true, txHash: tx.transactionHash, chain: 'ganache' };

    } catch (err) {
        console.error('Ganache anchor failed:', err.message);
        return { success: false, error: err.message };
    }
}

// ── Verify chain integrity via smart contract ──
async function verifyOnChain(usePolygon = true) {
    try {
        const contract = usePolygon ? polygonContract : ganacheContract;
        if (!contract) return { error: `${usePolygon ? 'Polygon' : 'Ganache'} not configured` };
        const result = await contract.methods.verifyChain().call();
        return {
            intact: result.intact,
            tamperedAt: result.tamperedAt,
            chain: usePolygon ? 'polygon' : 'ganache'
        };
    } catch (err) {
        return { error: err.message };
    }
}

module.exports = { storeOnPolygon, anchorToGanache, verifyOnChain };