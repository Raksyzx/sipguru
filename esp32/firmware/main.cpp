#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <HTTPClient.h>

#include <SPI.h>
#include <Wire.h>

#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <RTClib.h>
#include <qrcode.h>



// ==================== CONFIGURATION ====================
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

const char* API_HOST = "sipguru-production.up.railway.app";
const bool USE_HTTPS = true;

const String ROOM_CODE = "RR1";

const char* SUPABASE_URL = "https://kyhbcguycelqstmoewlm.supabase.co";
const char* SUPABASE_ANON_KEY = "sb_publishable_5LehF_9tjUv9CbDZqSHp8A_SP3D1GPJ";

const int POLL_INTERVAL = 60000;
const int QR_DISPLAY_TIME = 15000;
const int PRE_CLASS_WINDOW = 15;
const int MAX_RETRY = 3;
const int RETRY_DELAY = 2000;

#define TFT_CS    5
#define TFT_RST   4
#define TFT_DC    2
#define SCREEN_WIDTH  320
#define SCREEN_HEIGHT 240
Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);

RTC_DS1307 rtc;
bool rtcAvailable = false;

WebServer server(80);

// ==================== STATE MACHINE ====================
enum RoomState {
  STATE_IDLE,
  STATE_PRE_CLASS,
  STATE_CLASS_ACTIVE,
  STATE_CLASS_ENDED,
  STATE_TEACHER_ABSENT,
  STATE_EARLY_REQUEST,
  STATE_TEACHING  // NEW: After teacher scanned QR
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
String qrTokenType = "entry";
unsigned long lastPollTime = 0;
unsigned long lastQRRefreshTime = 0;
unsigned long tokenGeneratedAt = 0;
bool hasValidToken = false;
int qrCountdown = QR_DISPLAY_TIME / 1000;
bool deviceRegistered = false;
String deviceId = "";

// NEW: Attendance tracking
bool teacherScanned = false;
unsigned long scanTime = 0;
String teacherName = "";
String teachingSince = "";

// ==================== UTILITIES ====================
String getCurrentTimeStr() {
  char timeBuf[9];
  if (rtcAvailable) {
    DateTime utc = rtc.now();
    time_t utc_epoch = utc.unixtime();
    time_t wib_epoch = utc_epoch + 25200;
    struct tm* tm_wib = localtime(&wib_epoch);
    strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", tm_wib);
  } else {
    time_t now = time(nullptr);
    strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", localtime(&now));
  }
  return String(timeBuf);
}

bool isTimePast(const String& targetTime) {
  if (targetTime.length() < 5) return false;
  
  int targetHour = targetTime.substring(0, 2).toInt();
  int targetMin = targetTime.substring(3, 5).toInt();
  
  if (rtcAvailable) {
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
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi Already Connected!");
    return;
  }

  Serial.println("Connecting to WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 15000) {
    delay(500);
    Serial.print(".");
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
    
    if (rtcAvailable) {
      time_t utc = now - 25200;
      DateTime ntp_utc = DateTime(utc);
      rtc.adjust(ntp_utc);
      Serial.println("RTC synced from NTP (stored as UTC)");
    }
  } else {
    Serial.println("NTP Failed!");
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
      yield();
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
      yield();
    }
  }
  
  return "";
}

// ==================== Device Registration ====================
void registerDevice() {
  Serial.println("Device registration skipped (requires auth)");
  deviceRegistered = true;
  deviceId = "esp32-" + ROOM_CODE;
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
  
  const char* stateStr = doc["state"] | "IDLE";
  if (strcmp(stateStr, "IDLE") == 0) currentState = STATE_IDLE;
  else if (strcmp(stateStr, "PRE_CLASS") == 0) currentState = STATE_PRE_CLASS;
  else if (strcmp(stateStr, "CLASS_ACTIVE") == 0) currentState = STATE_CLASS_ACTIVE;
  else if (strcmp(stateStr, "CLASS_ENDED") == 0) currentState = STATE_CLASS_ENDED;
  else if (strcmp(stateStr, "TEACHER_ABSENT") == 0) currentState = STATE_TEACHER_ABSENT;
  else if (strcmp(stateStr, "EARLY_REQUEST") == 0) currentState = STATE_EARLY_REQUEST;
  else currentState = STATE_IDLE;
  
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
  
  // Force state based on schedule times
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
      
      if (currentTotalMin >= nextTotalMin - 2 && currentTotalMin < nextTotalMin) {
        Serial.println("[DEBUG] Forcing PRE_CLASS based on next schedule time");
        currentState = STATE_PRE_CLASS;
        currentSchedule = nextSchedule;
        currentSchedule.id = nextSchedule.id;
      }
      else if (currentTotalMin >= nextTotalMin) {
        Serial.println("[DEBUG] Forcing CLASS_ACTIVE based on schedule time");
        currentState = STATE_CLASS_ACTIVE;
        currentSchedule = nextSchedule;
        currentSchedule.id = nextSchedule.id;
      }
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
  
  String endpoint = "/api/qr/esp32/token";
  String body = "{\"schedule_id\":\"" + scheduleId + "\",\"room_code\":\"" + ROOM_CODE + "\",\"token_type\":\"" + type + "\"}";
  
  Serial.printf("[TOKEN] POST %s with body: %s\n", endpoint.c_str(), body.c_str());
  
  String response = httpPostWithRetry(endpoint, body);
  
  if (response.length() == 0) {
    Serial.println("Failed to fetch token after retries");
    return false;
  }
  
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, response);
  
  if (err) {
    Serial.println("Token JSON error: " + String(err.c_str()));
    Serial.println("Response: " + response);
    return false;
  }
  
  const char* token = doc["token"];
  if (token && strlen(token) > 0) {
    currentQRToken = String(token);
    qrTokenType = doc["token_type"] | "entry";
    hasValidToken = true;
    tokenGeneratedAt = millis();
    qrCountdown = QR_DISPLAY_TIME / 1000;
    Serial.printf("Token received (%s): %s...\n", qrTokenType.c_str(), currentQRToken.substring(0, 16).c_str());
    return true;
  }
  
  const char* detail = doc["detail"];
  if (detail) {
    Serial.printf("Backend error: %s\n", detail);
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
  
  // NEW: Handle scan callback from backend
  if (event && strcmp(event, "teacher_scanned") == 0) {
    const char* name = doc["teacher_name"];
    const char* scan_time = doc["scan_time"];
    
    if (name) {
      teacherScanned = true;
      teacherName = String(name);
      teachingSince = scan_time ? String(scan_time) : getCurrentTimeStr();
      scanTime = millis();
      currentState = STATE_TEACHING;
      Serial.printf("Teacher scanned: %s at %s\n", teacherName.c_str(), teachingSince.c_str());
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
const int TOKEN_EXPIRY_SECONDS = 300;

#define COLOR_BG    ILI9341_BLACK
#define COLOR_FG    ILI9341_WHITE
#define COLOR_BAR   ILI9341_BLUE
#define COLOR_OK    ILI9341_GREEN
#define COLOR_WARN  ILI9341_ORANGE
#define COLOR_ERR   ILI9341_RED

#define HEADER_H 30
#define FOOTER_H 24

String lastScreenSig = "";
int qrPanelX = 0;
bool qrOnScreen = false;

bool qrShowable() {
  if (currentQRToken.length() == 0) return false;
  if (hasValidToken) return true;
  return tokenGeneratedAt > 0 && (millis() - tokenGeneratedAt) < (unsigned long)TOKEN_EXPIRY_SECONDS * 1000UL;
}

String fitText(const String& s, int maxChars) {
  if ((int)s.length() <= maxChars) return s;
  if (maxChars <= 3) return s.substring(0, maxChars);
  return s.substring(0, maxChars - 3) + "...";
}

int qrAreaX, qrAreaY;
int qrAreaW, qrAreaH;
int *qrUsedPx = nullptr; 

void drawEspQRCode(esp_qrcode_handle_t qr) {
  int size = esp_qrcode_get_size(qr);
  int quiet = 4;

  int modules = size + quiet * 2;
  int scale = min(qrAreaW, qrAreaH) / modules;

  if (scale < 1) return;

  int px = modules * scale;
  int x0 = qrAreaX + (qrAreaW - px) / 2;
  int y0 = qrAreaY + (qrAreaH - px) / 2;

  tft.fillRect(x0, y0, px, px, ILI9341_WHITE);

  for (int y = 0; y < size; y++) {
    int x = 0;
    while (x < size) {
      if (!esp_qrcode_get_module(qr, x, y)) {
        x++;
        continue;
      }

      int run = x;
      while (run < size && esp_qrcode_get_module(qr, run, y)) {
        run++;
      }

      tft.fillRect(
        x0 + (quiet + x) * scale,
        y0 + (quiet + y) * scale,
        (run - x) * scale,
        scale,
        ILI9341_BLACK
      );

      x = run;
    }
    yield();
  }

  if (qrUsedPx != nullptr) {
    *qrUsedPx = px;
  }
}

bool drawQRCode(const String& token, int areaX, int areaY, int areaW, int areaH, int* usedPx) {
  if (token.length() == 0) {
    Serial.println("[QR] Empty token");
    return false;
  }

  qrAreaX = areaX;
  qrAreaY = areaY;
  qrAreaW = areaW;
  qrAreaH = areaH;
  qrUsedPx = usedPx;

  if (usedPx != nullptr) *usedPx = 0;

  esp_qrcode_config_t config = {};
  config.display_func = drawEspQRCode;
  config.max_qrcode_version = 14;
  config.qrcode_ecc_level = ESP_QRCODE_ECC_LOW;

  esp_err_t result = esp_qrcode_generate(&config, token.c_str());

  qrUsedPx = nullptr;

  if (result != ESP_OK) {
    Serial.println("[QR] Generate failed");
    return false;
  }

  Serial.println("[QR] Generate success");
  return true;
}


void drawStringCenter(const String& text, int y, int size, uint16_t color) {
  tft.setTextSize(size);
  tft.setTextColor(color);
  int16_t x1, y1;
  uint16_t w, h;
  tft.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  int x = (SCREEN_WIDTH - (int)w) / 2;
  if (x < 0) x = 0;
  tft.setCursor(x, y);
  tft.print(text);
}

void displayHeader() {
  tft.fillRect(0, 0, SCREEN_WIDTH, HEADER_H, COLOR_BAR);
  tft.setTextColor(COLOR_FG);
  tft.setTextSize(2);
  tft.setCursor(8, 8);
  tft.print("SIPGURU - " + ROOM_CODE);
}

void displayFooter() {
  int y = SCREEN_HEIGHT - FOOTER_H;
  tft.fillRect(0, y, SCREEN_WIDTH, FOOTER_H, COLOR_BAR);
  tft.setTextColor(COLOR_FG);
  tft.setTextSize(2);
  tft.setCursor(8, y + 5);
  tft.print(getCurrentTimeStr());

  String right = "";
  if (rtcAvailable) right = "RTC";
  else if (hasValidToken) right = String(qrCountdown) + "s";

  if (right.length() > 0) {
    tft.setCursor(SCREEN_WIDTH - 8 - right.length() * 12, y + 5);
    tft.print(right);
  }
}

void drawQRDynamic() {
  int panelW = SCREEN_WIDTH - qrPanelX - 4;
  tft.fillRect(qrPanelX, 150, panelW, 85, COLOR_BG);
  tft.setTextColor(COLOR_FG);
  tft.setTextSize(1);
  tft.setCursor(qrPanelX, 150);
  tft.print("Refresh in");
  tft.setTextSize(3);
  tft.setCursor(qrPanelX, 165);
  tft.print(String(qrCountdown) + "s");
  tft.setTextSize(1);
  tft.setCursor(qrPanelX, 205);
  tft.print(getCurrentTimeStr());
}

void displayIdle() {
  tft.fillScreen(COLOR_BG);
  displayHeader();

  drawStringCenter("No active class", 80, 2, COLOR_FG);

  if (nextSchedule.id.length() > 0) {
    drawStringCenter("Next: " + fitText(nextSchedule.subject_name, 20), 115, 2, COLOR_FG);
    drawStringCenter(nextSchedule.start_time, 145, 3, COLOR_OK);
  }

  displayFooter();
}

void displayPreClass() {
  tft.fillScreen(COLOR_BG);
  displayHeader();

  drawStringCenter("Starting soon...", 50, 2, COLOR_WARN);
  drawStringCenter(fitText(currentSchedule.subject_name, 26), 90, 2, COLOR_FG);
  drawStringCenter(fitText(currentSchedule.teacher_name, 26), 120, 2, COLOR_FG);
  drawStringCenter("ENTRY QR ready", 165, 2, COLOR_OK);

  displayFooter();
}

void displayClassActive() {
  tft.fillScreen(COLOR_BG);
  qrOnScreen = false;

  if (qrShowable()) {
    int usedPx = 0;
    if (drawQRCode(currentQRToken, 4, 0, 236, SCREEN_HEIGHT, &usedPx)) {
      qrOnScreen = true;
      qrPanelX = 4 + usedPx + 8;
      int panelW = SCREEN_WIDTH - qrPanelX - 4;
      int chars = panelW / 6;
      bool isExit = (qrTokenType == "exit");

      tft.setTextSize(2);
      tft.setTextColor(isExit ? COLOR_WARN : COLOR_OK);
      tft.setCursor(qrPanelX, 10);
      tft.print(isExit ? "EXIT" : "ENTRY");

      tft.setTextSize(1);
      tft.setTextColor(COLOR_FG);
      tft.setCursor(qrPanelX, 40);
      tft.print(fitText(ROOM_CODE, chars));
      tft.setCursor(qrPanelX, 54);
      tft.print(fitText(currentSchedule.subject_name, chars));

      drawQRDynamic();
      return;
    }
  }

  drawStringCenter("NO QR", 80, 4, COLOR_ERR);
  drawStringCenter("Waiting for token...", 130, 2, COLOR_FG);
  displayFooter();
}

// NEW: Display when teacher is teaching (after scan)
void displayTeaching() {
  tft.fillScreen(COLOR_BG);
  displayHeader();

  // Green status bar
  tft.fillRect(0, HEADER_H, SCREEN_WIDTH, 40, COLOR_OK);
  tft.setTextColor(COLOR_BG);
  tft.setTextSize(2);
  tft.setCursor(8, HEADER_H + 10);
  tft.print("SEDANG MENGAJAR");

  // Teacher name
  tft.setTextColor(COLOR_FG);
  tft.setTextSize(2);
  tft.setCursor(8, 100);
  tft.print("Guru:");
  
  tft.setTextSize(2);
  tft.setTextColor(COLOR_OK);
  tft.setCursor(8, 125);
  tft.print(fitText(teacherName, 30));

  // Subject & class
  tft.setTextColor(COLOR_FG);
  tft.setTextSize(1);
  tft.setCursor(8, 155);
  tft.print("Mapel: " + fitText(currentSchedule.subject_name, 35));
  tft.setCursor(8, 170);
  tft.print("Kelas: " + fitText(currentSchedule.grade_name, 35));

  // Teaching duration
  unsigned long elapsed = (millis() - scanTime) / 1000;
  int minutes = elapsed / 60;
  int seconds = elapsed % 60;
  
  tft.setTextColor(COLOR_WARN);
  tft.setTextSize(2);
  tft.setCursor(8, 200);
  tft.print("Durasi: " + String(minutes) + "m " + String(seconds) + "d");

  // Time until exit QR
  int endHour = 0, endMin = 0;
  if (currentSchedule.end_time.length() >= 5) {
    endHour = currentSchedule.end_time.substring(0, 2).toInt();
    endMin = currentSchedule.end_time.substring(3, 5).toInt();
  }
  
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
  
  tft.setTextColor(COLOR_FG);
  tft.setTextSize(1);
  tft.setCursor(8, 220);
  if (minsUntilEnd > 5) {
    tft.print("EXIT QR dalam " + String(minsUntilEnd) + " menit");
  } else if (minsUntilEnd > 0) {
    tft.setTextColor(COLOR_WARN);
    tft.print("EXIT QR segera muncul...");
  } else {
    tft.setTextColor(COLOR_ERR);
    tft.print("Waktu habis!");
  }

  displayFooter();
}

void displayClassEnded() {
  tft.fillScreen(COLOR_BG);
  displayHeader();

  drawStringCenter("CLASS ENDED", 70, 3, COLOR_WARN);
  drawStringCenter(fitText(currentSchedule.subject_name, 26), 120, 2, COLOR_FG);
  drawStringCenter("See you next time!", 160, 2, COLOR_OK);

  displayFooter();
}

void displayTeacherAbsent() {
  tft.fillScreen(COLOR_BG);
  displayHeader();

  drawStringCenter("TEACHER ABSENT", 70, 3, COLOR_ERR);
  drawStringCenter(fitText(currentSchedule.subject_name, 26), 120, 2, COLOR_FG);
  drawStringCenter("Admin notified", 160, 2, COLOR_FG);

  displayFooter();
}

void updateDisplay() {
  String sig = String((int)currentState) + "|" + currentQRToken + "|" + qrTokenType + "|" +
               currentSchedule.id + "|" + nextSchedule.id + "|" + (qrShowable() ? "1" : "0") + "|" +
               String(teacherScanned ? "1" : "0");

  if (sig != lastScreenSig) {
    lastScreenSig = sig;
    qrOnScreen = false;

    switch (currentState) {
      case STATE_IDLE:           displayIdle();          break;
      case STATE_PRE_CLASS:      displayPreClass();      break;
      case STATE_CLASS_ACTIVE:   displayClassActive();   break;
      case STATE_TEACHING:       displayTeaching();      break;  // NEW
      case STATE_CLASS_ENDED:    displayClassEnded();    break;
      case STATE_TEACHER_ABSENT: displayTeacherAbsent(); break;
      case STATE_EARLY_REQUEST:  displayPreClass();      break;
    }
  } else {
    if (currentState == STATE_CLASS_ACTIVE && qrOnScreen) drawQRDynamic();
    else if (currentState == STATE_TEACHING) {
      // Update duration counter every second
      displayTeaching();
    }
    else displayFooter();
  }
  yield();
}

// ==================== State Machine Logic ====================
const int TOKEN_EXPIRY_SECONDS = 300;

void processState() {
  bool tokenNeeded = false;
  String targetType = "";
  String targetScheduleId = "";
  
  bool tokenExpired = false;
  if (hasValidToken && tokenGeneratedAt > 0) {
    unsigned long elapsed = (millis() - tokenGeneratedAt) / 1000;
    if (elapsed >= TOKEN_EXPIRY_SECONDS) {
      tokenExpired = true;
      hasValidToken = false;
      Serial.printf("[TOKEN] Expired after %lu seconds, will refresh\n", elapsed);
    }
  }
  
  // NEW: Check if we should switch to TEACHING state
  if (currentState == STATE_CLASS_ACTIVE && !teacherScanned && qrTokenType == "entry") {
    // Check if entry QR was scanned (backend should send callback)
    // For now, we'll auto-transition after showing ENTRY QR for 2 minutes
    if (tokenGeneratedAt > 0 && (millis() - tokenGeneratedAt) > 120000) {
      teacherScanned = true;
      teacherName = currentSchedule.teacher_name;
      teachingSince = getCurrentTimeStr();
      scanTime = millis();
      currentState = STATE_TEACHING;
      Serial.printf("[STATE] Auto-transition to TEACHING (teacher: %s)\n", teacherName.c_str());
    }
  }
  
  // NEW: Check if we should switch back to CLASS_ACTIVE for EXIT QR
  if (currentState == STATE_TEACHING) {
    int endHour = 0, endMin = 0;
    if (currentSchedule.end_time.length() >= 5) {
      endHour = currentSchedule.end_time.substring(0, 2).toInt();
      endMin = currentSchedule.end_time.substring(3, 5).toInt();
    }
    
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
    
    // Switch to EXIT QR 5 minutes before end
    if (minsUntilEnd <= 5 && minsUntilEnd > 0) {
      currentState = STATE_CLASS_ACTIVE;
      hasValidToken = false;  // Force token fetch
      qrTokenType = "exit";
      Serial.printf("[STATE] Switching to EXIT QR (%d min until end)\n", minsUntilEnd);
    }
  }
  
  switch (currentState) {
    case STATE_PRE_CLASS:
      if (!hasValidToken || tokenExpired) {
        tokenNeeded = true;
        targetType = "entry";
        targetScheduleId = nextSchedule.id;
      }
      break;
      
    case STATE_CLASS_ACTIVE: {
      int endHour = 0, endMin = 0;
      if (currentSchedule.end_time.length() >= 5) {
        endHour = currentSchedule.end_time.substring(0, 2).toInt();
        endMin = currentSchedule.end_time.substring(3, 5).toInt();
      }
      
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
      
      bool shouldSwitchToExit = (minsUntilEnd <= 5 && minsUntilEnd > 0);
      
      if (!hasValidToken || tokenExpired) {
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
        tokenNeeded = true;
        targetType = "exit";
        targetScheduleId = currentSchedule.id;
        Serial.printf("[STATE] Switching to EXIT token (%d min until end)\n", minsUntilEnd);
      }
      break;
    }
      
    case STATE_TEACHING:
      // Keep tracking duration, EXIT QR will be generated when switching to CLASS_ACTIVE
      break;
      
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
      tokenGeneratedAt = millis();
      Serial.printf("Token fetched: %s for schedule %s\n", targetType.c_str(), targetScheduleId.c_str());
    }
  }
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== SIPGURU ESP32 ===");
  
  Wire.begin(21, 22);
  
  if (rtc.begin()) {
    rtcAvailable = true;
    Serial.println("RTC DS1307 ditemukan!");
    if (!rtc.isrunning()) {
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }
  } else {
    rtcAvailable = false;
    Serial.println("RTC DS1307 tidak ditemukan!");
  }
  
  tft.begin();
  tft.setRotation(1);
  tft.fillScreen(COLOR_BG);
  tft.setTextColor(COLOR_FG);
  tft.setTextSize(2);
  tft.setCursor(10, 10);
  tft.println("SIPGURU");
  tft.setCursor(10, 35);
  tft.println("Booting...");
  
  connectWiFi();
  syncNTP();
  registerDevice();
  setupCallbackServer();
  
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
const int DISPLAY_UPDATE_INTERVAL = 1000;

unsigned long lastSuccessfulLoop = 0;
const int WATCHDOG_TIMEOUT = 5000;

bool shouldForceClassActive = false;
bool shouldForcePreClass = false;

void loop() {
  server.handleClient();
  yield();
  
  unsigned long now = millis();
  lastSuccessfulLoop = now;
  
  checkTimeBasedTransition();
  
  if (shouldForceClassActive) {
    shouldForceClassActive = false;
    Serial.println("[TRANSITION] Forcing CLASS_ACTIVE via flag");
    currentState = STATE_CLASS_ACTIVE;
    currentSchedule = nextSchedule;
    currentSchedule.id = nextSchedule.id;
    hasValidToken = false;
  }
  
  if (shouldForcePreClass) {
    shouldForcePreClass = false;
    Serial.println("[TRANSITION] Forcing PRE_CLASS via flag");
    currentState = STATE_PRE_CLASS;
    currentSchedule = nextSchedule;
    currentSchedule.id = nextSchedule.id;
    hasValidToken = false;
  }
  
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
  
  if (!hasValidToken && currentSchedule.id.length() > 0) {
    if (currentState == STATE_PRE_CLASS || currentState == STATE_CLASS_ACTIVE) {
      Serial.println("[LOOP] Fetching token for current state...");
      processState();
    }
  }
  
  if (now - lastDisplayUpdate >= DISPLAY_UPDATE_INTERVAL) {
    lastDisplayUpdate = now;

    if (hasValidToken) {
      qrCountdown--;
      if (qrCountdown <= 0) {
        qrCountdown = QR_DISPLAY_TIME / 1000;
        hasValidToken = false;
      }
    }

    updateDisplay();
  }
  
  yield();
  delay(50);
}

void checkTimeBasedTransition() {
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
    
    if (currentTotalMin >= nextTotalMin) {
      Serial.printf("[INSTANT] Time %02d:%02d >= %02d:%02d, flagging CLASS_ACTIVE\n", 
                    currentHour, currentMin, nextHour, nextMin);
      shouldForceClassActive = true;
    }
    else if (currentTotalMin >= nextTotalMin - 2) {
      Serial.printf("[INSTANT] Time %02d:%02d near %02d:%02d, flagging PRE_CLASS\n", 
                    currentHour, currentMin, nextHour, nextMin);
      shouldForcePreClass = true;
    }
  }
}
