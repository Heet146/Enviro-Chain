// truffle-config.js
module.exports = {
  networks: {

    // ── Ganache local Ethereum (main chain for development) ──
    ganache: {
      host: "127.0.0.1",
      port: 7545,           // Ganache default port
      network_id: "5777",         // match any network
      gas: 6721975,
      from: "0xAf5ED2E65f43953654237d1eabf85Cca0B17958f"
      // e.g. "0x1234abcd..."  — copy from Ganache UI
    },

    // ── Polygon Mumbai Testnet (sidechain) ──
    polygon_mumbai: {
      provider: () => {
        const HDWalletProvider = require('@truffle/hdwallet-provider');
        return new HDWalletProvider(
          "4e82280a95d6c5d54f232bf2b29fe5eb472680a18f58bea18c9eb0d627ec6851",    // from Ganache or MetaMask
          "http://127.0.0.1:8545"
        );
      },
      network_id: 1337,
      gas: 5500000,
      gasPrice: 20000000000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    }
  },

  compilers: {
    solc: {
      version: "0.8.0"
    }
  }
};