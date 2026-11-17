// iot_monitor.ino — with Phone GPS Bridge support
#include <HTTPClient.h>
#include <WiFi.h>
#include <WebServer.h>       // ← new: tiny HTTP server on ESP32
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <TinyGPS++.h>
#include <Preferences.h>
#include "config.h"
#include "sensors.h"
#include "hashchain.h"

// ── Serial ports ──
HardwareSerial gpsSerial(1);
HardwareSerial pmsSerial(2);

TinyGPSPlus gps;

WiFiClient   netClient;
PubSubClient mqtt(netClient);
WebServer    httpServer(80);   // ← ESP32 listens on port 80

// ── Hash chain state ──
String prevHash = GENESIS;
int    blockSeq = 0;
Preferences chainPreferences;

// ── GPS state — phone or hardware ──
double gpsLat    = 0.0;
double gpsLng    = 0.0;
float  gpsAlt    = 0.0;
bool   gpsFix    = false;
String gpsSource = "none";   // "phone", "hardware", or "none"

// ── PMS latest values ──
// -1 = sentinel: no valid frame received yet (sensor still warming up).
// Once the first valid frame arrives these are never reset to 0.
float latest_pm25 = -1;
float latest_pm10 = -1;

// ── Non-blocking loop timers ──
unsigned long lastSend      = 0;   // controls sendBlock() cadence
unsigned long lastGPSFetch  = 0;   // controls Firebase GPS fetch (60 s)

// ────────────────────────────────────────────────
// HTTP SERVER HANDLERS
// Phone opens: http://<ESP32-IP>/gps?lat=18.52&lng=73.85&alt=560
// ────────────────────────────────────────────────
void handleGPS() {
  // Allow phone browser to call this (CORS header)
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");

  if (httpServer.hasArg("lat") && httpServer.hasArg("lng")) {
    gpsLat    = httpServer.arg("lat").toDouble();
    gpsLng    = httpServer.arg("lng").toDouble();
    gpsAlt    = httpServer.hasArg("alt") ? httpServer.arg("alt").toFloat() : 0.0;
    gpsFix    = true;
    gpsSource = "phone";

    Serial.println("GPS from phone: " + String(gpsLat, 6) + ", " + String(gpsLng, 6));
    httpServer.send(200, "application/json", "{\"status\":\"ok\"}");
  } else {
    httpServer.send(400, "application/json", "{\"error\":\"missing lat or lng\"}");
  }
}

void handleStatus() {
  httpServer.sendHeader("Access-Control-Allow-Origin", "*");
  String json = "{\"ip\":\"" + WiFi.localIP().toString() +
                "\",\"blocks\":" + String(blockSeq) +
                ",\"gpsSource\":\"" + gpsSource +
                "\",\"lat\":" + String(gpsLat, 6) +
                ",\"lng\":" + String(gpsLng, 6) + "}";
  httpServer.send(200, "application/json", json);
}

// ────────────────────────────────────────────────
// WIFI + MQTT
// ────────────────────────────────────────────────
void connectWiFi() {
  Serial.print("\nConnecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
    if (++attempts > 30) { ESP.restart(); }
  }
  Serial.println("\nWiFi OK!");
  Serial.println("ESP32 IP address: " + WiFi.localIP().toString());
  Serial.println("Open this on your phone browser:");
  Serial.println("http://" + WiFi.localIP().toString() + "/send-gps");
}

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Connecting MQTT...");
    String cid = String(DEVICE_ID) + "-" + String(random(1000, 9999));
    if (mqtt.connect(cid.c_str())) { Serial.println(" OK!"); }
    else { delay(3000); }
  }
}

// ────────────────────────────────────────────────
// TRY HARDWARE GPS (truly non-blocking)
// Drains whatever bytes are already in the UART
// buffer right now — no waiting. GPS sentences
// accumulate between calls because loop() runs
// continuously without any hard delay.
// ────────────────────────────────────────────────
void tryHardwareGPS() {
  while (gpsSerial.available()) gps.encode(gpsSerial.read());

  // Only override phone GPS if hardware fix is acquired
  if (gps.location.isValid() && gpsSource != "phone") {
    gpsLat    = gps.location.lat();
    gpsLng    = gps.location.lng();
    gpsAlt    = gps.altitude.isValid() ? gps.altitude.meters() : 0.0;
    gpsFix    = true;
    gpsSource = "hardware";
  }
}

// ── Fetch GPS from Firebase ──
// Reads /gps/NODE_001 from your Firebase database
void fetchGPSFromFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;

  // Build Firebase REST URL
  // Replace YOUR_DATABASE_URL with your actual Firebase URL
  // Example: https://iot-env-monitor-default-rtdb.asia-southeast1.firebasedatabase.app
  String url = "https://iot-env-monitor-90a09-default-rtdb.asia-southeast1.firebasedatabase.app";

  HTTPClient http;
  http.begin(url);
  http.setTimeout(5000);
  int code = http.GET();

  if (code == 200) {
    String payload = http.getString();

    // Parse the JSON response
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err && doc.containsKey("lat")) {
      double newLat = doc["lat"];
      double newLng = doc["lng"];
      float  newAlt = doc["alt"] | 0.0;

      // Only update if we got real coordinates
      if (newLat != 0.0 && newLng != 0.0) {
        gpsLat    = newLat;
        gpsLng    = newLng;
        gpsAlt    = newAlt;
        gpsFix    = true;
        gpsSource = "firebase-phone";
        Serial.println("GPS from Firebase: " +
          String(gpsLat, 6) + ", " + String(gpsLng, 6));
      }
    }
  } else if (code == -1) {
    Serial.println("Firebase GPS fetch failed — check URL");
  }
  http.end();
}

// ────────────────────────────────────────────────
// RAW PMS5003 FRAME PARSER
// Frame layout (32 bytes):
//   [0]    0x42  start byte 1
//   [1]    0x4D  start byte 2
//   [2-3]  frame length
//   [4-5]  PM1.0  µg/m³
//   [6-7]  PM2.5  µg/m³  ← used
//   [8-9]  PM10   µg/m³  ← used
//   [10..] remaining data + checksum
// ────────────────────────────────────────────────
bool readPMS(float &pm25, float &pm10) {
  if (pmsSerial.available() < 32) return false;

  Serial.println("[PMS] parsing frame...");

  // If the buffer is misaligned, discard until we find the start byte.
  // Next call will resync naturally.
  if (pmsSerial.peek() != 0x42) {
    pmsSerial.read();
    Serial.println("[PMS] bad sync byte — discarding, will resync");
    return false;
  }

  uint8_t buf[32];
  pmsSerial.readBytes(buf, 32);

  if (buf[0] != 0x42 || buf[1] != 0x4D) {
    Serial.println("[PMS] header mismatch — frame rejected");
    return false;
  }

  pm25 = (buf[6] << 8) | buf[7];
  pm10 = (buf[8] << 8) | buf[9];

  Serial.printf("[PMS] VALID  PM2.5=%.0f µg/m³  PM10=%.0f µg/m³\n", pm25, pm10);
  return true;
}

// ────────────────────────────────────────────────
// SEND ONE DATA BLOCK
// ────────────────────────────────────────────────
void sendBlock() {
  // ── PMS debug ─────────────────────────────────────────────────────────────
  // readPMS() is now called every loop() iteration to drain the UART buffer.
  // By the time we reach sendBlock() the globals already hold the latest
  // valid frame (or -1 if no frame has arrived yet).
  Serial.println("=== PMS DEBUG ===");
  if (latest_pm25 < 0) {
    Serial.println("PM STATUS: NOT INITIALIZED — sensor still warming up");
    Serial.println("Skipping this block to avoid publishing 0 values.");
    Serial.println("=================");
    return;   // do not publish until at least one valid frame has arrived
  }
  Serial.print("latest_pm25: "); Serial.println(latest_pm25);
  Serial.print("latest_pm10: "); Serial.println(latest_pm10);
  Serial.println("=================");

  // Read DHT11 + MQ135
  SensorReading s = readSensors(latest_pm25, latest_pm10);

  // Try hardware GPS (won't overwrite phone GPS)
  tryHardwareGPS();

  // Build JSON payload
  StaticJsonDocument<600> doc;
  const int nextSeq = blockSeq + 1;
  doc["seq"]       = nextSeq;
  doc["nodeId"]    = DEVICE_ID;
  doc["ts"]        = millis();
  doc["temp"]      = s.temperature;
  doc["hum"]       = s.humidity;
  doc["co"]        = s.co_raw;
  doc["pm25"]      = s.pm25;
  doc["pm10"]      = s.pm10;
  doc["lat"]       = gpsLat;
  doc["lng"]       = gpsLng;
  doc["alt"]       = gpsAlt;
  doc["gpsFix"]    = gpsFix;
  doc["gpsSource"] = gpsSource;
  doc["prev"]      = prevHash;

  // Compute hash
  String payloadStr;
  serializeJson(doc, payloadStr);
  String currentHash = sha256(payloadStr);
  doc["hash"] = currentHash;

  String finalJson;
  serializeJson(doc, finalJson);

  // Publish
  if (!mqtt.connected()) connectMQTT();
  bool ok = mqtt.publish(MQTT_TOPIC, finalJson.c_str(), false);
  if (ok) {
    // Advance the local chain only when PubSubClient accepts the packet.
    // Advancing before publish would make the next block point to a hash the
    // backend may never have received.
    blockSeq = nextSeq;
    prevHash = currentHash;
    chainPreferences.putInt("seq", blockSeq);
    chainPreferences.putString("prev", prevHash);
  } else {
    Serial.println("Publish failed; retaining sequence and previous hash for retry.");
  }

  // Serial output
  Serial.println("─────────────────────────────");
  Serial.println("Block   : #" + String(nextSeq));
  Serial.println("Temp    : " + String(s.temperature, 1) + " °C");
  Serial.println("Humidity: " + String(s.humidity, 1)    + " %");
  Serial.println("CO raw  : " + String(s.co_raw));
  Serial.println("PM2.5   : " + String(s.pm25)           + " µg/m³");
  Serial.println("PM10    : " + String(s.pm10)           + " µg/m³");
  Serial.println("GPS src : " + gpsSource);
  if (gpsFix) {
    Serial.println("Location: " + String(gpsLat, 6) + ", " + String(gpsLng, 6));
  } else {
    Serial.println("Location: No fix — open phone page to send GPS");
    Serial.println("          http://" + WiFi.localIP().toString() + "/send-gps");
  }
  Serial.println("Hash    : " + currentHash.substring(0, 20) + "...");
  Serial.println("MQTT    : " + String(ok ? "Sent OK" : "FAILED"));
}

// ────────────────────────────────────────────────
// PHONE GPS PAGE — served directly from ESP32
// Open this URL on your phone to send location
// ────────────────────────────────────────────────
void handlePhonePage() {
  String html = R"rawhtml(
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Send GPS to ESP32</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center;
           padding: 30px; background: #f0f2f5; }
    h2   { color: #1B4F72; }
    .btn { background: #1D9E75; color: white; border: none;
           padding: 16px 32px; font-size: 18px; border-radius: 10px;
           cursor: pointer; margin: 20px 0; width: 100%; }
    .status { font-size: 15px; margin: 10px 0; padding: 12px;
              border-radius: 8px; }
    .ok  { background: #D5F5E3; color: #1E8449; }
    .err { background: #FADBD8; color: #C0392B; }
    .inf { background: #D6EAF8; color: #1B4F72; }
  </style>
</head>
<body>
  <h2>GPS Bridge</h2>
  <p>Tap the button to send your phone's location to ESP32</p>
  <button class="btn" onclick="sendGPS()">Send My Location</button>
  <div id="status" class="status inf">Press the button to start</div>
  <div id="coords" style="font-size:13px; color:#666; margin-top:10px;"></div>
  <script>
    var espIP = location.hostname;
    function sendGPS() {
      document.getElementById('status').className = 'status inf';
      document.getElementById('status').innerText = 'Getting location...';
      if (!navigator.geolocation) {
        document.getElementById('status').className = 'status err';
        document.getElementById('status').innerText = 'GPS not supported on this browser';
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;
          var alt = pos.coords.altitude || 0;
          document.getElementById('coords').innerText =
            'Lat: ' + lat.toFixed(6) + '  Lng: ' + lng.toFixed(6) +
            '  Accuracy: ' + pos.coords.accuracy.toFixed(0) + 'm';
          fetch('http://' + espIP + '/gps?lat=' + lat + '&lng=' + lng + '&alt=' + alt)
            .then(function(r){ return r.json(); })
            .then(function(d){
              document.getElementById('status').className = 'status ok';
              document.getElementById('status').innerText =
                'Location sent! ESP32 is now using your GPS.';
              setTimeout(sendGPS, 15000);
            })
            .catch(function(e){
              document.getElementById('status').className = 'status err';
              document.getElementById('status').innerText = 'Error: ' + e;
            });
        },
        function(err) {
          document.getElementById('status').className = 'status err';
          document.getElementById('status').innerText = 'Location denied: ' + err.message;
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  </script>
</body>
</html>
)rawhtml";
  httpServer.send(200, "text/html", html);
}

// ────────────────────────────────────────────────
// SETUP
// ────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("=== IoT Environmental Monitor ===");

  // Keep chain state in ESP32 NVS so a reboot/reflash doesn't silently start
  // a second chain. For an existing database, seed config.h with its latest
  // block before this firmware is first installed.
  chainPreferences.begin("envchain", false);
  if (chainPreferences.getBool("initialized", false)) {
    blockSeq = chainPreferences.getInt("seq", 0);
    prevHash = chainPreferences.getString("prev", GENESIS);
  } else {
    blockSeq = INITIAL_BLOCK_SEQ;
    if (String(INITIAL_PREV_HASH).length() == 64) {
      prevHash = INITIAL_PREV_HASH;
    } else {
      prevHash = GENESIS;
    }
    chainPreferences.putInt("seq", blockSeq);
    chainPreferences.putString("prev", prevHash);
    chainPreferences.putBool("initialized", true);
  }
  Serial.println("Chain resumes at block #" + String(blockSeq));

  gpsSerial.begin(9600, SERIAL_8N1, 26, 27);
  pmsSerial.begin(9600, SERIAL_8N1, 25, -1);   // RX=25, TX unused
  initSensors();

  connectWiFi();

  // Register HTTP routes
  httpServer.on("/send-gps", handlePhonePage);  // Phone opens this page
  httpServer.on("/gps",      handleGPS);        // Phone posts coords here
  httpServer.on("/status",   handleStatus);     // Dashboard can poll this
  httpServer.begin();
  Serial.println("HTTP server started on port 80");

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(700);
  connectMQTT();

  Serial.println("\nReady! Open this on your phone:");
  Serial.println("http://" + WiFi.localIP().toString() + "/send-gps");
  delay(2000);
}

// ────────────────────────────────────────────────
// LOOP — fully non-blocking millis() scheduler
//
// mqtt.loop() runs on EVERY iteration so the
// broker keepalive (15 s) is always satisfied.
// No delay() anywhere — loop() returns in < 1 ms
// on every pass that isn't a scheduled task.
// ────────────────────────────────────────────────
void loop() {
  // ① MQTT keepalive — must be called as often as possible
  mqtt.loop();

  // ② Drain PMS5003 UART on EVERY iteration.
  //    PMS5003 fires frames at ~1 Hz (32 bytes each). sendBlock() only runs
  //    every INTERVAL_MS (15 s). Without draining here the 256-byte RX buffer
  //    overflows after ~8 frames, causing stale/corrupt reads inside sendBlock().
  //    readPMS() is non-blocking: it returns immediately if < 32 bytes are ready.
  readPMS(latest_pm25, latest_pm10);

  // ③ HTTP server — phone GPS page, /status endpoint
  httpServer.handleClient();

  unsigned long now = millis();

  // ④ Send sensor block every INTERVAL_MS (default 15 s)
  if (now - lastSend >= INTERVAL_MS) {
    lastSend = now;
    Serial.println("MQTT connected: " + String(mqtt.connected()));
    sendBlock();
  }

  // ⑤ Firebase GPS fetch — rare, still blocks up to 5 s,
  //    so we only run it once per 60 s and re-ping MQTT after.
  if (now - lastGPSFetch >= 60000UL) {
    lastGPSFetch = now;
    fetchGPSFromFirebase();
    mqtt.loop();   // re-sync keepalive after the blocking HTTP call
  }
}
