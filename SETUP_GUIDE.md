# IoT Environmental Monitor — Setup Guide From Scratch

This guide walk you through setting up the complete **IoT Environmental Monitor** system from scratch. This is a multi-component system comprising:
1. **IoT Device / Simulator**: ESP32 client with physical sensors (or a mock Node.js simulator) publishing cryptographically linked hash-chained blocks via MQTT.
2. **MQTT Broker**: The real-time broker coordinating messages.
3. **Backend Node.js Server**: Standard Express server storing data in Firebase, uploading raw payloads to IPFS, anchoring batches to Polygon/Ganache, and streaming real-time data over WebSockets.
4. **Firebase Database**: Realtime Database storing blocks, node statuses, and anchors.
5. **Decentralized Storage (IPFS)**: Pinning blocks securely using Pinata or a local Kubo node.
6. **Smart Contracts (Ganache & Polygon)**: Main-chain anchors and sidechain audits.
7. **React Dashboard**: Frontend showcasing metrics, maps, charts, and chain verification/recovery.

---

## Prerequisites

Before starting, make sure you have the following installed on your machine:
* **Node.js** (v18.x or later recommended) and **npm**
* **Arduino IDE** (if setting up physical hardware)
* **Git**
* **Ganache** (UI version or CLI version: `npm install -g ganache`)
* A web browser (Chrome/Edge/Firefox)

---

## Phase 1 — Firebase Cloud Setup

The backend server uses Firebase Realtime Database for fast, queryable data storage.

### 1. Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com).
2. Sign in with your Google account and click **Add project**.
3. Name the project `iot-env-monitor` (or any custom name) and click **Continue**.
4. Disable Google Analytics (optional, for faster setup) and click **Create project**.
5. Once ready, click **Continue**.

### 2. Configure the Realtime Database
1. In the left-hand menu, navigate to **Build** → **Realtime Database**.
2. Click **Create Database**.
3. Select your database location (e.g., `asia-southeast1` or your nearest region) and click **Next**.
4. Choose **Start in test mode** (this allows read/write without authentication during development) and click **Enable**.
5. Copy the Database URL from the top of the database panel (looks like `https://<your-project-id>-default-rtdb.firebaseio.com/`). You will need this for the backend `.env` configuration.

### 3. Generate the Admin SDK Key
1. Click the **Gear icon** (Project Settings) next to "Project Overview" in the top-left menu.
2. Select **Project settings**, then click the **Service accounts** tab.
3. Under "Firebase Admin SDK", select **Node.js** and click **Generate new private key**.
4. Click **Generate key** in the confirmation popup. A `.json` file will download to your machine.
5. Rename this downloaded file to `serviceAccountKey.json`.
6. Copy this file into your `iot-backend/` project directory.

---

## Phase 2 — Decentralized Storage (IPFS) Setup

You can configure IPFS in two ways depending on your environment.

### Option A: Cloud Pinning with Pinata (Recommended)
This option is easiest and does not require running a local node on your machine.
1. Sign up for a free account at [Pinata Cloud](https://app.pinata.cloud).
2. Go to **API Keys** and click **New Key**.
3. Grant permissions for `pinFileToIPFS` and `pinJSONToIPFS` (or select Admin rights) and click **Generate Key**.
4. Copy the **JWT Token** (long string).
5. In your backend `.env` file, configure:
   ```env
   IPFS_PROVIDER=pinata
   PINATA_JWT=<your_long_jwt_token_here>
   ```

### Option B: Local Kubo Node (Alternative)
Use this if you prefer hosting your own local IPFS gateway.
1. Download and install [IPFS Kubo](https://docs.ipfs.tech/install/command-line/).
2. Initialize your node:
   ```bash
   ipfs init
   ```
3. Start the IPFS daemon:
   ```bash
   ipfs daemon
   ```
4. In your backend `.env` file, configure:
   ```env
   IPFS_PROVIDER=kubo
   IPFS_API_URL=http://127.0.0.1:5001
   ```

---

## Phase 3 — Blockchain Setup (Contracts & Ganache)

The system deploys smart contracts to store individual block hashes (sidechain) and anchor periodic batch checkpoints (main-chain).

### 1. Start Ganache (Local Ethereum Development Chain)
* **If using Ganache UI**: Open the application, click **Quickstart**, and verify it is running on host `127.0.0.1` and port `7545`.
* **If using Ganache CLI**: Run `npx ganache` (or `npx ganache --port 7545`).

### 2. Compile and Deploy the Main-Chain Smart Contract
1. Navigate to the `blockchain/` folder:
   ```bash
   cd blockchain
   ```
2. Install Truffle dependencies:
   ```bash
   npm install
   ```
3. Compile the Solidity contracts:
   ```bash
   npx truffle compile
   ```
4. Deploy the contracts to Ganache:
   ```bash
   npx truffle migrate --network ganache
   ```
5. Copy the deployed contract address for `EnvMonitor` from the console output (e.g., `0x...`). You will need this address for the backend `.env` config.

### 3. Deploy the Sidechain Smart Contract (`CIDRegistry`)
The backend provides `CIDRegistry.sol` in `iot-backend/contracts/` to anchor IPFS manifest CIDs on Polygon (or local mock networks).
To deploy it locally:
1. Copy `iot-backend/contracts/CIDRegistry.sol` into the `blockchain/contracts/` directory.
2. Create a new migration file `blockchain/migrations/3_deploy_cidregistry.js` with the following content:
   ```javascript
   const CIDRegistry = artifacts.require("CIDRegistry");
   module.exports = function (deployer) {
     deployer.deploy(CIDRegistry);
   };
   ```
3. Re-run migrations on Ganache:
   ```bash
   npx truffle migrate --network ganache --reset
   ```
4. Copy the deployed `CIDRegistry` address. This will be your `ANCHOR_CONTRACT_ADDRESS` on your local network.

---

## Phase 4 — Backend Node.js Server Setup

### 1. Install Dependencies
1. Navigate to the `iot-backend/` folder:
   ```bash
   cd ../iot-backend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```

### 2. Configure Environment Variables
Create a file named `.env` in the `iot-backend/` directory:
```env
PORT=3001
FIREBASE_URL=https://<your-project-id>-default-rtdb.firebaseio.com/
MQTT_BROKER=mqtt://broker.hivemq.com
MQTT_TOPIC=iot/envmonitor/data

# IPFS Configuration
IPFS_PROVIDER=pinata
PINATA_JWT=<your_pinata_jwt_token>
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
IPFS_TIMEOUT_MS=20000

# Ganache (Main-Chain Anchors)
GANACHE_RPC_URL=http://127.0.0.1:7545
GANACHE_CONTRACT_ADDRESS=<deployed_envmonitor_address_from_truffle_migrate>

# Polygon / Local Sidechain Configuration
POLYGON_RPC_URL=http://127.0.0.1:7545
POLYGON_PRIVATE_KEY=<private_key_of_address_that_deployed_cidregistry>
ANCHOR_CONTRACT_ADDRESS=<deployed_cidregistry_address_from_truffle_migrate>

# Default Enrichment Coordinates
DEFAULT_LAT=19.072836
DEFAULT_LNG=72.899803
```
*(Make sure `serviceAccountKey.json` is also present in this folder)*

### 3. Clear/Initialize Database (Optional)
If you want to start with a fresh slate, run the cleanup utility:
```bash
node clear-firebase.js
```

### 4. Start the Server
Start the Express server:
```bash
node server.js
```
You should see output indicating that Firebase connected, the MQTT broker connected, and the server is running on `http://localhost:3001`.

---

## Phase 5 — React Dashboard Setup

### 1. Install Dependencies
1. Navigate to the `iot-dashboard/` folder:
   ```bash
   cd ../iot-dashboard
   ```
2. Install npm packages:
   ```bash
   npm install
   ```

### 2. Run the Web Application
Start the frontend development server:
```bash
npm start
```
This opens the dashboard in your default browser at `http://localhost:3000`.

---

## Phase 6 — Running Data Sources (Hardware or Simulator)

To populate the system with metrics, you must run either a simulated driver or configure physical hardware.

### Option A: Simulator (Quickest for Testing)
Run the script to simulate a node traveling along Palm Beach Road in Navi Mumbai:
1. Open a new terminal window.
2. Navigate to `iot-backend/`:
   ```bash
   cd iot-backend
   ```
3. Start the simulation:
   ```bash
   node simulate-palm-beach.js
   ```
   You will immediately see sequence blocks being hashed and published via MQTT, which the server will consume, record in Firebase, anchor on-chain, and stream to the Dashboard.

### Option B: Physical ESP32 Hardware Setup
If you have ESP32 hardware and sensor shields:
1. Open the **Arduino IDE**.
2. Go to **File** → **Open**, navigate to the `iot_monitor` folder, and open `iot_monitor.ino`.
3. Open `config.h` in the IDE and modify:
   * `WIFI_SSID`: Your WiFi network name.
   * `WIFI_PASS`: Your WiFi password.
4. Set up the ESP32 board in Arduino IDE:
   * **Tools** → **Board** → **ESP32 Arduino** → **ESP32 Dev Module**
   * **Tools** → **Upload Speed** → **115200**
   * **Tools** → **Port** → Select the COM port connected to your ESP32.
5. Compile and upload by clicking the **Upload** button (arrow icon).
6. Verify output by opening the **Serial Monitor** (**Tools** → **Serial Monitor**) set to `115200` baud rate.

---

## Phase 7 — Verification

1. **Live Dashboard**: Open `http://localhost:3000`. You should see live telemetry updating in real-time.
2. **Blockchain Entries**: Open the Ganache UI or inspect the terminal of your Ganache node. You should see incoming write transactions as blocks accumulate.
3. **Integrity Audits**: Click the **Verify Chain** button on the dashboard to test cryptographic linkage.
4. **IPFS Verification**: Copy an `ipfsCID` from the database/dashboard and open `https://gateway.pinata.cloud/ipfs/<CID>` in a browser to inspect the raw immutable JSON payload uploaded directly from the source.
