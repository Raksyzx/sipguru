# 🚀 SIPGURU - Auto-QR Setup Guide

## 1. Enable Supabase Realtime

Jalankan SQL ini di Supabase SQL Editor:

```bash
# File: supabase_enable_realtime.sql
psql $SUPABASE_URL -f supabase_enable_realtime.sql
```

Atau copy-paste manual di Supabase Dashboard → SQL Editor:

```sql
-- Enable Realtime untuk 3 tables
ALTER PUBLICATION supabase_realtime ADD TABLE grade_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE qr_tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_logs;
```

## 2. Seed Data Dummy

Update `.env` dengan Supabase credentials:

```bash
# backend/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Kemudian jalankan seed script:

```bash
cd /home/raksyz/sipguru
python3 seed_supabase.py
```

Output:
```
🌱 Seeding Supabase...
✅ School: xxx-xxx-xxx
✅ Rooms: 4
✅ Jurusan: 3
✅ Grades: 4
✅ Subjects: 4
✅ Teachers: 3
✅ Admin: xxx-xxx-xxx
✅ Schedules: 25 (5 days x 5 slots)
🎉 Seeding complete!

📋 Test credentials:
   Admin: admin@sipguru.com / admin123
   Teacher: budi@sipguru.com / password123
   Room codes: R001, R002, LAB1, R003
```

## 3. Update ESP32 Firmware

Edit `esp32/main.cpp`:

```cpp
// WiFi Configuration
const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASSWORD = "your_wifi_password";

// Backend API (Railway Production)
const char* API_HOST = "sipguru-production.up.railway.app";
const String ROOM_CODE = "R001";  // Change per device
```

Compile & upload ke ESP32:
```bash
# Gunakan PlatformIO atau Arduino IDE
# Install libraries:
# - ArduinoJson (by Benoit Blanchon)
# - Adafruit_SSD1306
# - Adafruit_GFX
```

## 4. Test Endpoint

Test room state endpoint:

```bash
curl https://sipguru-production.up.railway.app/api/qr/room-state/R001
```

Expected response:
```json
{
  "room_id": "xxx",
  "room_code": "R001",
  "room_name": "Ruang Kelas A1",
  "current_time": "07:30",
  "day_of_week": "MONDAY",
  "state": "PRE_CLASS",
  "current_schedule": {...},
  "next_schedule": {...}
}
```

## 5. Verify Auto-QR Flow

**Timeline otomatis:**

| Waktu | State | QR Token | ESP32 Display |
|-------|-------|----------|---------------|
| -15min | PRE_CLASS | ENTRY generated | "Starting soon..." + countdown |
| 00:00 | CLASS_ACTIVE | ENTRY displayed | Subject name + [ENTRY SCAN] |
| +5min | CLASS_ACTIVE | EXIT generated | Subject name + [EXIT SCAN] |
| +90min | CLASS_ENDED | - | "CLASS ENDED" |

**Fallback:**
- Polling setiap 60s jika Realtime gagal
- Cache last token jika WiFi down
- Teacher absent alert jika 10min no scan

## 6. Production Checklist

- [ ] Supabase Realtime enabled (3 tables)
- [ ] Seed data running (school, rooms, schedules)
- [ ] ESP32 WiFi + API_HOST configured
- [ ] ROOM_CODE unik per device
- [ ] Backend Railway CORS includes Vercel domain
- [ ] Frontend Vercel env: VITE_API_URL=Railway backend
- [ ] Test scan ENTRY → EXIT flow
- [ ] Test teacher absent alert

## 🎯 Status Setelah Setup

✅ **QR OTOMATIS AKTIF 100%**

- ESP32 poll `/room-state/{room_code}` setiap 60s
- State machine: IDLE→PRE_CLASS→CLASS_ACTIVE→CLASS_ENDED
- Auto-generate ENTRY QR 15min sebelum kelas
- Auto-switch ke EXIT QR setelah entry scanned
- Realtime push dari Supabase (instant update)
- Teacher absent alert jika 10min no scan
- Early request flow untuk teacher minta mulai lebih awal
