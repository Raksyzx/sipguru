# 🚀 SIPGURU - Wokwi ESP32 Simulator

Simulator ESP32 untuk sistem absensi QR Code SIPGURU yang terintegrasi dengan backend Railway.

## 📋 Fitur

- ✅ **OLED Display** (SSD1306 128x64) - Menampilkan QR token, waktu, dan status absensi
- ✅ **WiFi Connection** - Terhubung ke backend SIPGURU di Railway
- ✅ **NTP Time Sync** - Waktu real-time WIB (UTC+7)
- ✅ **QR Token Auto-Refresh** - Token expired 30 detik, auto-request baru
- ✅ **GPS Simulation** - Koordinat Jakarta untuk geofencing test
- ✅ **Button Control** - Manual refresh QR token
- ✅ **Auto Attendance** - Simulasi scan QR setiap 10 detik

## 🔧 Hardware (Wokwi)

| Component | Pin | Description |
|-----------|-----|-------------|
| ESP32 DevKit | - | Main controller |
| OLED SSD1306 | SDA/SCL | I2C display (0x3C) |
| Button | GPIO4 | Refresh QR token |

## 🌐 Backend Integration

### Environment Variables

```cpp
// Ganti sesuai deployment
const char* BACKEND_URL = "https://sipguru-production.up.railway.app";  // Production
// const char* BACKEND_URL = "http://100.98.171.97:8000";  // Local (Tailscale)
```

### API Endpoints

1. **Request QR Token**
   ```
   POST /api/qr/generate
   Response: { "qr_token": "QR_TOK...EN_2" }
   ```

2. **Submit Attendance**
   ```
   POST /api/attendance/submit
   Body: {
     "token": "QR_TOK...EN_2",
     "latitude": -6.2088,
     "longitude": 106.8456,
     "device_id": "ESP32_WOKWI_SIM_001"
   }
   Response: {
     "status": "success",
     "teacher": { "name": "John Doe" },
     "lcd_display": {
       "status_text": "TEPAT WAKTU",
       "status_color": "green"
     }
   }
   ```

## 📂 File Structure

```
wokwi_simulator/
├── main.cpp          # Arduino code
├── diagram.json      # Wokwi circuit diagram
└── wokwi.toml        # Wokwi configuration
```

## 🚀 Cara Pakai

### 1. Buka di Wokwi

1. Kunjungi: https://wokwi.com/projects/new/esp32
2. Copy `main.cpp` ke code editor
3. Copy `diagram.json` ke diagram tab
4. Copy `wokwi.toml` ke config

### 2. Setup WiFi

```cpp
const char* WIFI_SSID = "Wokwi-GUEST";  // Otomatis di Wokwi
const char* WIFI_PASSWORD = "";
```

### 3. Update Backend URL

```cpp
// Production (Railway)
const char* BACKEND_URL = "https://sipguru-production.up.railway.app";

// Local development (Tailscale)
// const char* BACKEND_URL = "http://100.98.171.97:8000";
```

### 4. Dapatkan Schedule ID

Untuk generate QR token yang valid:

1. Login ke Admin Dashboard: https://sipguru-six.vercel.app
2. Tab **QR Ruangan**
3. Pilih jadwal kelas
4. Klik **Generate**
5. Copy `schedule_id` dari response

Update di `main.cpp`:
```cpp
String jsonPayload = "{\"schedule_id\": \"SCHEDULE_ID_HERE\"}";
```

### 5. Run Simulator

Klik **Start** di Wokwi

## 📊 Flow Diagram

```
┌─────────────┐      WiFi      ┌──────────────────┐
│   ESP32     │ ─────────────► │ SIPGURU Backend  │
│  Simulator  │   HTTP POST    │   (Railway)      │
│             │                │                  │
│ - OLED Disp │                │ - QR Generator   │
│ - Button    │                │ - Attendance API │
│ - WiFi      │◄────────────── │ - Geofencing     │
└─────────────┘   JSON Response └──────────────────┘
```

## 🎯 OLED Display States

### Screen 1: QR Token Display
```
SIPGURU - QR Absen
Senin, 15 Oktober 2026
2026-10-15 14:30:45
QR: QR_TOK...EN_2
Exp: 25s
```

### Screen 2: Attendance Success
```
BERHASIL!
John Doe
TEPAT WAKTU
```

### Screen 3: Attendance Failed
```
GAGAL!
TOKEN TIDAK VALID
```

## 🔧 Troubleshooting

### WiFi Tidak Connect
- Pastikan Wokwi menggunakan `Wokwi-GUEST` (tanpa password)
- Tunggu hingga 10 detik untuk connect

### QR Token Selalu Expired
- Check `schedule_id` valid di backend
- Pastikan backend running di Railway

### OLED Blank
- Check I2C address (0x3C untuk SSD1306)
- Verify wiring: SDA/SCL connected

### Geofencing Failed
- Update GPS coordinates di `submitAttendance()`
- Check room geofence radius di Admin Dashboard

## 📝 Next Steps

1. **GPS Module** - Tambahkan NEO-6M GPS untuk real coordinates
2. **RFID/NFC** - Tambahkan MFRC522 untuk backup attendance
3. **Buzzer** - Audio feedback saat scan berhasil
4. **LED Indicator** - Green/Red LED untuk status
5. **Real ESP32** - Flash code ke hardware fisik

## 🔗 Links

- **Backend API**: https://sipguru-production.up.railway.app/docs
- **Frontend**: https://sipguru-six.vercel.app
- **Wokwi Docs**: https://docs.wokwi.com/
- **U8g2 Library**: https://github.com/olikraus/u8g2

---

**Author**: Raksyz  
**Project**: SIPGURU - School Attendance System  
**License**: MIT
