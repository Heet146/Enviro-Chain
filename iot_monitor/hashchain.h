// hashchain.h — SHA-256 hash computation using ESP32 built-in crypto
#ifndef HASHCHAIN_H
#define HASHCHAIN_H

#include "mbedtls/sha256.h"

// Convert 32-byte hash array to 64-char hex string
String toHexString(uint8_t* hash) {
  String hex = "";
  for (int i = 0; i < 32; i++) {
    if (hash[i] < 16) hex += "0";  // pad single digit with leading zero
    hex += String(hash[i], HEX);
  }
  return hex;
}

// Main hash function — input any string, get 64-char hex SHA-256 back
String sha256(const String& input) {
  uint8_t hash[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts(&ctx, 0);  // 0 means SHA-256 (not SHA-224)
  mbedtls_sha256_update(&ctx,
    (const unsigned char*)input.c_str(),
    input.length());
  mbedtls_sha256_finish(&ctx, hash);
  mbedtls_sha256_free(&ctx);
  return toHexString(hash);
}

// The very first block uses this as its "previous hash"
// 64 zeros = genesis block marker
const String GENESIS = 
  "0000000000000000000000000000000000000000000000000000000000000000";

#endif