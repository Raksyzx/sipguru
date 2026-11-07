/**
 * SIPGURU - ESP32 Auto-QR Attendance Device
 * Firmware: ESP32 + OLED Display + Supabase Realtime
 * 
 * State Machine:
 * IDLE → PRE_CLASS (15min before) → CLASS_ACTIVE (entry scanned) 
 * → CLASS_ENDED (exit scanned) | TEACHER_ABSENT (10min no scan)
 * 
 * Comms: Supabase Realtime (primary) + Polling 60s (fallback)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ==================== CONFIGURATION ====================
const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASSWORD = "your_wifi_password";

// Backend API (Railway Production)
const char* API_HOST = "sipguru-production.up.railway.app";
const String ROOM_CODE = "R001";  // Change per device

// Supabase Realtime (optional - fallback to polling)
const char* SUPABASE_URL = "https://your-project.supabase.co";
const char* SUPABASE_ANON_KEY = "your-anon-key";

// Timing
const int POLL_INTERVAL = 60000;        // 60 seconds polling
const int QR_DISPLAY_TIME = 15000;      // 15 seconds per QR frame
const int PRE_CLASS_WINDOW = 15;        // 15 minutes before class

// OLED Display
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

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
bool hasValidToken = false;
int qrCountdown = QR_DISPLAY_TIME / 1000;

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
  }
}

// ==================== NTP Time Sync ====================
void syncNTP() {
  configTime(0, 0, "pool.ntp.org");
  time_t now = time(nullptr);
  int attempts = 0;
  
  while (now < 1000000000 && attempts < 10) {
    delay(500);
    now = time(nullptr);
    attempts++;
  }
  
  if (now >= 1000000000) {
    Serial.println("NTP Synced!");
  } else {
    Serial.println("NTP Failed!");
  }
}

// ==================== HTTP Client ====================
String httpGet(const String& endpoint) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return "";
  }
  
  HTTPClient http;
  String url = "http://" + String(API_HOST) + endpoint;
  
  http.begin(url);
  http.setTimeout(5000);
  
  int code = http.GET();
  String payload = "";
  
  if (code == 200) {
    payload = http.getString();
  } else {
    Serial.printf("HTTP %d\n", code);
  }
  
  http.end();
  return payload;
}

String httpPost(const String& endpoint, const String& body = "") {
  if (WiFi.status() != WL_CONNECTED) {
    return "";
  }
  
  HTTPClient http;
  String url = "http://" + String(API_HOST) + endpoint;
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  
  int code = http.POST(body);
  String payload = "";
  
  if (code == 200 || code == 201) {
    payload = http.getString();
  }
  
  http.end();
  return payload;
}

// ==================== Room State Polling ====================
bool fetchRoomState() {
  String response = httpGet("/api/qr/room-state/" + ROOM_CODE);
  
  if (response.length() == 0) {
    Serial.println("Failed to fetch room state");
    return false;
  }
  
  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, response);
  
  if (err) {
    Serial.println("JSON parse error");
    return false;
  }
  
  // Parse state
  const char* stateStr = doc["state"];
  if (strcmp(stateStr, "IDLE") == 0) currentState = STATE_IDLE;
  else if (strcmp(stateStr, "PRE_CLASS") == 0) currentState = STATE_PRE_CLASS;
  else if (strcmp(stateStr, "CLASS_ACTIVE") == 0) currentState = STATE_CLASS_ACTIVE;
  else if (strcmp(stateStr, "CLASS_ENDED") == 0) currentState = STATE_CLASS_ENDED;
  else if (strcmp(stateStr, "TEACHER_ABSENT") == 0) currentState = STATE_TEACHER_ABSENT;
  else if (strcmp(stateStr, "EARLY_REQUEST") == 0) currentState = STATE_EARLY_REQUEST;
  
  // Parse current schedule
  if (doc.containsKey("current_schedule") && !doc["current_schedule"].isNull()) {
    JsonObject sched = doc["current_schedule"];
    currentSchedule.id = sched["id"].as<String>();
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
    nextSchedule.id = sched["id"].as<String>();
    nextSchedule.subject_name = sched["subject_name"] | "";
    nextSchedule.start_time = sched["start_time"] | "";
  } else {
    nextSchedule.id = "";
  }
  
  Serial.printf("State: %d, Current: %s, Next: %s\n", 
                currentState, currentSchedule.id.c_str(), nextSchedule.id.c_str());
  return true;
}

// ==================== Auto Token Generation ====================
bool fetchAutoToken(const String& scheduleId, const String& type) {
  if (scheduleId.length() == 0) {
    Serial.println("No schedule ID");
    return false;
  }
  
  String endpoint = "/api/qr/auto-token/" + scheduleId + "?token_type=" + type;
  String response = httpPost(endpoint);
  
  if (response.length() == 0) {
    Serial.println("Failed to fetch token");
    return false;
  }
  
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, response);
  
  if (err) {
    Serial.println("Token JSON error");
    return false;
  }
  
  const char* token = doc["token"];
  if (token && strlen(token) > 0) {
    currentQRToken = String(token);
    qrTokenType = type;
    hasValidToken = true;
    qrCountdown = QR_DISPLAY_TIME / 1000;
    Serial.printf("Token received (%s): %s...\n", type.c_str(), currentQRToken.substring(0, 16).c_str());
    return true;
  }
  
  return false;
}

// ==================== Display Functions ====================
void drawStringCenter(const String& text, int y, int size) {
  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  int x = (SCREEN_WIDTH - w) / 2;
  display.setCursor(x, y);
  display.print(text);
}

void displayClear() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
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
  
  time_t now = time(nullptr);
  char timeBuf[9];
  strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", localtime(&now));
  display.print(timeBuf);
  
  display.setCursor(SCREEN_WIDTH - 40, SCREEN_HEIGHT - 10);
  display.print("Next: ");
  display.print(qrCountdown);
  display.print("s");
}

void displayIdle() {
  displayClear();
  displayHeader();
  
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  drawStringCenter("No active class", 28, 1);
  drawStringCenter("Next: " + nextSchedule.subject_name, 40, 1);
  drawStringCenter(nextSchedule.start_time, 50, 1);
  
  displayFooter();
  display.display();
}

void displayPreClass() {
  displayClear();
  displayHeader();
  
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  drawStringCenter("Starting soon...", 24, 1);
  display.setTextSize(1);
  drawStringCenter(currentSchedule.subject_name, 36, 1);
  drawStringCenter(currentSchedule.teacher_name, 48, 1);
  drawStringCenter("ENTRY QR ready", 58, 1);
  
  displayFooter();
  display.display();
}

void displayClassActive() {
  displayClear();
  displayHeader();
  
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  drawStringCenter(currentSchedule.subject_name, 24, 1);
  drawStringCenter(currentSchedule.teacher_name, 36, 1);
  
  // QR type indicator
  if (qrTokenType == "entry") {
    drawStringCenter("[ENTRY SCAN]", 48, 1);
  } else {
    drawStringCenter("[EXIT SCAN]", 48, 1);
  }
  
  // Simple QR placeholder (in production, use QR library)
  display.drawRect(44, 28, 40, 40, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(48, 48);
  display.print(currentQRToken.substring(0, 8));
  
  displayFooter();
  display.display();
}

void displayClassEnded() {
  displayClear();
  displayHeader();
  
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  drawStringCenter("CLASS ENDED", 28, 1);
  drawStringCenter(currentSchedule.subject_name, 40, 1);
  drawStringCenter("See you next time!", 52, 1);
  
  displayFooter();
  display.display();
}

void displayTeacherAbsent() {
  displayClear();
  displayHeader();
  
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
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
void processState() {
  bool tokenNeeded = false;
  String targetType = "";
  
  switch (currentState) {
    case STATE_IDLE:
      hasValidToken = false;
      break;
      
    case STATE_PRE_CLASS:
      // 15 min before class - generate ENTRY QR
      if (!hasValidToken || currentSchedule.id != "") {
        tokenNeeded = true;
        targetType = "entry";
      }
      break;
      
    case STATE_CLASS_ACTIVE:
      // Check if we need to switch from ENTRY to EXIT
      // In production, this would check if entry was scanned
      // For now, switch after first poll
      if (!hasValidToken) {
        tokenNeeded = true;
        targetType = "entry";
      } else if (qrTokenType == "entry" && qrCountdown < 10) {
        // After entry QR displayed, prepare EXIT QR
        tokenNeeded = true;
        targetType = "exit";
      }
      break;
      
    case STATE_CLASS_ENDED:
      hasValidToken = false;
      break;
      
    case STATE_TEACHER_ABSENT:
      hasValidToken = false;
      break;
      
    case STATE_EARLY_REQUEST:
      if (!hasValidToken) {
        tokenNeeded = true;
        targetType = "entry";
      }
      break;
  }
  
  if (tokenNeeded && targetType.length() > 0) {
    String scheduleId = currentState == STATE_PRE_CLASS ? nextSchedule.id : currentSchedule.id;
    if (fetchAutoToken(scheduleId, targetType)) {
      Serial.printf("Token fetched: %s\n", targetType.c_str());
    }
  }
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== SIPGURU ESP32 ===");
  
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
  
  // NTP
  syncNTP();
  
  // Initial state fetch
  Serial.println("Fetching initial state...");
  fetchRoomState();
  processState();
  updateDisplay();
  
  lastPollTime = millis();
  Serial.println("Setup complete!");
}

// ==================== Loop ====================
void loop() {
  unsigned long now = millis();
  
  // Poll every 60 seconds
  if (now - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = now;
    Serial.println("Polling room state...");
    
    if (fetchRoomState()) {
      processState();
      updateDisplay();
    }
  }
  
  // QR countdown refresh
  if (hasValidToken) {
    qrCountdown--;
    if (qrCountdown <= 0) {
      qrCountdown = QR_DISPLAY_TIME / 1000;
      // Toggle QR type for visual feedback
      updateDisplay();
    }
  }
  
  delay(1000);
}
