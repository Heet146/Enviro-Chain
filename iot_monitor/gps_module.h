// firmware/main/main.ino
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <TinyGPS++.h>
#include <PMS.h>
#include "config.h"
#include "sensors.h"
#include "hashchain.h"

// ── Serial ports ──
HardwareSerial gpsSerial(1);  // UART1: GPS
HardwareSerial pmsSerial(2);  // UART2: PMS5003

TinyGPSPlus gps;
PMS pms(pmsSerial);
PMS::DATA pmsData;

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ── State ──
String prevHash = GENESIS_HASH;
int    blockSeq = 0;

// ── WiFi connection ──
void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected! IP: " + WiFi.localIP().toString());
}

// ── MQTT connection ──
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT...");
    String clientId = "ESP32-" + String(DEVICE_ID);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected!");
    } else {
      Serial.print("failed, rc=");
      Serial.println(mqttClient.state());
      delay(3000);
    }
  }
}

// ── Get GPS coordinates ──
void updateGPS() {
  unsigned long start = millis();
  while (millis() - start < 2000) {  // read for 2 seconds
    while (gpsSerial.available()) {
      gps.encode(gpsSerial.read());
    }
  }
}

// ── Build and send one DataBlock ──
void sendDataBlock() {
  // 1. Read sensors
  SensorData sensors = readAllSensors(pmsData);
  
  // 2. Get GPS
  updateGPS();
  double lat = gps.location.isValid() ? gps.location.lat() : 0.0;
  double lng = gps.location.isValid() ? gps.location.lng() : 0.0;
  float  alt = gps.altitude.isValid() ? gps.altitude.meters() : 0.0;

  // 3. Build JSON payload (without hash yet)
  StaticJsonDocument<512> doc;
  doc["seq"]    = ++blockSeq;
  doc["nodeId"] = DEVICE_ID;
  doc["ts"]     = millis();  // Replace with NTP time in production
  doc["temp"]   = sensors.temperature;
  doc["hum"]    = sensors.humidity;
  doc["co"]     = sensors.co_raw;
  doc["lpg"]    = sensors.lpg_raw;
  doc["pm25"]   = sensors.pm25;
  doc["pm10"]   = sensors.pm10;
  doc["lat"]    = lat;
  doc["lng"]    = lng;
  doc["alt"]    = alt;
  doc["prev"]   = prevHash;

  // 4. Serialize to string, compute SHA-256
  String payloadStr;
  serializeJson(doc, payloadStr);
  String currentHash = computeSHA256(payloadStr);

  // 5. Add hash to doc and re-serialize
  doc["hash"] = currentHash;
  String finalJson;
  serializeJson(doc, finalJson);

  // 6. Update chain state
  prevHash = currentHash;

  // 7. Publish via MQTT
  if (!mqttClient.connected()) connectMQTT();
  bool published = mqttClient.publish(MQTT_TOPIC, finalJson.c_str());
  
  // 8. Debug output
  Serial.println("=== Block " + String(blockSeq) + " ===");
  Serial.println("Hash: " + currentHash.substring(0, 16) + "...");
  Serial.println("Temp: " + String(sensors.temperature) + "°C");
  Serial.println("PM2.5: " + String(sensors.pm25) + " µg/m³");
  Serial.println("GPS: " + String(lat, 6) + ", " + String(lng, 6));
  Serial.println("Published: " + String(published ? "YES" : "NO"));
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  
  // Init serial ports for GPS and PMS
  gpsSerial.begin(9600, SERIAL_8N1, 26, 27);   // GPS: RX=26, TX=27
  pmsSerial.begin(9600, SERIAL_8N1, -1, 25);   // PMS: RX=13, TX=25
  
  initSensors();
  connectWiFi();
  
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setBufferSize(1024);  // Increase for large JSON payloads
  
  Serial.println("System initialized. Starting monitoring loop...");
  delay(2000);
}

void loop() {
  // Keep MQTT alive
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();
  
  // Read PMS5003 (non-blocking)
  pms.read(pmsData);
  
  // Send a data block every SAMPLE_INTERVAL ms
  sendDataBlock();
  delay(SAMPLE_INTERVAL);
}
```

### Step 3.6 — Upload and test the firmware
```
1. Connect ESP32 to PC via USB
2. Open Arduino IDE → Open → select main.ino
3. Tools → Board → ESP32 Dev Module
4. Tools → Port → select your COM port (e.g., COM5 on Windows, /dev/ttyUSB0 on Linux)
5. Click Upload button (→ arrow icon)
6. After upload: Tools → Serial Monitor → set baud to 115200
7. You should see:
   "WiFi connected! IP: 192.168.x.x"
   "Connecting to MQTT... connected!"
   "=== Block 1 ==="
   "Hash: a3f8c2d1..."
```

**Common problems & fixes:**
- `Failed to connect to MQTT` → Check you have internet; try broker.hivemq.com port 1883
- `Temp: -999` → DHT22 wiring wrong; check pull-up resistor
- `GPS: 0.0, 0.0` → No GPS fix yet; take device near a window or outdoors; wait 60 seconds

---

## Phase 4 — Firebase Cloud Setup (Day 8–9)

### Step 4.1 — Create Firebase project
```
1. Go to https://console.firebase.google.com
2. Click "Add project" → name it "env-monitor-iot"
3. Disable Google Analytics (not needed) → Create project
4. Left sidebar → Build → Realtime Database
5. Click "Create Database" → Start in TEST mode → Choose nearest region
6. Copy your database URL: https://env-monitor-iot-default-rtdb.firebaseio.com