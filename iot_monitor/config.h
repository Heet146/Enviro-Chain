// config.h  — put YOUR wifi name and password here
#ifndef CONFIG_H
#define CONFIG_H

// ── Change these two lines to match your WiFi ──
#define WIFI_SSID     "Heet"       // e.g. "JioFiber_Home"
#define WIFI_PASS     "wehc0336"   // e.g. "mypassword123"

// ── MQTT broker (free public broker, no account needed) ──
#define MQTT_HOST     "broker.hivemq.com"
#define MQTT_PORT     1883
#define MQTT_TOPIC    "iot/envmonitor/data"
#define DEVICE_ID     "NODE_001"

// Chain recovery seed. For an existing Firebase history, set these once to
// the sequence and full hash of its newest block before the first upload of
// firmware with persistent chain state. Leave at 0/empty for a fresh database.
#define INITIAL_BLOCK_SEQ 0
#define INITIAL_PREV_HASH ""

// ── How often to send a reading (milliseconds) ──
#define INTERVAL_MS   60000   // 60 seconds 

#endif
