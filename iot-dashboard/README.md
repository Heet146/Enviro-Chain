# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)






### Step 3.1 — How to upload the code
```
1. Open Arduino IDE
2. File → Open → navigate to your iot_monitor folder → open iot_monitor.ino
   (Arduino will automatically find config.h, sensors.h, hashchain.h
    because they are in the same folder)

3. Edit config.h: change WIFI_SSID and WIFI_PASS to your actual WiFi

4. Tools → Board → ESP32 Arduino → ESP32 Dev Module

5. Tools → Upload Speed → 115200

6. Tools → Port → select your ESP32 port (COM3 or similar)

7. Click the Upload button (right-pointing arrow icon, second icon in toolbar)

8. Watch the bottom of the screen — you'll see:
   "Connecting........_____....."
   then "Writing at 0x00001000..."
   then "Done in 2.5 seconds"

9. After upload, open: Tools → Serial Monitor
   Set baud rate to: 115200 (bottom right dropdown)

10. You should see:
    === IoT Environmental Monitor Starting ===
    Connecting to WiFi: YourWiFiName
    ....
    WiFi OK! IP address: 192.168.1.105
    Connecting to MQTT broker... connected!
    All systems ready!
    ─────────────────────────────
    Block #1
    Temp    : 28.0 °C
    Humidity: 65.0 %
    ...
```

### Step 3.2 — Common errors and fixes for beginners

| Error message | What it means | Fix |
|---|---|---|
| `No port found` | Driver not installed | Install CP2102 driver, restart IDE |
| `WiFi: Failed!` | Wrong SSID/password | Check config.h, no spaces in name |
| `DHT11 read failed` | Wiring issue | Check 10kΩ resistor, check GPIO 4 |
| `MQTT: FAILED` | No internet or broker down | Check WiFi, try again |
| `GPS: No fix` | Normal for first 2 min | Move near window, wait |
| `Sketch too large` | Partition issue | Tools → Partition Scheme → "Huge APP" |

---

## Phase 4 — Firebase Cloud Setup

### Step 4.1 — Create your Firebase project
```
1. Open browser → go to: https://console.firebase.google.com
2. Sign in with your Google account
3. Click "Add project"
4. Project name: iot-env-monitor  → Continue
5. Turn OFF Google Analytics → Create project
6. Wait 30 seconds for project creation → click Continue
```

### Step 4.2 — Set up the Realtime Database
```
1. In Firebase console left menu: Build → Realtime Database
2. Click "Create Database"
3. Choose a location (asia-southeast1 for India)
4. Select "Start in test mode" → Enable
5. Your database URL will look like:
   https://iot-env-monitor-default-rtdb.asia-southeast1.firebasedatabase.app
   
   COPY THIS URL — you need it in Step 5
```

### Step 4.3 — Get your Admin SDK key (for the backend)
```
1. Click the gear icon (top left, next to "Project Overview")
2. Project Settings → Service accounts tab
3. Click "Generate new private key"
4. Click "Generate key" in the popup
5. A file downloads — rename it to: serviceAccountKey.json
6. Save it somewhere safe on your computer (you'll move it in Phase 5)
```

---

## Phase 5 — Backend Node.js Server

### Step 5.1 — Install Node.js
```
1. Go to: https://nodejs.org
2. Download the "LTS" version (the left button, currently v20.x)
3. Install with all default options
4. Open a terminal (Command Prompt on Windows, Terminal on Mac)
5. Type: node --version
   You should see: v20.x.x
6. Type: npm --version
   You should see: 10.x.x
```"