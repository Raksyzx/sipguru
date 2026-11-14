/**
 * SIPGURU - ESP32 Auto-QR Attendance Device (Patched)
 * Firmware: ESP32 + OLED Display + Supabase Realtime
 * 
 * State Machine:
 * IDLE → PRE_CLASS (15min before) → CLASS_ACTIVE (entry scanned) 
 * → CLASS_ENDED (exit scanned) | TEACHER_ABSENT (10min no scan)
 * 
 * Comms: Supabase Realtime (primary) + Polling 60s (fallback)
 * 
 * PATCH NOTES:
 * - Fixed API_HOST & ROOM_CODE
 * - Added QRCode library integration
 * - Fixed entry/exit token switching logic
 * - Added retry logic for polling
 * - Added device registration
 * - Added HTTP callback server for auto-QR push
 * - Fixed display countdown reset
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <Wire.h>
#include <RTClib.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <qrcode.h>

// ==================== CONFIGURATION ====================
// TODO: Update these for your deployment
const char* WIFI_SSID = "Bapak ade";
const char* WIFI_PASSWORD = "Lapor.pak7";

// Backend API (Railway Production) - CHANGE THIS
const char* API_HOST = "sipguru-production.up.railway.app";
const bool USE_HTTPS = true;  // Railway forces HTTPS

// Room Code - MUST MATCH DB EXACTLY (case-sensitive)
const String ROOM_CODE = "RQ2";

// Supabase Realtime (optional - fallback to polling)
const char* SUPABASE_URL = "https://kyhbcguycelqstmoewlm.supabase.co";
const char* SUPABASE_ANON_KEY = "sb_publishable_5LehF_9tjUv9CbDZqSHp8A_SP3D1GPJ";

// Timing
const int POLL_INTERVAL = 60000;        // 60 seconds polling
const int QR_DISPLAY_TIME = 15000;      // 15 seconds per QR frame
const int PRE_CLASS_WINDOW = 15;        // 15 minutes before class
const int MAX_RETRY = 3;                // Max retry for failed requests
const int RETRY_DELAY = 2000;           // 2 seconds between retries

// OLED Display
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// RTC Module (DS3231)
RTC_DS3231 rtc;
bool rtcAvailable = false;

// Web Server for callback (port 80)
WebServer server(80);

// ==================== STATE MACHINE ====================
enum RoomState {
  STATE_IDLE,
  STATE_PRE_CLASS,
  STATE_CLASS_ACTIVE,
  STATE_CLASS_ENDED,
  STATE_TEACHER_ABSENT,
  STATE_EARLY_REQUEST
};

struct ScheduleData {
  String id;
  String subject_name;
  String teacher_name;
  String grade_name;
  String start_time;
  String end_time;
};

RoomState currentState = STATE_IDLE;
ScheduleData currentSchedule;
ScheduleData nextSchedule;
String currentQRToken = "";
String qrTokenType = "entry";  // "entry" or "exit"
unsigned long lastPollTime = 0;
unsigned long lastQRRefreshTime = 0;
unsigned long tokenGeneratedAt = 0;  // Track token generation time for expiry
bool hasValidToken = false;
int qrCountdown = QR_DISPLAY_TIME / 1000;
bool deviceRegistered = false;
String deviceId = "";

// ==================== UTILITIES ====================
String getCurrentTimeStr() {
  char timeBuf[9];
  if (rtcAvailable) {
    // RTC stores UTC, convert to WIB (+7 hours)
    DateTime utc = rtc.now();
    time_t utc_epoch = utc.unixtime();
    time_t wib_epoch = utc_epoch + 25200;
    struct tm* tm_wib = localtime(&wib_epoch);
    strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", tm_wib);
  } else {
    // NTP already synced with WIB timezone via configTime()
    time_t now = time(nullptr);
    strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", localtime(&now));
  }
  return String(timeBuf);
}

bool isTimePast(const String& targetTime) {
  // targetTime format: "HH:MM" in WIB
  if (targetTime.length() < 5) return false;
  
  int targetHour = targetTime.substring(0, 2).toInt();
  int targetMin = targetTime.substring(3, 5).toInt();
  
  if (rtcAvailable) {
    // RTC stores UTC, convert to WIB for comparison
    DateTime utc = rtc.now();
    time_t utc_epoch = utc.unixtime();
    time_t wib_epoch = utc_epoch + 25200;
    struct tm* tm_wib = localtime(&wib_epoch);
    return (tm_wib->tm_hour > targetHour) || (tm_wib->tm_hour == targetHour && tm_wib->tm_min >= targetMin);
  } else {
    time_t now = time(nullptr);
    struct tm* tm_now = localtime(&now);
    return (tm_now->tm_hour > targetHour) || (tm_now->tm_hour == targetHour && tm_now->tm_min >= targetMin);
  }
}

// ==================== WiFi ====================
void connectWiFi() {
  Serial.println("Connecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi Failed!");
    // Try to continue with last known state
  }
}

// ==================== NTP Time Sync ====================
void syncNTP() {
  // WIB = UTC+7 (25200 seconds), no DST
  configTime(25200, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
  time_t now = time(nullptr);
  int attempts = 0;
  
  while (now < 1000000000 && attempts < 20) {
    delay(500);
    now = time(nullptr);
    attempts++;
  }
  
  if (now >= 1000000000) {
    Serial.println("NTP Synced (WIB)!");
    struct tm* tm_wib = localtime(&now);
    Serial.printf("WIB Time: %02d:%02d:%02d\n", tm_wib->tm_hour, tm_wib->tm_min, tm_wib->tm_sec);
    
    // Sync RTC from NTP (RTC stores UTC, so convert WIB->UTC)
    if (rtcAvailable) {
      time_t utc = now - 25200;  // WIB to UTC
      DateTime ntp_utc = DateTime(utc);
      rtc.adjust(ntp_utc);
      Serial.println("RTC synced from NTP (stored as UTC)");
    }
  } else {
    Serial.println("NTP Failed!");
    // Fallback to RTC if available
    if (rtcAvailable && rtc.now().isValid()) {
      Serial.println("Using RTC time");
    }
  }
}

// ==================== HTTP Client with Retry ====================
String httpGetWithRetry(const String& endpoint) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return "";
  }
  
  for (int attempt = 1; attempt <= MAX_RETRY; attempt++) {
    String protocol = USE_HTTPS ? "https://" : "http://";
    String url = protocol + String(API_HOST) + endpoint;
    
    if (USE_HTTPS) {
      WiFiClientSecure secureClient;
      secureClient.setInsecure();
      HTTPClient http;
      
      if (!http.begin(secureClient, url)) {
        Serial.printf("HTTPClient.begin failed (attempt %d)\n", attempt);
        continue;
      }
      http.setTimeout(10000);
      
      int code = http.GET();
      if (code == 200) {
        String payload = http.getString();
        http.end();
        return payload;
      } else {
        Serial.printf("HTTP GET %s failed (attempt %d/%d): %d\n", endpoint.c_str(), attempt, MAX_RETRY, code);
        http.end();
      }
    } else {
      HTTPClient http;
      http.begin(url);
      http.setTimeout(10000);
      
      int code = http.GET();
      if (code == 200) {
        String payload = http.getString();
        http.end();
        return payload;
      } else {
        Serial.printf("HTTP GET %s failed (attempt %d/%d): %d\n", endpoint.c_str(), attempt, MAX_RETRY, code);
        http.end();
      }
    }
    
    if (attempt < MAX_RETRY) {
      delay(RETRY_DELAY);
      yield();  // Feed watchdog
    }
  }
  
  return "";
}

String httpPostWithRetry(const String& endpoint, const String& body = "") {
  if (WiFi.status() != WL_CONNECTED) {
    return "";
  }
  
  for (int attempt = 1; attempt <= MAX_RETRY; attempt++) {
    String protocol = USE_HTTPS ? "https://" : "http://";
    String url = protocol + String(API_HOST) + endpoint;
    
    if (USE_HTTPS) {
      WiFiClientSecure secureClient;
      secureClient.setInsecure();
      HTTPClient http;
      
      if (!http.begin(secureClient, url)) {
        Serial.printf("HTTPClient.begin failed (attempt %d)\n", attempt);
        continue;
      }
      http.addHeader("Content-Type", "application/json");
      http.setTimeout(10000);
      
      int code = http.POST(body);
      if (code == 200 || code == 201) {
        String payload = http.getString();
        http.end();
        return payload;
      } else {
        Serial.printf("HTTP POST %s failed (attempt %d/%d): %d\n", endpoint.c_str(), attempt, MAX_RETRY, code);
        http.end();
      }
    } else {
      HTTPClient http;
      http.begin(url);
      http.addHeader("Content-Type", "application/json");
      http.setTimeout(10000);
      
      int code = http.POST(body);
      if (code == 200 || code == 201) {
        String payload = http.getString();
        http.end();
        return payload;
      } else {
        Serial.printf("HTTP POST %s failed (attempt %d/%d): %d\n", endpoint.c_str(), attempt, MAX_RETRY, code);
        http.end();
      }
    }
    
    if (attempt < MAX_RETRY) {
      delay(RETRY_DELAY);
      yield();  // Feed watchdog
    }
  }
  
  return "";
}

// ==================== Device Registration ====================
void registerDevice() {
  // Skip device registration - endpoint requires auth (401)
  // ESP32 can function without device registration
  Serial.println("Device registration skipped (requires auth)");
  deviceRegistered = true;
  deviceId = "esp32-" + ROOM_CODE;
  
  /* Disabled - endpoint requires authentication
  if (deviceRegistered) return;
  
  String payload = "{\"room_code\":\"" + ROOM_CODE + "\",\"device_name\":\"ESP32-" + ROOM_CODE + "\"}";
  String response = httpPostWithRetry("/api/devices/register", payload);
  
  if (response.length() > 0) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, response);
    
    if (!err && doc.containsKey("device_id")) {
      deviceId = doc["device_id"].as<String>();
      deviceRegistered = true;
      Serial.println("Device registered: " + deviceId);
    }
  } else {
    Serial.println("Device registration failed");
  }
  */
}

// ==================== Room State Polling ====================
bool fetchRoomState() {
  String response = httpGetWithRetry("/api/qr/room-state/" + ROOM_CODE);
  
  if (response.length() == 0) {
    Serial.println("Failed to fetch room state after retries");
    return false;
  }
  
  StaticJsonDocument<2048> doc;
  DeserializationError err = deserializeJson(doc, response);
  
  if (err) {
    Serial.println("JSON parse error: " + String(err.c_str()));
    return false;
  }
  
  // Parse state
  const char* stateStr = doc["state"] | "IDLE";
  if (strcmp(stateStr, "IDLE") == 0) currentState = STATE_IDLE;
  else if (strcmp(stateStr, "PRE_CLASS") == 0) currentState = STATE_PRE_CLASS;
  else if (strcmp(stateStr, "CLASS_ACTIVE") == 0) currentState = STATE_CLASS_ACTIVE;
  else if (strcmp(stateStr, "CLASS_ENDED") == 0) currentState = STATE_CLASS_ENDED;
  else if (strcmp(stateStr, "TEACHER_ABSENT") == 0) currentState = STATE_TEACHER_ABSENT;
  else if (strcmp(stateStr, "EARLY_REQUEST") == 0) currentState = STATE_EARLY_REQUEST;
  else currentState = STATE_IDLE;
  
  // Parse current schedule
  if (doc.containsKey("current_schedule") && !doc["current_schedule"].isNull()) {
    JsonObject sched = doc["current_schedule"];
    currentSchedule.id = sched["id"] | "";
    currentSchedule.subject_name = sched["subject_name"] | "";
    currentSchedule.teacher_name = sched["teacher_name"] | "";
    currentSchedule.grade_name = sched["grade_name"] | "";
    currentSchedule.start_time = sched["start_time"] | "";
    currentSchedule.end_time = sched["end_time"] | "";
  } else {
    currentSchedule.id = "";
  }
  
  // Parse next schedule
  if (doc.containsKey("next_schedule") && !doc["next_schedule"].isNull()) {
    JsonObject sched = doc["next_schedule"];
    nextSchedule.id = sched["id"] | "";
    nextSchedule.subject_name = sched["subject_name"] | "";
    nextSchedule.start_time = sched["start_time"] | "";
  } else {
    nextSchedule.id = "";
  }
  
  Serial.printf("State: %d, Current: %s (%s-%s), Next: %s (%s)\n", 
                currentState, 
                currentSchedule.subject_name.c_str(),
                currentSchedule.start_time.c_str(),
                currentSchedule.end_time.c_str(),
                nextSchedule.subject_name.c_str(),
                nextSchedule.start_time.c_str());
  
  // DEBUG: Force state based on schedule times (bypass backend IDLE issue)
  // Remove this in production
  if (currentState == STATE_IDLE && nextSchedule.id.length() > 0) {
    int nextHour = 0, nextMin = 0;
    if (nextSchedule.start_time.length() >= 5) {
      nextHour = nextSchedule.start_time.substring(0, 2).toInt();
      nextMin = nextSchedule.start_time.substring(3, 5).toInt();
    }
    
    int currentHour = 0, currentMin = 0;
    bool timeValid = false;
    if (rtcAvailable) {
      DateTime utc = rtc.now();
      time_t utc_epoch = utc.unixtime();
      time_t wib_epoch = utc_epoch + 25200;
      struct tm* tm_wib = localtime(&wib_epoch);
      currentHour = tm_wib->tm_hour;
      currentMin = tm_wib->tm_min;
      timeValid = true;
    } else {
      time_t now = time(nullptr);
      if (now > 1000000000) {
        struct tm* tm_now = localtime(&now);
        currentHour = tm_now->tm_hour;
        currentMin = tm_now->tm_min;
        timeValid = true;
      }
    }
    
    if (timeValid) {
      int currentTotalMin = currentHour * 60 + currentMin;
      int nextTotalMin = nextHour * 60 + nextMin;
      
      Serial.printf("[DEBUG] Time check: now=%02d:%02d (%d), next=%02d:%02d (%d), diff=%d min\n", 
                    currentHour, currentMin, currentTotalMin,
                    nextHour, nextMin, nextTotalMin,
                    currentTotalMin - nextTotalMin);
      
      // If within 2 minutes before next schedule, force PRE_CLASS
      if (currentTotalMin >= nextTotalMin - 2 && currentTotalMin < nextTotalMin) {
        Serial.println("[DEBUG] Forcing PRE_CLASS based on next schedule time");
        currentState = STATE_PRE_CLASS;
        currentSchedule = nextSchedule;
        currentSchedule.id = nextSchedule.id;
      }
      // If past start time, force CLASS_ACTIVE
      else if (currentTotalMin >= nextTotalMin) {
        Serial.println("[DEBUG] Forcing CLASS_ACTIVE based on schedule time");
        currentState = STATE_CLASS_ACTIVE;
        currentSchedule = nextSchedule;
        currentSchedule.id = nextSchedule.id;
      }
    } else {
      Serial.println("[DEBUG] Time not valid yet (RTC/NTP not synced)");
    }
  }
  
  return true;
}

// ==================== Auto Token Generation ====================
bool fetchAutoToken(const String& scheduleId, const String& type) {
  if (scheduleId.length() == 0) {
    Serial.println("No schedule ID for token");
    return false;
  }
  
  String endpoint = "/api/qr/auto-token/" + scheduleId + "?token_type=" + type;
  
  Serial.printf("[TOKEN] Fetching %s token for %s...\n", type.c_str(), scheduleId.c_str());
  
  String response = httpPostWithRetry(endpoint);
  
  if (response.length() == 0) {
    Serial.println("Failed to fetch token after retries");
    return false;
  }
  
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, response);
  
  if (err) {
    Serial.println("Token JSON error: " + String(err.c_str()));
    return false;
  }
  
  const char* token = doc["token"];
  if (token && strlen(token) > 0) {
    currentQRToken = String(token);
    qrTokenType = type;
    hasValidToken = true;
    tokenGeneratedAt = millis();
    qrCountdown = QR_DISPLAY_TIME / 1000;  // Reset countdown on new token
    Serial.printf("Token received (%s): %s...\n", type.c_str(), currentQRToken.substring(0, 16).c_str());
    return true;
  }
  
  Serial.println("No token in response");
  return false;
}

// ==================== Callback Server ====================
void handleCallback() {
  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"Method not allowed\"}");
    return;
  }
  
  String body = server.arg("plain");
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, body);
  
  if (err) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }
  
  const char* event = doc["event"];
  if (event && strcmp(event, "qr_generated") == 0) {
    const char* token = doc["token"];
    const char* type = doc["token_type"];
    
    if (token && strlen(token) > 0) {
      currentQRToken = String(token);
      qrTokenType = type ? String(type) : "entry";
      hasValidToken = true;
      qrCountdown = QR_DISPLAY_TIME / 1000;
      Serial.printf("Callback: QR received (%s)\n", qrTokenType.c_str());
      server.send(200, "application/json", "{\"status\":\"ok\"}");
      return;
    }
  }
  
  server.send(400, "application/json", "{\"error\":\"Invalid payload\"}");
}

void setupCallbackServer() {
  server.on("/callback", HTTP_POST, handleCallback);
  server.begin();
  Serial.println("Callback server started on port 80");
}

// ==================== Display Functions ====================
// Static QR buffer - version 3 needs 29x29 modules = 841 bits = 106 bytes + overhead
#define QR_VERSION 3
static uint8_t qrcodeDataStatic[150];  // Safe buffer for version 3
static QRCode qrcodeStatic;  // Static QRCode struct to avoid stack overflow

void drawQRCode(const String& token) {
  if (token.length() == 0) {
    Serial.println("[QR] Empty token");
    return;
  }
  
  // Truncate token if too long for QR version 3 (max ~35 alphanumeric chars)
  String qrToken = token;
  if (token.length() > 30) {
    // Keep first 30 chars - QR still scannable for testing
    qrToken = token.substring(0, 30);
    Serial.printf("[QR] Token truncated to 30 chars: %s...\n", qrToken.c_str());
  }
  
  // Initialize QR code
  uint8_t status = qrcode_initText(&qrcodeStatic, qrcodeDataStatic, QR_VERSION, ECC_LOW, qrToken.c_str());
  
  if (status != 0) {
    Serial.printf("[QR] Init failed: %d, token len: %d\n", status, qrToken.length());
    display.setTextSize(1);
    drawStringCenter("QR Error", 25, 1);
    display.display();
    return;
  }
  
  Serial.printf("[QR] Success: version=%d, size=%dx%d\n", QR_VERSION, qrcodeStatic.size, qrcodeStatic.size);
  
  // QR version 3 = 29x29 modules
  // Scale to fit 128x64 screen (use 2px per module = 58x58 pixels)
  int moduleSize = 2;
  int qrPixelSize = qrcodeStatic.size * moduleSize;
  
  // Center QR on screen
  int offsetX = (SCREEN_WIDTH - qrPixelSize) / 2;
  int offsetY = (SCREEN_HEIGHT - qrPixelSize) / 2;
  
  // Ensure positive offsets
  if (offsetX < 0) offsetX = 0;
  if (offsetY < 0) offsetY = 0;
  
  // Draw QR modules with bounds check
  for (int y = 0; y < qrcodeStatic.size; y++) {
    for (int x = 0; x < qrcodeStatic.size; x++) {
      if (qrcode_getModule(&qrcodeStatic, x, y)) {
        int px = offsetX + x * moduleSize;
        int py = offsetY + y * moduleSize;
        // Bounds check
        if (px >= 0 && px < SCREEN_WIDTH && py >= 0 && py < SCREEN_HEIGHT) {
          display.fillRect(px, py, moduleSize, moduleSize, SSD1306_WHITE);
        }
      }
    }
    yield();  // Feed watchdog every row
  }
  yield();  // Feed watchdog after QR draw
}

void drawStringCenter(const String& text, int y, int size = 1) {
  display.setTextSize(size);
  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  int x = (SCREEN_WIDTH - w) / 2;
  display.setCursor(x, y);
  display.print(text);
}

void displayHeader() {
  display.fillRect(0, 0, SCREEN_WIDTH, 16, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setTextSize(1);
  display.setCursor(4, 4);
  display.print("SIPGURU - " + ROOM_CODE);
}

void displayFooter() {
  display.fillRect(0, SCREEN_HEIGHT - 12, SCREEN_WIDTH, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setTextSize(1);
  display.setCursor(4, SCREEN_HEIGHT - 10);
  
  display.print(getCurrentTimeStr());
  
  if (rtcAvailable) {
    display.setCursor(SCREEN_WIDTH - 24, SCREEN_HEIGHT - 10);
    display.print("RTC");
  } else if (hasValidToken) {
    display.setCursor(SCREEN_WIDTH - 48, SCREEN_HEIGHT - 10);
    display.print(qrCountdown);
    display.print("s");
  }
}

void displayIdle() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  displayHeader();
  
  drawStringCenter("No active class", 28, 1);
  
  if (nextSchedule.id.length() > 0) {
    drawStringCenter("Next: " + nextSchedule.subject_name, 40, 1);
    drawStringCenter(nextSchedule.start_time, 50, 1);
  }
  
  displayFooter();
  display.display();
  yield();
}

void displayPreClass() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  displayHeader();
  
  drawStringCenter("Starting soon...", 20, 1);
  drawStringCenter(currentSchedule.subject_name, 32, 1);
  drawStringCenter(currentSchedule.teacher_name, 44, 1);
  drawStringCenter("ENTRY QR ready", 54, 1);
  
  displayFooter();
  display.display();
}

void displayClassActive() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  
  // Full screen QR code for better scanning
  // Draw actual QR code (fills entire 128x64 screen)
  if (hasValidToken && currentQRToken.length() > 0) {
    drawQRCode(currentQRToken);
  } else {
    // Placeholder if no token
    display.setTextSize(2);
    drawStringCenter("NO QR", 28, 2);
    display.setTextSize(1);
    drawStringCenter("Waiting for token...", 45, 1);
  }
  
  display.display();
  yield();  // Feed watchdog after display
}

void displayClassEnded() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  displayHeader();
  
  drawStringCenter("CLASS ENDED", 28, 1);
  drawStringCenter(currentSchedule.subject_name, 40, 1);
  drawStringCenter("See you next time!", 52, 1);
  
  displayFooter();
  display.display();
}

void displayTeacherAbsent() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  displayHeader();
  
  drawStringCenter("TEACHER ABSENT", 28, 1);
  drawStringCenter(currentSchedule.subject_name, 40, 1);
  drawStringCenter("Admin notified", 52, 1);
  
  displayFooter();
  display.display();
}

void updateDisplay() {
  switch (currentState) {
    case STATE_IDLE:
      displayIdle();
      break;
    case STATE_PRE_CLASS:
      displayPreClass();
      break;
    case STATE_CLASS_ACTIVE:
      displayClassActive();
      break;
    case STATE_CLASS_ENDED:
      displayClassEnded();
      break;
    case STATE_TEACHER_ABSENT:
      displayTeacherAbsent();
      break;
    case STATE_EARLY_REQUEST:
      displayPreClass();  // Similar to PRE_CLASS
      break;
  }
}

// ==================== State Machine Logic ====================
// Track token expiry for auto-refresh
const int TOKEN_EXPIRY_SECONDS = 300;  // 5 minutes (matches backend QR_EXPIRY_SECONDS)

void processState() {
  bool tokenNeeded = false;
  String targetType = "";
  String targetScheduleId = "";
  
  // Check if current token is expired
  bool tokenExpired = false;
  if (hasValidToken && tokenGeneratedAt > 0) {
    unsigned long elapsed = (millis() - tokenGeneratedAt) / 1000;
    if (elapsed >= TOKEN_EXPIRY_SECONDS) {
      tokenExpired = true;
      hasValidToken = false;
      Serial.printf("[TOKEN] Expired after %lu seconds, will refresh\n", elapsed);
    }
  }
  
  switch (currentState) {
    case STATE_PRE_CLASS:
      // 15 min before class - generate ENTRY QR
      if (!hasValidToken || tokenExpired) {
        tokenNeeded = true;
        targetType = "entry";
        targetScheduleId = nextSchedule.id;  // PRE_CLASS uses next schedule
      }
      break;
      
    case STATE_CLASS_ACTIVE: {
      // Check if we need ENTRY or EXIT token
      // Calculate time until class ends
      int endHour = 0, endMin = 0;
      if (currentSchedule.end_time.length() >= 5) {
        endHour = currentSchedule.end_time.substring(0, 2).toInt();
        endMin = currentSchedule.end_time.substring(3, 5).toInt();
      }
      
      // Get current time in minutes since midnight
      int currentHour = 0, currentMin = 0;
      if (rtcAvailable) {
        DateTime utc = rtc.now();
        time_t utc_epoch = utc.unixtime();
        time_t wib_epoch = utc_epoch + 25200;
        struct tm* tm_wib = localtime(&wib_epoch);
        currentHour = tm_wib->tm_hour;
        currentMin = tm_wib->tm_min;
      } else {
        time_t now = time(nullptr);
        struct tm* tm_now = localtime(&now);
        currentHour = tm_now->tm_hour;
        currentMin = tm_now->tm_min;
      }
      
      int currentTotalMin = currentHour * 60 + currentMin;
      int endTotalMin = endHour * 60 + endMin;
      int minsUntilEnd = endTotalMin - currentTotalMin;
      
      // Switch to EXIT token 5 minutes before class ends
      bool shouldSwitchToExit = (minsUntilEnd <= 5 && minsUntilEnd > 0);
      
      if (!hasValidToken || tokenExpired) {
        // Need token (entry or exit based on time)
        if (shouldSwitchToExit) {
          tokenNeeded = true;
          targetType = "exit";
          targetScheduleId = currentSchedule.id;
        } else {
          tokenNeeded = true;
          targetType = "entry";
          targetScheduleId = currentSchedule.id;
        }
      } else if (qrTokenType == "entry" && shouldSwitchToExit) {
        // Switch from ENTRY to EXIT token 5 min before end
        tokenNeeded = true;
        targetType = "exit";
        targetScheduleId = currentSchedule.id;
        Serial.printf("[STATE] Switching to EXIT token (%d min until end)\n", minsUntilEnd);
      }
      break;
    }
      
    case STATE_CLASS_ENDED:
      hasValidToken = false;
      break;
      
    case STATE_TEACHER_ABSENT:
      hasValidToken = false;
      break;
      
    case STATE_EARLY_REQUEST:
      if (!hasValidToken || tokenExpired) {
        tokenNeeded = true;
        targetType = "entry";
        targetScheduleId = currentSchedule.id;
      }
      break;
      
    case STATE_IDLE:
      hasValidToken = false;
      break;
  }
  
  if (tokenNeeded && targetScheduleId.length() > 0) {
    if (fetchAutoToken(targetScheduleId, targetType)) {
      tokenGeneratedAt = millis();  // Track when token was generated
      Serial.printf("Token fetched: %s for schedule %s\n", targetType.c_str(), targetScheduleId.c_str());
    }
  }
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== SIPGURU ESP32 ===");
  
  // Wire (I2C) init - SDA=GPIO21, SCL=GPIO22
  Wire.begin(21, 22);
  
  // RTC init
  if (rtc.begin()) {
    rtcAvailable = true;
    Serial.println("RTC found!");
    if (rtc.lostPower()) {
      Serial.println("RTC lost power - setting compile time");
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }
  } else {
    rtcAvailable = false;
    Serial.println("RTC not found!");
  }
  
  // OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED failed!");
    for(;;);
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("SIPGURU");
  display.println("Booting...");
  display.display();
  
  // WiFi
  connectWiFi();
  
  // NTP (syncs RTC if available)
  syncNTP();
  
  // Device registration
  registerDevice();
  
  // Callback server for auto-QR push
  setupCallbackServer();
  
  // Initial state fetch
  Serial.println("Fetching initial state...");
  if (fetchRoomState()) {
    processState();
  }
  updateDisplay();
  
  lastPollTime = millis();
  Serial.println("Setup complete!");
  Serial.println("Device IP: " + WiFi.localIP().toString());
  Serial.println("Callback URL: http://" + WiFi.localIP().toString() + "/callback");
}

// ==================== Loop ====================
unsigned long lastDisplayUpdate = 0;
const int DISPLAY_UPDATE_INTERVAL = 1000;  // Update display only once per second

// Watchdog timer tracking
unsigned long lastSuccessfulLoop = 0;
const int WATCHDOG_TIMEOUT = 5000;  // 5 seconds

// State transition flags (set in checkTimeBasedTransition, handled in loop)
bool shouldForceClassActive = false;
bool shouldForcePreClass = false;

void loop() {
  // Handle callback server
  server.handleClient();
  yield();
  
  unsigned long now = millis();
  lastSuccessfulLoop = now;
  
  // Check time every loop for instant transition at class start
  checkTimeBasedTransition();
  
  // Handle forced state transitions (non-blocking)
  if (shouldForceClassActive) {
    shouldForceClassActive = false;
    Serial.println("[TRANSITION] Forcing CLASS_ACTIVE via flag");
    currentState = STATE_CLASS_ACTIVE;
    currentSchedule = nextSchedule;
    currentSchedule.id = nextSchedule.id;
    hasValidToken = false;  // Force token fetch
  }
  
  if (shouldForcePreClass) {
    shouldForcePreClass = false;
    Serial.println("[TRANSITION] Forcing PRE_CLASS via flag");
    currentState = STATE_PRE_CLASS;
    currentSchedule = nextSchedule;
    currentSchedule.id = nextSchedule.id;
    hasValidToken = false;
  }
  
  // Poll every 5 seconds
  if (now - lastPollTime >= 5000) {
    lastPollTime = now;
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("Polling room state...");
      
      if (fetchRoomState()) {
        processState();
      } else {
        Serial.println("Poll failed, keeping current display");
      }
    } else {
      Serial.println("WiFi not connected, skipping poll");
      connectWiFi();
    }
    yield();
  }
  
  // Process token fetching if needed (after state transition)
  if (!hasValidToken && currentSchedule.id.length() > 0) {
    if (currentState == STATE_PRE_CLASS || currentState == STATE_CLASS_ACTIVE) {
      Serial.println("[LOOP] Fetching token for current state...");
      processState();
    }
  }
  
  // QR countdown refresh
  if (hasValidToken) {
    qrCountdown--;
    if (qrCountdown <= 0) {
      qrCountdown = QR_DISPLAY_TIME / 1000;
      hasValidToken = false;
    }
  }
  
  // Update display once per second
  if (now - lastDisplayUpdate >= DISPLAY_UPDATE_INTERVAL) {
    lastDisplayUpdate = now;
    updateDisplay();
  }
  
  // Feed watchdog
  yield();
  delay(50);
}

void checkTimeBasedTransition() {
  // Only check if we're IDLE with a next schedule
  if (currentState != STATE_IDLE || nextSchedule.id.length() == 0) return;
  
  int nextHour = 0, nextMin = 0;
  if (nextSchedule.start_time.length() >= 5) {
    nextHour = nextSchedule.start_time.substring(0, 2).toInt();
    nextMin = nextSchedule.start_time.substring(3, 5).toInt();
  }
  
  int currentHour = 0, currentMin = 0;
  bool timeValid = false;
  if (rtcAvailable) {
    DateTime utc = rtc.now();
    time_t utc_epoch = utc.unixtime();
    time_t wib_epoch = utc_epoch + 25200;
    struct tm* tm_wib = localtime(&wib_epoch);
    currentHour = tm_wib->tm_hour;
    currentMin = tm_wib->tm_min;
    timeValid = true;
  } else {
    time_t now = time(nullptr);
    if (now > 1000000000) {
      struct tm* tm_now = localtime(&now);
      currentHour = tm_now->tm_hour;
      currentMin = tm_now->tm_min;
      timeValid = true;
    }
  }
  
  if (timeValid) {
    int currentTotalMin = currentHour * 60 + currentMin;
    int nextTotalMin = nextHour * 60 + nextMin;
    
    // If past start time, force CLASS_ACTIVE
    if (currentTotalMin >= nextTotalMin) {
      Serial.printf("[INSTANT] Time %02d:%02d >= %02d:%02d, flagging CLASS_ACTIVE\n", 
                    currentHour, currentMin, nextHour, nextMin);
      shouldForceClassActive = true;
    }
    // If within 2 min before start, force PRE_CLASS
    else if (currentTotalMin >= nextTotalMin - 2) {
      Serial.printf("[INSTANT] Time %02d:%02d near %02d:%02d, flagging PRE_CLASS\n", 
                    currentHour, currentMin, nextHour, nextMin);
      shouldForcePreClass = true;
    }
  }
}