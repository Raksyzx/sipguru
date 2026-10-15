#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <time.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <U8g2lib.h>
#include "qrcode.h"

// ============================================================
// WIFI - SIPGURU BACKEND CONNECTION
// ============================================================
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// GANTI URL INI SESUAI DEPLOYMENT
// const char* BACKEND_URL = "http://100.98.171.97:8000";  // Local (Tailscale)
const char* BACKEND_URL = "https://sipguru-production.up.railway.app";  // Production

// ============================================================
// NTP / WAKTU INDONESIA
// ============================================================
const long GMT_OFFSET_SEC = 7 * 3600;  // WIB = UTC + 7
const int DAYLIGHT_OFFSET_SEC = 0;
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";

// Format waktu
const char* TIME_FORMAT = "%Y-%m-%d %H:%M:%S";
const char* DATE_FORMAT = "%A, %d %B %Y";

// ============================================================
// OLED DISPLAY (U8G2)
// ============================================================
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, /* reset=*/ U8X8_PIN_NONE);

// ============================================================
// QR CODE VARIABLES
// ============================================================
String currentQRToken = "";
unsigned long qrTokenExpiry = 0;
const unsigned long QR_TOKEN_VALIDITY = 30000;  // 30 detik

// ============================================================
// PIN DEFINITIONS
// ============================================================
#define BUTTON_PIN 4  // Button untuk refresh QR

// ============================================================
// HELPER FUNCTIONS
// ============================================================

void connectWiFi() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.setCursor(0, 20);
  u8g2.print("Connecting WiFi...");
  u8g2.sendBuffer();
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.println("IP: " + WiFi.localIP().toString());
    
    u8g2.clearBuffer();
    u8g2.setCursor(0, 20);
    u8g2.print("WiFi Connected!");
    u8g2.setCursor(0, 40);
    u8g2.print("IP: ");
    u8g2.print(WiFi.localIP().toString());
    u8g2.sendBuffer();
    delay(1000);
  } else {
    u8g2.clearBuffer();
    u8g2.setCursor(0, 20);
    u8g2.print("WiFi Failed!");
    u8g2.sendBuffer();
    delay(2000);
  }
}

void syncTime() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
  
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    Serial.println("Time synchronized!");
  } else {
    Serial.println("Failed to obtain time");
  }
}

String getCurrentTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "Time unavailable";
  }
  
  char timeStringBuff[50];
  strftime(timeStringBuff, sizeof(timeStringBuff), TIME_FORMAT, &timeinfo);
  return String(timeStringBuff);
}

String getCurrentDate() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "Date unavailable";
  }
  
  char dateStringBuff[50];
  strftime(dateStringBuff, sizeof(dateStringBuff), DATE_FORMAT, &timeinfo);
  return String(dateStringBuff);
}

// ============================================================
// SIPGURU API FUNCTIONS
// ============================================================

String requestQRToken() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, cannot request QR token");
    return "";
  }
  
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/qr/generate";
  
  Serial.println("Requesting QR token from: " + url);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Untuk simulator, kita pakai schedule_id dummy
  // Nanti diganti dengan schedule_id yang valid dari backend
  String jsonPayload = "{\"schedule_id\": \"SCHEDULE_ID_HERE\"}";
  
  int httpResponseCode = http.POST(jsonPayload);
  
  String qrToken = "";
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Response code: " + String(httpResponseCode));
    Serial.println("Response: " + response);
    
    // Parse JSON response
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (!error) {
      if (doc.containsKey("qr_token")) {
        qrToken = doc["qr_token"].as<String>();
        qrTokenExpiry = millis() + QR_TOKEN_VALIDITY;
        
        Serial.println("QR Token received: " + qrToken);
        Serial.println("Valid for: " + String(QR_TOKEN_VALIDITY / 1000) + " seconds");
      } else if (doc.containsKey("token")) {
        qrToken = doc["token"].as<String>();
        qrTokenExpiry = millis() + QR_TOKEN_VALIDITY;
      }
    } else {
      Serial.print("JSON parse error: ");
      Serial.println(error.c_str());
    }
  } else {
    Serial.println("HTTP request failed: " + String(httpResponseCode));
  }
  
  http.end();
  return qrToken;
}

void displayQRCode(String token) {
  u8g2.clearBuffer();
  
  // Header
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.setCursor(0, 12);
  u8g2.print("SIPGURU - QR Absen");
  
  // Date
  u8g2.setFont(u8g2_font_ncenB06_tr);
  u8g2.setCursor(0, 24);
  u8g2.print(getCurrentDate());
  
  // Time
  u8g2.setCursor(0, 34);
  u8g2.print(getCurrentTime());
  
  // QR Code placeholder (simulator doesn't render actual QR)
  u8g2.setFont(u8g2_font_ncenB06_tr);
  u8g2.setCursor(0, 50);
  u8g2.print("QR: ");
  u8g2.print(token.substring(0, 16));
  u8g2.print("...");
  
  // Expiry countdown
  unsigned long remaining = qrTokenExpiry - millis();
  u8g2.setCursor(0, 62);
  u8g2.print("Exp: ");
  u8g2.print(remaining / 1000);
  u8g2.print("s");
  
  u8g2.sendBuffer();
}

void displayAttendanceResult(String status, String message, String teacherName) {
  u8g2.clearBuffer();
  
  u8g2.setFont(u8g2_font_ncenB08_tr);
  
  if (status == "success") {
    u8g2.setCursor(0, 20);
    u8g2.print("BERHASIL!");
    
    u8g2.setFont(u8g2_font_ncenB06_tr);
    u8g2.setCursor(0, 40);
    u8g2.print(teacherName);
    
    u8g2.setCursor(0, 52);
    u8g2.print(message);
  } else {
    u8g2.setCursor(0, 20);
    u8g2.print("GAGAL!");
    
    u8g2.setFont(u8g2_font_ncenB06_tr);
    u8g2.setCursor(0, 40);
    u8g2.print(message);
  }
  
  u8g2.sendBuffer();
  delay(3000);
}

void submitAttendance(String qrToken) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return;
  }
  
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/attendance/submit";
  
  Serial.println("Submitting attendance to: " + url);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Simulasi GPS coordinates (Jakarta)
  // Nanti diganti dengan GPS module
  float latitude = -6.2088;
  float longitude = 106.8456;
  
  StaticJsonDocument<256> doc;
  doc["token"] = qrToken;
  doc["latitude"] = latitude;
  doc["longitude"] = longitude;
  doc["device_id"] = "ESP32_WOKWI_SIM_001";
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  Serial.println("Payload: " + jsonPayload);
  
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Response: " + response);
    
    // Parse response
    StaticJsonDocument<512> respDoc;
    DeserializationError error = deserializeJson(respDoc, response);
    
    if (!error) {
      String status = respDoc["status"].as<String>();
      String lcdText = "";
      String teacherName = "";
      
      if (respDoc.containsKey("lcd_display")) {
        lcdText = respDoc["lcd_display"]["status_text"].as<String>();
      }
      
      if (respDoc.containsKey("teacher")) {
        teacherName = respDoc["teacher"]["name"].as<String>();
      }
      
      displayAttendanceResult(status, lcdText, teacherName);
    }
  } else {
    Serial.println("HTTP request failed: " + String(httpResponseCode));
    
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_ncenB08_tr);
    u8g2.setCursor(0, 20);
    u8g2.print("Error: ");
    u8g2.print(httpResponseCode);
    u8g2.sendBuffer();
    delay(2000);
  }
  
  http.end();
}

// ============================================================
// SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  Serial.println("\n\nSIPGURU - ESP32 QR Attendance Simulator");
  Serial.println("==========================================");
  
  // Initialize OLED
  u8g2.begin();
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.setCursor(0, 20);
  u8g2.print("SIPGURU v1.0");
  u8g2.setFont(u8g2_font_ncenB06_tr);
  u8g2.setCursor(0, 40);
  u8g2.print("ESP32 Simulator");
  u8g2.sendBuffer();
  
  delay(1000);
  
  // Connect WiFi
  connectWiFi();
  
  // Sync time
  syncTime();
  
  // Initialize button
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  
  // Request initial QR token
  currentQRToken = requestQRToken();
  if (currentQRToken.length() > 0) {
    displayQRCode(currentQRToken);
  }
}

// ============================================================
// LOOP
// ============================================================

void loop() {
  // Check button press to refresh QR
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(50);  // Debounce
    if (digitalRead(BUTTON_PIN) == LOW) {
      Serial.println("Button pressed - refreshing QR token...");
      
      currentQRToken = requestQRToken();
      if (currentQRToken.length() > 0) {
        displayQRCode(currentQRToken);
      }
      
      // Wait for button release
      while (digitalRead(BUTTON_PIN) == LOW) {
        delay(50);
      }
    }
  }
  
  // Check if QR token expired
  if (millis() > qrTokenExpiry && currentQRToken.length() > 0) {
    Serial.println("QR token expired - requesting new one...");
    currentQRToken = requestQRToken();
  }
  
  // Update display with current time
  if (currentQRToken.length() > 0) {
    displayQRCode(currentQRToken);
  }
  
  // Simulate QR scan every 10 seconds for demo
  static unsigned long lastScan = 0;
  if (millis() - lastScan > 10000 && currentQRToken.length() > 0) {
    Serial.println("Simulating QR scan...");
    submitAttendance(currentQRToken);
    lastScan = millis();
  }
  
  delay(1000);
}
