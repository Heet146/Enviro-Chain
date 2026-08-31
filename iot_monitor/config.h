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

// ── How often to send a reading (milliseconds) ──
#define INTERVAL_MS   15000   // 15 seconds — good for testing

#endif