SIPGURU ESP32 - QR Code Attendance Device
================================================================

## Hardware
- ESP32 Device (NodeMCU, ESP32 DevKit, etc.)
- 2.8" or 3.5" TFT Display (SPI)
- Optional: Camera for QR scanning

## Libraries Needed
- WiFi.h
- HTTPClient.h
- json.h
- time.h
- TFT_eSPI.h
- SPI.h

## Configuration
Edit ESP32_QR_Attendance.ino:

// WiFi Configuration
const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASSWORD = "your_wifi_password";

// Backend API
const char* API_HOST = "sipguru-api.vercel.app";
const int API_PORT = 443;

// Room Configuration
const String ROOM_CODE = "R001";  // Unique per room
const int TOKEN_REFRESH_INTERVAL = 20000;  // 20 seconds

## Setup
1. Install TFT_eSPI library via Arduino Library Manager
2. Configure TFT pins in User_Setup.h
3. Upload to ESP32 via Arduino IDE

## Features
- Auto-refresh QR token every 20s
- Display QR code on TFT
- NTP time sync
- WiFi connection status
- Timer to next token refresh

## Display Layout
+-------------------+
| SIPGURU           |
| Room: R001        |
+-------------------+
|                   |
|  Scan for         |
|  Attendance       |
|                   |
+-------------------+
| Next update: 15s  |
| Time: 14:30:45    |
+-------------------+

## Troubleshooting
- WiFi not connect? Check credentials
- Token not updating? Check API_HOST configuration
- TFT not working? Verify SPI pins in TFT_eSPI config
