// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * CIDRegistry — IoT ESG trust anchor on Polygon
 *
 * Stores hourly IPFS manifest CIDs on-chain. Each manifest CID points to a
 * JSON object on IPFS listing all individual block CIDs from that hour. This
 * creates a verifiable, immutable chain of custody for sensor data:
 *
 *   Polygon (this contract)
 *     └── manifestCID  →  IPFS manifest JSON
 *           └── blockCID[]  →  IPFS block JSON (original ESP32 payload)
 *                 └── SHA-256 hash  →  verified by integrity.js
 *
 * Deploy on Polygon Amoy testnet or Polygon Mainnet.
 * ABI is embedded in services/polygon.js — keep both in sync.
 */
contract CIDRegistry {

    struct ManifestEntry {
        string  cid;         // IPFS CID (CIDv1 preferred)
        uint256 timestamp;   // block.timestamp at submission
        address submitter;   // who anchored it
    }

    ManifestEntry[] private _manifests;

    event CIDAnchored(
        uint256 indexed index,
        string  cid,
        uint256 timestamp,
        address submitter
    );

    /**
     * Store a new manifest CID. Called hourly by the backend anchor job.
     * @param cid  IPFS CID string of the manifest JSON
     */
    function storeCID(string calldata cid) external {
        require(bytes(cid).length > 0, "CID cannot be empty");

        _manifests.push(ManifestEntry({
            cid:       cid,
            timestamp: block.timestamp,
            submitter: msg.sender
        }));

        emit CIDAnchored(_manifests.length - 1, cid, block.timestamp, msg.sender);
    }

    /**
     * Return the most recently anchored manifest CID.
     */
    function getLatestManifestCID() external view returns (string memory) {
        require(_manifests.length > 0, "No CIDs anchored yet");
        return _manifests[_manifests.length - 1].cid;
    }

    /**
     * Return a specific manifest entry by index.
     */
    function getManifest(uint256 index)
        external view
        returns (string memory cid, uint256 timestamp, address submitter)
    {
        require(index < _manifests.length, "Index out of range");
        ManifestEntry memory m = _manifests[index];
        return (m.cid, m.timestamp, m.submitter);
    }

    /**
     * Total number of manifests anchored.
     */
    function getManifestCount() external view returns (uint256) {
        return _manifests.length;
    }
}
