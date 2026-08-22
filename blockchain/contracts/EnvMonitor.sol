// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract EnvMonitor {

    // ── Data structure for one sensor reading ──
    struct SensorBlock {
        uint256 seq;          // block sequence number
        string  nodeId;       // device ID e.g. NODE_001
        int256  temperature;  // temp × 100 (e.g. 29.4°C = 2940)
        uint256 humidity;     // humidity × 100
        uint256 co;           // MQ135 raw value
        uint256 pm25;         // PM2.5 × 100
        uint256 pm10;         // PM10 × 100
        int256  lat;          // latitude × 1000000
        int256  lng;          // longitude × 1000000
        bytes32 dataHash;     // SHA-256 of the full JSON block
        bytes32 prevHash;     // hash of previous block
        uint256 timestamp;    // unix timestamp
    }

    // ── Storage ──
    SensorBlock[] public blocks;
    address public owner;
    uint256 public blockCount;

    // ── Events (emitted on every new block — dashboard listens to these) ──
    event NewSensorBlock(
        uint256 indexed seq,
        string  nodeId,
        bytes32 dataHash,
        bytes32 prevHash,
        uint256 timestamp
    );

    event TamperDetected(
        uint256 indexed seq,
        bytes32 storedHash,
        bytes32 computedHash
    );

    // ── Constructor ──
    constructor() {
        owner = msg.sender;
        blockCount = 0;
    }

    // ── Store a new sensor block ──
    function storeBlock(
        uint256 _seq,
        string  memory _nodeId,
        int256  _temperature,
        uint256 _humidity,
        uint256 _co,
        uint256 _pm25,
        uint256 _pm10,
        int256  _lat,
        int256  _lng,
        bytes32 _dataHash,
        bytes32 _prevHash
    ) public {
        SensorBlock memory newBlock = SensorBlock({
            seq:         _seq,
            nodeId:      _nodeId,
            temperature: _temperature,
            humidity:    _humidity,
            co:          _co,
            pm25:        _pm25,
            pm10:        _pm10,
            lat:         _lat,
            lng:         _lng,
            dataHash:    _dataHash,
            prevHash:    _prevHash,
            timestamp:   block.timestamp
        });

        blocks.push(newBlock);
        blockCount++;

        emit NewSensorBlock(_seq, _nodeId, _dataHash, _prevHash, block.timestamp);
    }

    // ── Get a block by index ──
    function getBlock(uint256 index) public view returns (SensorBlock memory) {
        require(index < blocks.length, "Block index out of range");
        return blocks[index];
    }

    // ── Get total number of blocks stored ──
    function getBlockCount() public view returns (uint256) {
        return blockCount;
    }

    // ── Verify chain integrity on-chain ──
    function verifyChain() public view returns (bool intact, uint256 tamperedAt) {
        for (uint256 i = 1; i < blocks.length; i++) {
            if (blocks[i].prevHash != blocks[i-1].dataHash) {
                return (false, i);
            }
        }
        return (true, 0);
    }

    // ── Get latest block hash ──
    function getLatestHash() public view returns (bytes32) {
        if (blocks.length == 0) return bytes32(0);
        return blocks[blocks.length - 1].dataHash;
    }
}
