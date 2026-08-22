const EnvMonitor = artifacts.require("EnvMonitor");

module.exports = function (deployer) {
    deployer.deploy(EnvMonitor);
};