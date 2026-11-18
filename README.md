# SIPGURU - Sistem Presensi Guru (Teacher Attendance System)

**3-Layer Validation Teacher Attendance System** dengan GPS Geofencing, QR Token HMAC, dan Schedule Matching.

---

## 📁 Struktur Project

```
sipguru/
├── backend/                    # FastAPI Backend
│   ├── src/
│   │   ├── main.py             # FastAPI entry point
│   │   ├── config.py           # Config & env (Pydantic Settings)
│   │   ├── auth.py             # JWT, password hash, device binding
│   │   ├── resend.py           # Email OTP via Resend
│   │   ├── validation.py       # 3-layer validation logic
│   │   ├── supabase.py         # Supabase client (production)
│   │   ├── local_db.py         # SQLite client (development)
│   │   ├── database.py         # DB dependency auto-select
│   │   ├── attendance_history.py  # History builder & session enrichment
│   │   ├── db/
│   │   │   ├── schema.sql      # Supabase schema
│   │   │   ├── schema_supabase_complete.sql
│   │   │   └── migrations/     # SQL migrations (e.g., 002_normalize_day_of_week_to_indonesian.sql)
│   │   ├── deps.py             # Dependency injection
│   │   └── endpoints/
│   │       ├── auth.py         # Login, register, device unbind
│   │       ├── teacher.py      # Teacher attendance, leaves, schedules
│   │       ├── admin.py        # Admin: teachers, rooms, subjects, grades, jurusan, schedules
│   │       ├── qr.py           # QR token generate/validate
│   │       ├── attendance.py   # Attendance submit + LCD display
│   │       ├── reports.py      # Reports: daily/weekly/monthly + export CSV/XLSX/PDF
│   │       └── telegram.py     # Telegram bot notifications
│   ├── requirements.txt
│   ├── railway.json            # Railway deploy config
│   └── vercel.json             # Vercel deploy config
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx             # Routes & protected routes
│   │   ├── main.tsx            # Entry point
│   │   ├── index.css           # Tailwind + custom styles
│   │   ├── lib/api.ts          # Axios instance + interceptors
│   │   ├── stores/useAuth.ts   # Zustand auth state
│   │   ├── contexts/
│   │   │   ├── AttendanceContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts      # Auth hooks
│   │   │   └── useGeolocation.ts   # GPS + watch position
│   │   ├── components/
│   │   │   ├── AttendanceDialog.tsx
│   │   │   ├── ConfirmModal.tsx
│   │   │   ├── LeaveSection.tsx
│   │   │   ├── LogoutConfirmModal.tsx
│   │   │   ├── MapPicker.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── QRScanner.tsx
│   │   │   ├── SkeletonLoaders.tsx
│   │   │   ├── TeacherHistoryHeader.tsx
│   │   │   ├── TeacherLayout.tsx
│   │   │   ├── TeacherNavigation.tsx
│   │   │   └── Toast.tsx
│   │   └── pages/
│   │       ├── LoginPage.tsx
│   │       ├── AdminDashboard.tsx      # Admin: guru, ruangan, jurusan, kelas, mapel, jadwal, izin, laporan
│   │       ├── TeacherDashboard.tsx    # Teacher: absensi, izin, jadwal
│   │       ├── TeacherHistoryPage.tsx  # Riwayat Presensi
│   │       ├── TeacherLeaveHistoryPage.tsx  # Riwayat Izin
│   │       ├── TeacherSchedulePage.tsx
│   │       ├── TeacherProfile.tsx
│   │       └── ReportsPage.tsx         # Export CSV/Excel/PDF
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vercel.json
├── esp32/
│   └── ESP32_QR_Attendance.ino   # ESP32 firmware untuk QR display
├── README.md                     # This file
├── MIGRATION_WEEKDAY.md          # Migration guide: English → Indonesian day names
├── IMPLEMENTATION_COMPLETE.md    # Full implementation log
└── IMPLEMENTATION_SUMMARY.md     # Quick summary
```

---

## ✨ Fitur Lengkap

### 🔐 **Authentication & Security**
- JWT token (HS256, 24h expiry) + bcrypt password hashing
- Device binding (1 device per account) + OTP unbind via email (Resend)
- Role-based access: `admin` | `teacher`
- Protected routes di frontend & backend

### 📍 **3-Layer Validation Attendance**
| Layer | Validasi | Deskripsi |
|-------|----------|-----------|
| 1 | **GPS Geofence** | Haversine formula, radius per ruangan (default 150m, configurable) |
| 2 | **QR Token** | HMAC-SHA256 signed, expiry 15-30 detik, single-use |
| 3 | **Schedule Match** | Guru harus terjadwal di ruangan & waktu tersebut (±15 menit toleransi) |

### 📱 **Teacher Features**
- **Absensi**: Scan QR → GPS auto-check → Submit → LCD Display (Tepat Waktu/Terlambat)
- **Izin**: Ajukan cuti/sakit, lihat status (Menunggu/Disetujui/Ditolak)
- **Jadwal**: Lihat jadwal mengajar hari ini
- **Riwayat Presensi**: Filter per jurusan/kelas/mapel, detail sesi absensi
- **Riwayat Izin**: List pengajuan izin dengan filter status
- **Notifikasi Telegram**: Auto-kirim ke guru setelah absen masuk/keluar

### 👨‍💼 **Admin Features**
- **Dashboard**: Stats real-time (total guru, absen hari ini, izin pending)
- **Manajemen Guru**: CRUD lengkap + Reset Password + Edit Password (modal dialog)
- **QR Ruangan**: CRUD ruangan + Geofence Radius + Geolocation per ruangan
- **Izin**: Approve/Reject permohonan izin guru
- **Mata Pelajaran**: CRUD dengan filter jurusan + search (modal dialog)
- **Jurusan**: CRUD dengan modal dialog
- **Kelas**: CRUD dengan filter jurusan (modal dialog)
- **Jadwal Kelas**: CRUD dengan search + filter jurusan/kelas/hari (modal dialog)
- **Laporan Absensi**: Filter Harian/Mingguan/Bulanan → Export **CSV / Excel / PDF**

### 📊 **Reports & Export**
- `GET /api/reports/attendance?period=daily|weekly|monthly&date=...`
- `GET /api/reports/attendance/history` - Riwayat dengan sesi
- `GET /api/reports/attendance/sessions` - Flat list sesi absensi
- `GET /api/reports/attendance/csv` - Streaming CSV
- `GET /api/reports/attendance/excel` - Streaming XLSX (openpyxl)
- `GET /api/reports/attendance/pdf` - Streaming PDF (reportlab)
- `GET /api/reports/teacher/{id}/summary` - Ringkasan per guru

### 🗓️ Jadwal Kelas & Nama Hari
- Filter jadwal admin mendukung pencarian kelas/mapel/guru serta filter jurusan, kelas, dan hari (Senin-Minggu).
- Backend menormalkan nilai `day_of_week` saat membuat atau mengubah jadwal; nama Inggris dan variasi kapitalisasi diterima, lalu disimpan sebagai nama Indonesia kanonis.
- Migration PostgreSQL tersedia di `backend/src/db/migrations/002_normalize_day_of_week_to_indonesian.sql` untuk tabel `grade_schedules` dan `schedules`.
- **Production migration belum dijalankan otomatis.** Backup database sebelum menjalankan SQL di Supabase SQL Editor, lalu verifikasi kedua tabel berisi nama hari Indonesia. Panduan: `MIGRATION_WEEKDAY.md`.
- Mode SQLite lokal tidak menjalankan migration PostgreSQL tersebut. Data lokal perlu menggunakan nama hari Indonesia untuk cocok dengan filter UI dan validasi jadwal.

### 🤖 **Telegram Bot**
- `POST /api/telegram/notify/attendance` - Kirim notifikasi ke guru
- `GET /api/telegram/setup` - Info setup bot
- `GET /api/telegram/test` - Test koneksi bot

### 🔧 **ESP32 Integration**
- Firmware untuk display QR code di ruangan
- Endpoint `GET /api/qr/info/{room_code}` untuk ESP32 fetch token

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | FastAPI, Python 3.11+, SQLite (dev) / Supabase (prod) |
| **Auth** | JWT (python-jose), bcrypt (passlib), Resend (email OTP) |
| **Export** | openpyxl (Excel), reportlab (PDF), csv (built-in) |
| **Geo** | Haversine formula (manual implementation) |
| **Telegram** | httpx (async HTTP client) |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **State** | Zustand (auth store), Context API |
| **QR Scan** | html5-qrcode (camera-based) |
| **Icons** | lucide-react |
| **Dates** | date-fns |
| **HTTP** | axios (with interceptors) |
| **Maps** | react-leaflet, leaflet |
| **Deploy** | Vercel (frontend), Railway (backend) |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+
- Tailscale (untuk akses mobile via HTTPS)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Environment (development mode)
export DEVELOPMENT=1
export JWT_SECRET="your_jwt_secret_at_least_32_chars_change_me"

# Run server
uvicorn src.main:app --host 0.0.0.0 --port 8000
# Server: http://localhost:8000 | http://<tailscale-ip>:8000
# API Docs: http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install

# Environment
echo "VITE_API_URL=http://localhost:8000" > .env.local

# Run dev server
npm run dev -- --host 0.0.0.0 --port 3001
# Server: http://localhost:3001 | http://<tailscale-ip>:3001
```

### Test Accounts (auto-created di DEVELOPMENT=1)
| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@sipguru.com` | `admin123` |
| **Guru** | `guru1@sipguru.com` | `password123` |

---

## 🌐 Deployment

### Architecture
```
┌─────────────────┐     HTTPS      ┌──────────────────┐
│   Frontend      │ ◄─────────────► │    Backend       │
│   (Vercel)      │   REST API      │   (Railway)      │
│   https://...   │                 │   https://...    │
└─────────────────┘                 └──────────────────┘
         │                                    │
         │                                    ▼
         │                            ┌──────────────────┐
         └──────────────────────────► │   Database       │
                                      │   Supabase       │
                                      │   (PostgreSQL)   │
                                      └──────────────────┘
```

### 1. Backend → Railway (Recommended)

#### A. Push ke GitHub
```bash
cd /home/raksyz/sipguru
git add .
git commit -m "feat: description"
git push -u origin main
```

#### B. Deploy di Railway
1. Buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Pilih repo `sipguru` → **Deploy** (auto-detect via `railway.json`)
3. **Variables** (Settings → Variables):
   ```env
   DEVELOPMENT=0
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_KEY=eyJ...
   RESEND_API_KEY=re_xxx
   JWT_SECRET=your_super_secret_jwt_key_min_32_chars
   JWT_ALGORITHM=HS256
   JWT_EXPIRY_HOURS=24
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...  # Optional
   ```
4. **Deploy** → dapat URL: `https://sipguru-backend.railway.app`

### 2. Frontend → Vercel

#### A. Update API URL
```bash
cd frontend
# Set di Vercel Dashboard (Environment Variables)
VITE_API_URL=https://sipguru-backend.railway.app
```

#### B. Deploy
```bash
vercel --prod
# Atau: Push ke GitHub → Import di Vercel Dashboard
```

#### C. Environment Variables di Vercel Dashboard
```env
VITE_API_URL=https://sipguru-backend.railway.app
```

#### D. Update Backend CORS
Di Railway Variables, tambah:
```env
ALLOWED_ORIGINS=["https://sipguru.vercel.app","https://sipguru-git-main.vercel.app"]
```
*(Atau edit `config.py` allow_origins lalu redeploy)*

---

## 📱 Mobile Access (Location Permission)

**HTTPS WAJIB** untuk `navigator.geolocation` di mobile browser.

| Akses | HTTPS | Location Permission |
|-------|-------|---------------------|
| `http://localhost:3001` | ❌ | ✅ (localhost exception) |
| `http://<tailscale-ip>:3001` | ❌ | ❌ **Blocked** |
| `https://sipguru.vercel.app` | ✅ | ✅ **Works** |
| `https://xxx.railway.app` | ✅ | N/A (API only) |

**Solusi Development:**
1. **Deploy ke Vercel** → HTTPS otomatis ✅
2. **Tailscale HTTPS**: `tailscale serve --https=3001 --http=3001` → dapat `https://<hostname>.ts.net`
3. **Ngrok**: `ngrok http 3001` → HTTPS tunnel sementara

---

## 🔧 Environment Variables

### Backend (`.env` atau Railway Variables)
```env
# Mode
DEVELOPMENT=1                    # 1=SQLite local, 0=Supabase production

# Supabase (Production)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# Resend (Email OTP)
RESEND_API_KEY=re_xxxxxxxxxxxx

# JWT
JWT_SECRET=your_super_secret_min_32_chars
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24

# App
APP_NAME=SIPGURU
APP_URL=https://sipguru.vercel.app

# Validation
GEOFENCE_RADIUS_M=150
LATE_TOLERANCE_MINUTES=15
QR_EXPIRY_SECONDS=30

# Telegram (Optional)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# CORS (comma-separated)
ALLOWED_ORIGINS=https://sipguru.vercel.app,https://xxx.railway.app
```

### Frontend (`.env.local` / Vercel Env)
```env
VITE_API_URL=http://localhost:8000          # Local
VITE_API_URL=https://sipguru-backend.railway.app  # Production
```

---

## 📚 API Endpoints Summary

### Auth
```
POST   /api/auth/login              # Login email+password
POST   /api/auth/request-unbind     # Request OTP unbind device
POST   /api/auth/verify-device      # Verify OTP
```

### Teacher Attendance
```
POST   /api/attendance              # Submit attendance (3-layer)
GET    /api/teacher/leaves          # Get my leave requests
POST   /api/teacher/leaves          # Create leave request
GET    /api/teacher/todays-schedule # Get my schedule today
GET    /api/teacher/history         # Get attendance history
GET    /api/teacher/rooms           # Get rooms for attendance
```

### Admin
```
# Dashboard
GET    /api/admin/stats/daily       # Daily stats
GET    /api/admin/stats/monthly     # Monthly stats

# Teachers
GET    /api/admin/teachers          # List all teachers
POST   /api/admin/teachers          # Create teacher
PUT    /api/admin/teachers/{id}     # Update teacher
DELETE /api/admin/teachers/{id}     # Delete teacher
POST   /api/admin/teachers/reset-password  # Reset password

# Rooms
GET    /api/admin/rooms             # List rooms
POST   /api/admin/rooms             # Create room
PUT    /api/admin/rooms/{id}        # Update room
DELETE /api/admin/rooms/{id}        # Delete room

# Subjects (Mata Pelajaran)
GET    /api/admin/subjects          # List subjects
POST   /api/admin/subjects          # Create subject
PUT    /api/admin/subjects/{id}     # Update subject
DELETE /api/admin/subjects/{id}     # Delete subject

# Grades (Kelas)
GET    /api/admin/grades            # List grades
POST   /api/admin/grades            # Create grade
PUT    /api/admin/grades/{id}       # Update grade
DELETE /api/admin/grades/{id}       # Delete grade

# Jurusan
GET    /api/admin/jurusan           # List jurusan
POST   /api/admin/jurusan           # Create jurusan
PUT    /api/admin/jurusan/{id}      # Update jurusan
DELETE /api/admin/jurusan/{id}      # Delete jurusan

# Grade Schedules (Jadwal Kelas)
GET    /api/admin/grade-schedules   # List schedules
POST   /api/admin/grade-schedules   # Create schedule
PUT    /api/admin/grade-schedules/{id}  # Update schedule
DELETE /api/admin/grade-schedules/{id}  # Delete schedule

# Leave Requests
GET    /api/admin/leaves            # All leave requests
POST   /api/admin/leaves/approve    # Approve/Reject leave

# QR Tokens
GET    /api/admin/qr-tokens         # List QR tokens
POST   /api/admin/qr-tokens         # Generate QR for schedule
DELETE /api/admin/qr-tokens/{id}    # Delete QR token
```

### Reports
```
GET    /api/reports/attendance?period=daily|weekly|monthly&date=...
GET    /api/reports/attendance/history  # History with sessions
GET    /api/reports/attendance/sessions # Flat session list
GET    /api/reports/attendance/csv      # Streaming CSV
GET    /api/reports/attendance/excel    # Streaming XLSX
GET    /api/reports/attendance/pdf      # Streaming PDF
GET    /api/reports/teacher/{id}/summary  # Per-teacher summary
```

### QR Token
```
POST   /api/qr/generate             # Generate token (admin)
POST   /api/qr/validate             # Validate token (teacher scan)
GET    /api/qr/info/{room_code}     # Get room info (ESP32)
```

### Telegram
```
POST   /api/telegram/notify/attendance  # Send notification
GET    /api/telegram/setup              # Setup info
GET    /api/telegram/test               # Test connection
```

---

## 🗄️ Database Schema (Key Tables)

```sql
-- Users (guru + admin)
users: id, email, nip, name, role, phone, school_id, password_hash, created_at

-- Schools
schools: id, name, address

-- Rooms (ruangan absensi)
rooms: id, school_id, name, room_code, geofence_radius (default 150), geolocation (lat,lon)

-- Jurusan (Majors)
jurusan: id, school_id, name, code, description, created_at

-- Subjects (Mata Pelajaran)
subjects: id, name, code, description, jurusan_id, school_id, created_at

-- Grades (Kelas)
grades: id, jurusan_id, school_id, name, grade_level, created_at

-- Grade Schedules (Jadwal Kelas)
grade_schedules: id, grade_id, subject_id, teacher_id, day_of_week (Indonesia), start_time, end_time, room_id, is_active, created_at

-- Attendance Logs
attendance_logs: id, teacher_id, room_id, status, geolocation, qr_token, device_fingerprint, lateness_minutes, admin_remarks, attendance_context (JSON), created_at

-- Leave Requests
leave_requests: id, teacher_id, schedule_id, start_date, end_date, reason, status (pending/approved/rejected), approved_by, approved_at, created_at

-- QR Tokens
qr_tokens: id, schedule_id, room_id, grade_id, subject_id, teacher_id, token, expires_at, is_active, token_type, state, scanned_at, created_at

-- Device Bindings
device_bindings: id, user_id, device_fingerprint, device_name, last_used, is_active, unbind_code_hash, created_at
```

**Catatan:** `day_of_week` menggunakan nama hari Indonesia: Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu. Migration tersedia di `backend/src/db/migrations/002_normalize_day_of_week_to_indonesian.sql`.

---

## 🐛 Troubleshooting

| Issue | Solusi |
|-------|--------|
| `ModuleNotFoundError: pydantic_settings` | `pip install pydantic-settings python-dotenv` |
| `ModuleNotFoundError: cryptography` | `pip install cryptography` |
| Location permission blocked | Deploy ke Vercel (HTTPS) atau pakai `tailscale serve --https` |
| Database locked | `pkill -9 uvicorn` → wait 3s → restart |
| CORS error | Update `ALLOWED_ORIGINS` di backend config |
| QR scan tidak jalan | Pastikan HTTPS + camera permission granted |
| Telegram notif tidak terkirim | Set `TELEGRAM_BOT_TOKEN`, cek `/api/telegram/test` |
| Filter hari tidak match | Database harus format Indonesia (Senin, Selasa, dst) - jalankan migration |

---

## 📝 License

MIT License - Free to use, modify, distribute.

---

## 🤝 Contributing

1. Fork repo
2. Create feature branch
3. Commit changes
4. Push & create PR

---

**SIPGURU** - *Sistem Presensi Guru Terintegrasi*  
Built with ❤️ using FastAPI + React + TypeScript
