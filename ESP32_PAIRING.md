# SIPGURU ESP32 Pairing Guide

## Cara Pairing ESP32 dengan Ruangan

### Metode 1: Manual HTTP Request (Recommended)

#### 1. **Daftarkan ESP32 ke Room**
Admin melakukan request ke backend:

```bash
curl -X POST https://sipguru-production.up.railway.app/api/devices/register \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "room_code": "R001",
    "device_id": "AA:BB:CC:DD:EE:FF",
    "device_name": "ESP32 - Ruang Komputer 1"
  }'
```

**Response:**
```json
{
  "message": "Device registered successfully",
  "device_id": "AA:BB:CC:DD:EE:FF",
  "room_code": "R001",
  "room_id": "uuid-room-id",
  "room_name": "Ruang Komputer 1"
}
```

#### 2. **ESP32 Fetch Room Config**
Setelah terdaftar, ESP32 bisa fetch config:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* room_code = "R001";
const char* device_id = "AA:BB:CC:DD:EE:FF"; // MAC address
const char* api_url = "https://sipguru-production.up.railway.app/api/devices/room/";

void setup() {
  Serial.begin(115200);
  WiFi.begin("SSID", "PASSWORD");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\nWiFi connected!");
  
  // Fetch room config
  HTTPClient http;
  String url = String(api_url) + String(room_code);
  http.begin(url.c_str());
  http.addHeader("Content-Type", "application/json");
  
  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    Serial.println(payload);
    
    // Parse JSON untuk dapat room_id, geofence, dll
  } else {
    Serial.printf("HTTP Error: %d\n", httpCode);
  }
  
  http.end();
}

void loop() {
  // Check room state setiap 30 detik
  checkRoomState();
  delay(30000);
}

void checkRoomState() {
  HTTPClient http;
  String url = "https://sipguru-production.up.railway.app/api/qr/room-state/" + String(room_code);
  http.begin(url.c_str());
  
  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    // Parse JSON untuk dapat:
    // - state: "IDLE", "PRE_CLASS", "CLASS_ACTIVE", "CLASS_ENDED"
    // - current_schedule: { schedule_id, subject_name, teacher_name, start_time, end_time }
    // - next_schedule: { ... }
    
    // Jika state == "PRE_CLASS" atau "CLASS_ACTIVE":
    // Auto-generate QR token dengan POST ke /api/qr/auto-token/{schedule_id}
  }
  http.end();
}
```

#### 3. **Auto-Generate QR Token**
Ketika ada jadwal kelas, ESP32 auto-generate QR:

```cpp
void generateQRToken(String schedule_id, String token_type = "entry") {
  HTTPClient http;
  String url = "https://sipguru-production.up.railway.app/api/qr/auto-token/" + schedule_id;
  
  http.begin(url.c_str());
  http.addHeader("Content-Type", "application/json");
  
  // POST request dengan token_type
  String json = "{\"token_type\":\"" + token_type + "\"}";
  int httpCode = http.POST(json);
  
  if (httpCode == 200) {
    String payload = http.getString();
    // Parse JSON untuk dapat:
    // - token: "hmac-signed-token-string"
    // - expires_at: "2026-11-12T10:50:00"
    
    // Display QR di OLED/TFT
    displayQRCode(token);
  }
  http.end();
}
```

---

### Metode 2: Pairing Code (OLED Display)

Jika ESP32 punya OLED display:

1. **ESP32 tampilkan 6-digit pairing code** di OLED
2. **Admin input code** di dashboard Admin → Devices → Pair Device
3. **Backend verify** dan link ESP32 ke room

**ESP32 Code:**
```cpp
#include <SSD1306Wire.h>

SSD1306Wire display(0x3c, 5, 4);

String generatePairingCode() {
  randomSeed(millis());
  int code = random(100000, 999999);
  return String(code);
}

void setup() {
  display.init();
  String code = generatePairingCode();
  
  display.clear();
  display.setTextAlignment(TEXT_ALIGN_CENTER);
  display.setFont(ArialMT_Plain_16);
  display.drawString(64, 20, "Pairing Code:");
  display.setFont(ArialMT_Plain_24);
  display.drawString(64, 50, code);
  display.display();
  
  // Kirim code ke backend via WiFi
  registerWithCode(code);
}
```

---

## Endpoint Summary

| Endpoint | Method | Auth | Deskripsi |
|----------|--------|------|-----------|
| `/api/devices/register` | POST | Admin | Register ESP32 ke room |
| `/api/devices/room/{room_code}` | GET | User | Fetch room config untuk ESP32 |
| `/api/devices/list` | GET | Admin | List semua device |
| `/api/devices/{device_id}` | DELETE | Admin | Unregister device |
| `/api/qr/room-state/{room_code}` | GET | Public | Get current schedule + state |
| `/api/qr/auto-token/{schedule_id}` | POST | Public | Auto-generate QR token |

---

## Flow Lengkap

```
┌─────────────┐
│   Admin     │
│  Dashboard  │
└──────┬──────┘
       │ 1. Generate QR Token (via UI)
       ▼
┌─────────────┐      2. Push token via HTTP callback
│   Backend   │ ──────────────────────────────┐
│  (Railway)  │                               │
└──────┬──────┘                               │
       │ 3. Fetch room-state                 │
       ▼                                     │
┌─────────────┐      4. Receive QR token      │
│   ESP32     │ ◀─────────────────────────────┘
│  (Room A)   │
└──────┬──────┘
       │ 5. Display QR di OLED/TFT
       ▼
   [QR Code]
```

---

## Testing Pairing

### 1. **Test Room State**
```bash
curl https://sipguru-production.up.railway.app/api/qr/room-state/R001
```

### 2. **Test Auto-Generate QR**
```bash
curl -X POST https://sipguru-production.up.railway.app/api/qr/auto-token/SCHEDULE_ID \
  -H "Content-Type: application/json" \
  -d '{"token_type":"entry"}'
```

### 3. **Test Register Device**
```bash
curl -X POST https://sipguru-production.up.railway.app/api/devices/register \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "room_code": "R001",
    "device_id": "AA:BB:CC:DD:EE:FF",
    "device_name": "ESP32 Test"
  }'
```

---

## Hardware Requirements

- **ESP32 DevKit v1** (WiFi + Bluetooth)
- **OLED Display 0.96" I2C** (SSD1306) - optional, untuk display QR
- **5V Power Supply** (via USB/Micro-USB)

## Library Arduino

```
WiFi.h
HTTPClient.h
ArduinoJson.h (v6.x)
SSD1306Wire.h (untuk OLED)
QRCode.h (untuk generate QR di ESP32)
```
