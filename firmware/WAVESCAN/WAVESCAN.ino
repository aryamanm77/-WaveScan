/**
 * WAVESCAN — Mobile Wi-Fi Analyzer Firmware
 * Target: ESP32-WROOM-32 (2.4 GHz)
 * Features:
 *   - Asynchronous non-blocking Wi-Fi scanning
 *   - Dual Mode: Android Hotspot STA mode with auto-fallback to SoftAP (WAVESCAN-AP)
 *   - High-performance HTTP REST API
 *   - Real-time LittleFS + PROGMEM fallback web asset delivery
 *   - Circular buffer signal history logging & CSV export
 *   - Zero hardware budget (No OLED, No external sensors, ₹0 extra cost)
 */

#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include "web_assets.h"

// ==========================================
// CONFIGURATION & CREDENTIALS
// ==========================================
// Primary Hotspot Credentials (Android Phone 2.4 GHz Hotspot)
// Update these to match your phone's hotspot, or connect to the fallback SoftAP
const char* DEFAULT_HOTSPOT_SSID = "AndroidAP";
const char* DEFAULT_HOTSPOT_PASS = "12345678";

// Standalone Fallback SoftAP (activates automatically if hotspot is not found)
const char* FALLBACK_AP_SSID = "WΛVΞSCAN";
const char* FALLBACK_AP_PASS = "wavescan123";

// Scan & System Timing
const uint32_t HOTSPOT_CONNECT_TIMEOUT_MS = 8000; // 8 seconds connection attempt
const uint32_t AUTO_SCAN_INTERVAL_MS = 3500;      // 3.5 seconds between scans

// ==========================================
// DATA STRUCTURES
// ==========================================
struct NetworkRecord {
  String ssid;
  String bssid;
  int32_t rssi;
  int32_t channel;
  String encryption;
  bool isSecured;
};

struct HistoryRecord {
  uint32_t timestampMs;
  char ssid[33];
  char bssid[18];
  int8_t rssi;
  uint8_t channel;
  char encryption[16];
};

#define MAX_HISTORY 128
HistoryRecord historyBuffer[MAX_HISTORY];
size_t historyHead = 0;
size_t historyCount = 0;

// ==========================================
// GLOBAL STATE
// ==========================================
WebServer server(80);

std::vector<NetworkRecord> currentNetworks;
bool isScanning = false;
unsigned long scanStartTime = 0;
unsigned long lastScanDuration = 0;
unsigned long lastScanCompletedAt = 0;
bool isSoftAPMode = false;
bool littleFsMounted = false;

// ==========================================
// FORWARD DECLARATIONS
// ==========================================
void startScan();
void handleScanStateMachine();
String getEncryptionTypeString(wifi_auth_mode_t authmode);
void recordHistory(const NetworkRecord& net);
void setupHttpServer();

// ==========================================
// HARDWARE SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n");
  Serial.println("==================================================");
  Serial.println("     WAVESCAN — ESP32 Wi-Fi Analyzer Engine      ");
  Serial.println("==================================================");

  // 1. Initialize LittleFS Filesystem
  if (LittleFS.begin(true)) {
    littleFsMounted = true;
    Serial.println("[LittleFS] Filesystem mounted successfully.");
  } else {
    littleFsMounted = false;
    Serial.println("[LittleFS] Warning: Mount failed, using embedded PROGMEM assets.");
  }

  // 2. Start Wi-Fi Access Point IMMEDIATELY (Instant Boot, 0 Delay!)
  WiFi.persistent(false);
  WiFi.disconnect(true);
  delay(50);
  WiFi.mode(WIFI_AP_STA);

  WiFi.softAP(FALLBACK_AP_SSID, FALLBACK_AP_PASS);
  isSoftAPMode = true;

  Serial.println("[Wi-Fi] Standalone Access Point Started Instantly!");
  Serial.printf("[Wi-Fi] Broadcast SSID: %s\n", FALLBACK_AP_SSID);
  Serial.printf("[Wi-Fi] Password: %s\n", FALLBACK_AP_PASS);
  Serial.print("[Wi-Fi] Web Dashboard IP: http://");
  Serial.println(WiFi.softAPIP());
  Serial.printf("[Wi-Fi] Connect your phone to '%s' (Password: %s)\n", FALLBACK_AP_SSID, FALLBACK_AP_PASS);

  // 3. Configure HTTP Server Endpoints
  setupHttpServer();
  server.begin();
  Serial.println("[HTTP] Web server started on port 80.");

  // 4. Trigger Initial Async Scan
  startScan();

  Serial.println("==================================================");
  if (isSoftAPMode) {
    Serial.print(">>> OPEN IN ANDROID CHROME: http://");
    Serial.print(WiFi.softAPIP());
    Serial.println("/ <<<");
  } else {
    Serial.print(">>> OPEN IN ANDROID CHROME: http://");
    Serial.print(WiFi.localIP());
    Serial.println("/ <<<");
  }
  Serial.println("==================================================");
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  server.handleClient();
  handleScanStateMachine();
}

// ==========================================
// ASYNCHRONOUS WI-FI SCAN ENGINE
// ==========================================
void startScan() {
  if (isScanning) return;

  WiFi.scanDelete(); // Ensure any previous scan handle is cleared
  int16_t res = WiFi.scanNetworks(true, true);
  if (res == WIFI_SCAN_FAILED) {
    Serial.println("[Scan] Scan trigger failed, retrying shortly...");
    isScanning = false;
    lastScanCompletedAt = millis();
    return;
  }

  isScanning = true;
  scanStartTime = millis();
}

void handleScanStateMachine() {
  if (isScanning) {
    int16_t scanStatus = WiFi.scanComplete();

    if (scanStatus >= 0) {
      // Scan Completed Successfully!
      currentNetworks.clear();
      currentNetworks.reserve(scanStatus);

      for (int i = 0; i < scanStatus; i++) {
        NetworkRecord rec;
        rec.ssid = WiFi.SSID(i);
        rec.bssid = WiFi.BSSIDstr(i);
        rec.rssi = WiFi.RSSI(i);
        rec.channel = WiFi.channel(i);
        wifi_auth_mode_t auth = WiFi.encryptionType(i);
        rec.encryption = getEncryptionTypeString(auth);
        rec.isSecured = (auth != WIFI_AUTH_OPEN);

        currentNetworks.push_back(rec);
        recordHistory(rec);
      }

      WiFi.scanDelete(); // Free scan memory in ESP32 SDK
      isScanning = false;
      lastScanDuration = millis() - scanStartTime;
      lastScanCompletedAt = millis();

      Serial.printf("[Scan] Detected %d networks in %lu ms\n", (int)currentNetworks.size(), lastScanDuration);
    } else if (scanStatus == WIFI_SCAN_FAILED) {
      Serial.println("[Scan] Scan failed or interrupted, retrying...");
      WiFi.scanDelete();
      isScanning = false;
      lastScanCompletedAt = millis();
    }
  } else {
    // Auto-scan trigger after interval
    if (millis() - lastScanCompletedAt >= AUTO_SCAN_INTERVAL_MS) {
      startScan();
    }
  }
}

void recordHistory(const NetworkRecord& net) {
  HistoryRecord& rec = historyBuffer[historyHead];
  rec.timestampMs = millis();
  strncpy(rec.ssid, net.ssid.c_str(), sizeof(rec.ssid) - 1);
  rec.ssid[sizeof(rec.ssid) - 1] = '\0';

  strncpy(rec.bssid, net.bssid.c_str(), sizeof(rec.bssid) - 1);
  rec.bssid[sizeof(rec.bssid) - 1] = '\0';

  rec.rssi = (int8_t)constrain(net.rssi, -128, 127);
  rec.channel = (uint8_t)net.channel;

  strncpy(rec.encryption, net.encryption.c_str(), sizeof(rec.encryption) - 1);
  rec.encryption[sizeof(rec.encryption) - 1] = '\0';

  historyHead = (historyHead + 1) % MAX_HISTORY;
  if (historyCount < MAX_HISTORY) {
    historyCount++;
  }
}

String getEncryptionTypeString(wifi_auth_mode_t authmode) {
  switch (authmode) {
    case WIFI_AUTH_OPEN:            return "OPEN";
    case WIFI_AUTH_WEP:             return "WEP";
    case WIFI_AUTH_WPA_PSK:         return "WPA";
    case WIFI_AUTH_WPA2_PSK:        return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK:    return "WPA/WPA2";
    case WIFI_AUTH_WPA2_ENTERPRISE: return "WPA2-Enterprise";
    case WIFI_AUTH_WPA3_PSK:        return "WPA3";
    case WIFI_AUTH_WPA2_WPA3_PSK:   return "WPA2/WPA3";
    default:                        return "Secured";
  }
}

// ==========================================
// HTTP SERVER & REST API IMPLEMENTATION
// ==========================================
void handleCORS() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleRoot() {
  handleCORS();
  if (littleFsMounted && LittleFS.exists("/index.html")) {
    File file = LittleFS.open("/index.html", "r");
    server.streamFile(file, "text/html");
    file.close();
  } else {
    // Embedded PROGMEM fallback
    server.send_P(200, "text/html", INDEX_HTML);
  }
}

void handleStyle() {
  handleCORS();
  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  if (littleFsMounted && LittleFS.exists("/style.css")) {
    File file = LittleFS.open("/style.css", "r");
    server.streamFile(file, "text/css");
    file.close();
  } else {
    server.send_P(200, "text/css", STYLE_CSS);
  }
}

void handleScript() {
  handleCORS();
  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  if (littleFsMounted && LittleFS.exists("/app.js")) {
    File file = LittleFS.open("/app.js", "application/javascript");
    server.streamFile(file, "application/javascript");
    file.close();
  } else {
    server.send_P(200, "application/javascript", APP_JS);
  }
}

void handleManifest() {
  handleCORS();
  server.sendHeader("Cache-Control", "public, max-age=86400");
  if (littleFsMounted && LittleFS.exists("/manifest.json")) {
    File file = LittleFS.open("/manifest.json", "r");
    server.streamFile(file, "application/manifest+json");
    file.close();
  } else {
    server.send_P(200, "application/manifest+json", MANIFEST_JSON);
  }
}

void handleServiceWorker() {
  handleCORS();
  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server.sendHeader("Service-Worker-Allowed", "/");
  if (littleFsMounted && LittleFS.exists("/sw.js")) {
    File file = LittleFS.open("/sw.js", "r");
    server.streamFile(file, "application/javascript");
    file.close();
  } else {
    server.send_P(200, "application/javascript", SW_JS);
  }
}

void handleIconSvg() {
  handleCORS();
  server.sendHeader("Cache-Control", "public, max-age=604800");
  if (littleFsMounted && LittleFS.exists("/icons/icon.svg")) {
    File file = LittleFS.open("/icons/icon.svg", "r");
    server.streamFile(file, "image/svg+xml");
    file.close();
  } else {
    server.send_P(200, "image/svg+xml", ICON_SVG);
  }
}

void handleIcon192() {
  handleCORS();
  server.sendHeader("Cache-Control", "public, max-age=604800");
  if (littleFsMounted && LittleFS.exists("/icons/icon-192.png")) {
    File file = LittleFS.open("/icons/icon-192.png", "r");
    server.streamFile(file, "image/png");
    file.close();
  } else {
    server.send_P(200, "image/png", (const char*)ICON_192_PNG, ICON_192_PNG_LEN);
  }
}

void handleIcon512() {
  handleCORS();
  server.sendHeader("Cache-Control", "public, max-age=604800");
  if (littleFsMounted && LittleFS.exists("/icons/icon-512.png")) {
    File file = LittleFS.open("/icons/icon-512.png", "r");
    server.streamFile(file, "image/png");
    file.close();
  } else {
    server.send_P(200, "image/png", (const char*)ICON_512_PNG, ICON_512_PNG_LEN);
  }
}

void handleStatus() {
  handleCORS();
  JsonDocument doc;

  doc["connected"] = (WiFi.status() == WL_CONNECTED);
  doc["mode"] = isSoftAPMode ? "SoftAP Standalone" : "Station (STA)";
  doc["connectedSSID"] = isSoftAPMode ? FALLBACK_AP_SSID : DEFAULT_HOTSPOT_SSID;
  doc["ip"] = isSoftAPMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  doc["mac"] = isSoftAPMode ? WiFi.softAPmacAddress() : WiFi.macAddress();
  doc["uptimeSeconds"] = millis() / 1000;
  doc["scanning"] = isScanning;
  doc["detectedCount"] = currentNetworks.size();
  doc["lastScanDuration"] = lastScanDuration;
  doc["freeHeap"] = ESP.getFreeHeap();

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleScanTrigger() {
  handleCORS();
  if (!isScanning) {
    startScan();
  }
  server.send(200, "application/json", "{\"status\":\"scanning_started\"}");
}

void handleResults() {
  handleCORS();
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();

  for (const auto& net : currentNetworks) {
    JsonObject obj = arr.add<JsonObject>();
    obj["ssid"] = net.ssid;
    obj["bssid"] = net.bssid;
    obj["rssi"] = net.rssi;
    obj["channel"] = net.channel;
    obj["encryption"] = net.encryption;
    obj["isSecured"] = net.isSecured;
  }

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleHistory() {
  handleCORS();
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();

  size_t startIdx = (historyHead + MAX_HISTORY - historyCount) % MAX_HISTORY;
  for (size_t i = 0; i < historyCount; i++) {
    size_t idx = (startIdx + i) % MAX_HISTORY;
    const HistoryRecord& rec = historyBuffer[idx];
    JsonObject obj = arr.add<JsonObject>();
    obj["timestamp"] = rec.timestampMs;
    obj["ssid"] = String(rec.ssid);
    obj["bssid"] = String(rec.bssid);
    obj["rssi"] = rec.rssi;
    obj["channel"] = rec.channel;
    obj["encryption"] = String(rec.encryption);
  }

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleHistoryCSV() {
  handleCORS();
  server.sendHeader("Content-Disposition", "attachment; filename=\"wavescan_history.csv\"");

  String csv = "Timestamp_ms,SSID,BSSID,Channel,RSSI_dBm,Security\r\n";

  size_t startIdx = (historyHead + MAX_HISTORY - historyCount) % MAX_HISTORY;
  for (size_t i = 0; i < historyCount; i++) {
    size_t idx = (startIdx + i) % MAX_HISTORY;
    const HistoryRecord& rec = historyBuffer[idx];

    // CSV line with escaping
    String cleanSSID = String(rec.ssid);
    cleanSSID.replace("\"", "\"\"");

    csv += String(rec.timestampMs) + ",\"";
    csv += cleanSSID + "\",\"";
    csv += String(rec.bssid) + "\",";
    csv += String(rec.channel) + ",";
    csv += String(rec.rssi) + ",\"";
    csv += String(rec.encryption) + "\"\r\n";
  }

  server.send(200, "text/csv", csv);
}

void handleNetworkDetail() {
  handleCORS();
  if (!server.hasArg("bssid")) {
    server.send(400, "application/json", "{\"error\":\"bssid parameter required\"}");
    return;
  }

  String targetBSSID = server.arg("bssid");
  targetBSSID.toUpperCase();

  for (const auto& net : currentNetworks) {
    String curBSSID = net.bssid;
    curBSSID.toUpperCase();
    if (curBSSID == targetBSSID) {
      JsonDocument doc;
      doc["ssid"] = net.ssid;
      doc["bssid"] = net.bssid;
      doc["rssi"] = net.rssi;
      doc["channel"] = net.channel;
      doc["encryption"] = net.encryption;
      doc["isSecured"] = net.isSecured;
      doc["frequencyMHz"] = (net.channel >= 1 && net.channel <= 13) ? (2412 + (net.channel - 1) * 5) : 2484;

      String response;
      serializeJson(doc, response);
      server.send(200, "application/json", response);
      return;
    }
  }

  server.send(404, "application/json", "{\"error\":\"Network not found in recent scan\"}");
}

void handlePing() {
  handleCORS();
  server.send(200, "text/plain", "pong");
}

void handleSpeedTest() {
  handleCORS();
  server.sendHeader("Content-Type", "application/octet-stream");
  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  // Stream 128 KB of deterministic test payload in 4KB chunks
  const size_t CHUNK_SIZE = 4096;
  const size_t TOTAL_CHUNKS = 32; // 32 * 4KB = 128 KB
  uint8_t buffer[CHUNK_SIZE];
  memset(buffer, 0xAA, CHUNK_SIZE);

  server.setContentLength(CHUNK_SIZE * TOTAL_CHUNKS);
  server.send(200, "application/octet-stream", "");

  WiFiClient client = server.client();
  for (size_t i = 0; i < TOTAL_CHUNKS; i++) {
    if (!client.connected()) break;
    client.write(buffer, CHUNK_SIZE);
  }
}

void setupHttpServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/style.css", HTTP_GET, handleStyle);
  server.on("/app.js", HTTP_GET, handleScript);
  server.on("/manifest.json", HTTP_GET, handleManifest);
  server.on("/sw.js", HTTP_GET, handleServiceWorker);
  server.on("/icons/icon.svg", HTTP_GET, handleIconSvg);
  server.on("/icons/icon-192.png", HTTP_GET, handleIcon192);
  server.on("/icons/icon-512.png", HTTP_GET, handleIcon512);

  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/scan", HTTP_POST, handleScanTrigger);
  server.on("/api/results", HTTP_GET, handleResults);
  server.on("/api/history", HTTP_GET, handleHistory);
  server.on("/api/history.csv", HTTP_GET, handleHistoryCSV);
  server.on("/api/network", HTTP_GET, handleNetworkDetail);
  server.on("/api/ping", HTTP_GET, handlePing);
  server.on("/api/speedtest", HTTP_GET, handleSpeedTest);

  server.onNotFound([]() {
    handleCORS();
    server.send(404, "text/plain", "WAVESCAN: Resource Not Found");
  });
}
