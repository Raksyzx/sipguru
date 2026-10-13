/**
 * SIPGURU - ESP32 QR Code Attendance Device
 * Firmware for ESP32 + TFT Display
 * 
 * Features:
 * - Fetch HMAC-signed QR token from backend every 20s
 * - Display QR code on TFT
 * - Sync NTP time for token validation
 * - Offline fallback (cache last token)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <JSON.h>
#include <time.h>
#include <TFT_eSPI.h>
#include <SPI.h>

// WiFi Configuration
const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASSWORD = "your_wifi_password";

// Backend API
const char* API_HOST = "sipguru-api.vercel.app";
const int API_PORT = 443;
const String API_TOKEN_PATH = "/api/qr/info/{room_code}";

// Room Configuration
const String ROOM_CODE = "R001";  // Change for each room
const int TOKEN_REFRESH_INTERVAL = 20000;  // 20 seconds

// TFT Display
TFT_eSPI tft = TFT_eSPI();

// State
String currentToken = "";
unsigned long lastTokenFetch = 0;
unsigned long lastTokenExpiry = 0;
bool tokenValid = false;

// WiFi Connection
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  Serial.println("Connecting to WiFi...");
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi Connection Failed!");
  }
}

// NTP Time Sync
void syncNTPTime() {
  configTime(3600 * 7, 0, "pool.ntp.org");
  
  time_t now = time(nullptr);
  int attempts = 0;
  while (now < 1000000000 && attempts < 10) {
    delay(500);
    now = time(nullptr);
    attempts++;
  }
  
  if (now >= 1000000000) {
    Serial.println("NTP Time Synced!");
  } else {
    Serial.println("NTP Sync Failed!");
  }
}

// Fetch Room Info and Token from Backend
String fetchTokenFromBackend() {
  String token = "";
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, using cached token");
    return currentToken;
  }
  
  HTTPClient http;
  String url = String("http://") + API_HOST + "/api/qr/info/" + ROOM_CODE;
  
  http.begin(url);
  http.setTimeout(5000);
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode == 200) {
    String payload = http.getString();
    Serial.println("Response: " + payload);
    
    // Parse JSON response
    // Expected: {"room_id": "{uuid}", "room_code": "R001", "name": "...", "geolocation": "..."}
    // Note: Backend will generate QR token on first request, but ESP32 requests_info only
    // In production, backend would return a fresh token for this device
    
    // For now, fetch and return token from response
    // This is a placeholder - actual implementation depends on your backend API
    
  } else {
    Serial.println("Failed to fetch token");
  }
  
  http.end();
  
  return token;
}

// Generate QR Code String (for display)
String generateQRDisplay() {
  // In production, this would use a QR library like "QRcode" library
  // For now, return formatted token string
  
  if (currentToken.length() > 0) {
    return "Token: " + currentToken.substring(0, 20) + "...";
  }
  return "No Token Available";
}

// Display Functions
void drawQRCode() {
  tft.fillScreen(TFT_BLACK);
  
  // Header
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(2);
  tft.fillRect(0, 0, tft.width(), 40, TFT_BLUE);
  tft.drawString("SIPGURU", 10, 10);
  tft.setTextSize(1);
  tft.setTextColor(TFT_CYAN);
  tft.drawString("Room: " + ROOM_CODE, 10, 30);
  
  // QR Display Area
  tft.fillRect(0, 40, tft.width(), tft.height() - 80, TFT_WHITE);
  
  // Show QR or status
  tft.setTextColor(TFT_BLACK, TFT_WHITE);
  tft.setTextSize(2);
  tft.drawString("Scan for", 40, 80);
  tft.setTextSize(1);
  tft.drawString("Attendance", 40, 110);
  
  // Footer
  tft.fillRect(0, tft.height() - 40, tft.width(), 40, TFT_BLUE);
  tft.setTextColor(TFT_WHITE);
  tft.setTextSize(1);
  tft.drawString(" Next update in: ", 10, tft.height() - 30);
  
  // Time
  tft.setTextSize(1);
  tft.drawString("Time: " + String(hour()) + ":" + String(minute()) + ":" + String(second()), 
                 tft.width() - 120, tft.height() - 30);
}

void updateDisplayRefresh(int secondsLeft) {
  // Update just the timer in footer
  tft.fillRect(110, tft.height() - 30, tft.width() - 110, 40, TFT_BLACK);
  tft.setTextColor(TFT_WHITE);
  tft.setTextSize(1);
  tft.drawString("Next: " + String(secondsLeft) + "s", 110, tft.height() - 30);
}

// Setup
void setup() {
  Serial.begin(115200);
  
  // Initialize TFT
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(TFT_BLACK);
  tft.setTextSize(2);
  tft.setTextColor(TFT_WHITE);
  tft.drawString("SIPGURU", 50, 100);
  
  // Connect WiFi
  connectWiFi();
  
  // Sync NTP
  syncNTPTime();
  
  // Initial token fetch
  currentToken = fetchTokenFromBackend();
  
  // Draw initial screen
  drawQRCode();
}

// Loop
void loop() {
  unsigned long now = millis();
  
  // Refresh token every 20 seconds
  if (now - lastTokenFetch > TOKEN_REFRESH_INTERVAL) {
    lastTokenFetch = now;
    
    Serial.println("Fetching new token...");
    currentToken = fetchTokenFromBackend();
    
    // Redraw display
    drawQRCode();
  }
  
  // Update timer display
  int secondsSinceLastFetch = (millis() - lastTokenFetch) / 1000;
  int secondsLeft = 20 - secondsSinceLastFetch;
  
  if (secondsLeft >= 0 && secondsLeft < 20) {
    updateDisplayRefresh(secondsLeft);
  }
  
  delay(1000);
}
