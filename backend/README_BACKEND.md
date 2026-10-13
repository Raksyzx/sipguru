SIPGURU Backend - FastAPI Teacher Attendance System
================================================================

## Structure
src/
├── main.py           # FastAPI entry point
├── config.py         # Configuration & env loading
├── auth.py           # JWT & HMAC token generation/verification
├── resend.py         # Resend email OTP integration
├── validation.py     # 3-layer attendance validation
├── supabase.py       # Supabase PostgreSQL client
└── endpoints/
    ├── auth.py       # Authentication & device binding
    ├── teacher.py    # Teacher-specific endpoints
    ├── admin.py      # Admin dashboard & CRUD
    └── qr.py         # QR token generation & validation

## Database
Run: backend/src/db/schema.sql in Supabase SQL Editor

## Setup
1. cd backend
2. pip install -r requirements.txt
3. cp .env.example .env
4. Edit .env with your Supabase + Resend credentials
5. uvicorn src.main:app --reload

## Endpoints

POST   /api/auth/login              # Login
POST   /api/auth/request-unbind     # Request OTP for unbind
POST   /api/auth/verify-device      # Verify OTP
POST   /api/attendance              # Submit attendance

POST   /api/qr/generate             # Generate QR token
POST   /api/qr/validate             # Validate QR token
GET    /api/qr/info/{room_code}     # Get room info

GET    /api/admin/stats/daily       # Daily stats (admin)
GET    /api/admin/stats/monthly     # Monthly stats (admin)
GET    /api/admin/teachers          # List teachers (admin)
POST   /api/admin/teachers          # Create teacher (admin)
GET    /api/admin/rooms             # List rooms (admin)
GET    /api/admin/leave             # Get leaves (admin)
POST   /api/admin/leaves/approve    # Approve/reject leave (admin)
POST   /api/admin/manual-attendance # Manually mark attendance (admin)

## 3-Layer Validation
1. GPS Geofence: 150m radius around room
2. QR Token: HMAC-signed, 15-30s expiry
3. Schedule Match: Teacher must be scheduled for that room/time (15min tolerance)

## Config (config.py)
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
- RESEND_API_KEY
- JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_HOURS
- GEOFENCE_RADIUS_M (default: 150)
- QR_EXPIRY_SECONDS (default: 30)
- LATE_TOLERANCE_MINUTES (default: 15)
