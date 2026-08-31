const CIDRegistry = artifacts.require("CIDRegistry");

module.exports = function (deployer) {
  deployer.deploy(CIDRegistry);
};
