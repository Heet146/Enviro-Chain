// sensors.h — reads DHT11 and MQ135
// NOTE: This uses DHT11 (not DHT22) — library constant is different
#ifndef SENSORS_H
#define SENSORS_H

#include <DHT.h>

#define DHT_PIN    4        // GPIO 4
#define DHT_TYPE   DHT11    // <-- IMPORTANT: DHT11, not DHT22

#define MQ135_PIN  34       // GPIO 34 (ADC input)

DHT dht(DHT_PIN, DHT_TYPE);

// Container for all sensor readings
struct SensorReading {
  float temperature;   // from DHT11, degrees Celsius
  float humidity;      // from DHT11, percent
  int   co_raw;        // from MQ135, raw ADC value 0-4095
  float pm25;          // from PMS5003
  float pm10;          // from PMS5003
  bool  dht_ok;        // true if DHT reading was valid
};

void initSensors() {
  dht.begin();
  // Let DHT11 warm up for 2 seconds
  delay(2000);
}

// Call this once per loop to get current readings
// pmsData is passed in from the main loop (PMS reads separately)
SensorReading readSensors(float pm25_val, float pm10_val) {
  SensorReading r;

  // Read DHT11
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h)) {
    // DHT11 failed — common on first read, retries on next loop
    r.temperature = 0;
    r.humidity    = 0;
    r.dht_ok      = false;
    Serial.println("WARNING: DHT11 read failed. Check wiring and 10k resistor.");
  } else {
    r.temperature = t;
    r.humidity    = h;
    r.dht_ok      = true;
  }

  // Read MQ135 (raw ADC value, 0–4095)
  // Higher value = more gas detected
  r.co_raw = analogRead(MQ135_PIN);

  // PMS5003 values passed in
  r.pm25 = pm25_val;
  r.pm10 = pm10_val;

  return r;
}

#endif