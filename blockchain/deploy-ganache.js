const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');

async function deploy() {
  const web3 = new Web3('http://127.0.0.1:7545');
  const accounts = await web3.eth.getAccounts();
  const deployer = accounts[0];
  console.log('Deploying from account:', deployer);

  // Deploy EnvMonitor
  const envMonitorPath = path.join(__dirname, 'build/contracts/EnvMonitor.json');
  const envMonitorJSON = JSON.parse(fs.readFileSync(envMonitorPath, 'utf8'));
  const EnvMonitorContract = new web3.eth.Contract(envMonitorJSON.abi);

  console.log('Deploying EnvMonitor...');
  const envMonitorInstance = await EnvMonitorContract.deploy({
    data: envMonitorJSON.bytecode
  }).send({
    from: deployer,
    gas: 4500000,
    gasPrice: '20000000000'
  });
  console.log('EnvMonitor deployed at:', envMonitorInstance.options.address);

  // Deploy CIDRegistry
  const cidRegistryPath = path.join(__dirname, 'build/contracts/CIDRegistry.json');
  const cidRegistryJSON = JSON.parse(fs.readFileSync(cidRegistryPath, 'utf8'));
  const CIDRegistryContract = new web3.eth.Contract(cidRegistryJSON.abi);

  console.log('Deploying CIDRegistry...');
  const cidRegistryInstance = await CIDRegistryContract.deploy({
    data: cidRegistryJSON.bytecode
  }).send({
    from: deployer,
    gas: 4500000,
    gasPrice: '20000000000'
  });
  console.log('CIDRegistry deployed at:', cidRegistryInstance.options.address);

  const deploymentData = {
    ganacheRpc: 'http://127.0.0.1:7545',
    deployerAddress: deployer,
    deployerPrivateKey: '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d',
    envMonitorAddress: envMonitorInstance.options.address,
    cidRegistryAddress: cidRegistryInstance.options.address
  };

  fs.writeFileSync(
    path.join(__dirname, 'deployed-addresses.json'),
    JSON.stringify(deploymentData, null, 2)
  );
  console.log('Saved deployment addresses to deployed-addresses.json');
}

deploy().catch(err => {
  console.error('Deployment error:', err);
  process.exit(1);
});
