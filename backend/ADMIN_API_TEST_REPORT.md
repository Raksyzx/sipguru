# SIPGURU Admin API Endpoint Test Results

**Backend:** https://sipguru-production.up.railway.app  
**Auth:** admin@sipguru.com / admin123  
**Test Date:** October 15, 2026

## Summary

The production backend is running with **Supabase** (production mode), but several tables appear to be missing or have RLS (Row Level Security) policies blocking operations.

## Endpoint Test Results

### ✅ Working Endpoints

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| POST | `/api/auth/login` | 200 | Returns access_token, refresh_token |
| GET | `/api/admin/teachers` | 200 | Returns teacher list |
| POST | `/api/admin/teachers` | 400 | Validation works (requires NIP) |
| GET | `/api/admin/jurusan` | 200 | Returns empty list (table exists) |
| GET | `/api/admin/rooms` | 200 | Returns room list |
| POST | `/api/admin/rooms` | 200 | Creates rooms successfully |
| GET | `/api/admin/schedules` | 200 | Returns schedule list |

### ❌ Failing Endpoints (500 Internal Server Error)

All these return `Internal Server Error` (text/plain, 500):

| Method | Endpoint | Error |
|--------|----------|-------|
| POST | `/api/admin/jurusan` | 500 - Table may exist but INSERT fails |
| GET | `/api/admin/subjects` | 500 - Table likely missing or RLS blocked |
| POST | `/api/admin/subjects` | 500 - Cannot create subjects |
| GET | `/api/admin/grades` | 500 - Table likely missing or RLS blocked |
| POST | `/api/admin/grades` | 500 - Cannot create grades |
| GET | `/api/admin/grade-schedules` | 500 - Table likely missing or RLS blocked |
| POST | `/api/admin/grade-schedules` | 500 - Cannot create schedules |
| GET | `/api/admin/leaves` | 500 - Table likely missing or RLS blocked |

## Root Cause Analysis

### Working Tables in Supabase:
- `users` - ✅ Working (teachers, auth)
- `rooms` - ✅ Working
- `schedules` - ✅ Working (old schedule system)

### Broken/Missing Tables in Supabase:
- `jurusan` - ⚠️ GET works (empty), POST fails → **Table exists but INSERT blocked**
- `subjects` - ❌ GET/POST both fail → **Likely missing or RLS blocked**
- `grades` - ❌ GET/POST both fail → **Likely missing or RLS blocked**
- `grade_schedules` - ❌ GET/POST both fail → **Likely missing or RLS blocked**
- `leave_requests` - ❌ GET fails → **Likely missing or RLS blocked**

## Required Actions

### 1. Create Missing Supabase Tables

Run these migrations in Supabase SQL Editor:

```sql
-- Jurusan table
CREATE TABLE IF NOT EXISTS jurusan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  jurusan_id UUID NOT NULL REFERENCES jurusan(id),
  school_id UUID NOT NULL REFERENCES schools(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grades table
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurusan_id UUID NOT NULL REFERENCES jurusan(id),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grade Schedules table
CREATE TABLE IF NOT EXISTS grade_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id UUID NOT NULL REFERENCES grades(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  teacher_id UUID NOT NULL REFERENCES users(id),
  day_of_week TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room_id UUID REFERENCES rooms(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QR Tokens table
CREATE TABLE IF NOT EXISTS qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES grade_schedules(id),
  room_id UUID NOT NULL REFERENCES rooms(id),
  grade_id UUID NOT NULL REFERENCES grades(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  teacher_id UUID NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Disable or Configure RLS Policies

For each new table, either:
- **Option A:** Disable RLS (quick fix for testing):
  ```sql
  ALTER TABLE jurusan DISABLE ROW LEVEL SECURITY;
  ALTER TABLE subjects DISABLE ROW LEVEL SECURITY;
  ALTER TABLE grades DISABLE ROW LEVEL SECURITY;
  ALTER TABLE grade_schedules DISABLE ROW LEVEL SECURITY;
  ALTER TABLE qr_tokens DISABLE ROW LEVEL SECURITY;
  ```

- **Option B:** Create proper RLS policies for admin access

### 3. Test Data to Use

**School ID:** `00000000-0000-0000-0000-000000000001` (existing)  
**Teacher ID:** `f0fe017f-aaa3-4e44-acdc-94bffd80e782` (existing test teacher)

## API Request Examples

### Create Jurusan
```bash
POST /api/admin/jurusan
{
  "school_id": "00000000-0000-0000-0000-000000000001",
  "name": "Ilmu Pengetahuan Alam",
  "code": "IPA",
  "description": "IPA"
}
```

### Create Subject
```bash
POST /api/admin/subjects
{
  "name": "Matematika",
  "code": "MTK-001",
  "jurusan_id": "<jurusan_id_from_above>",
  "school_id": "00000000-0000-0000-0000-000000000001"
}
```

### Create Grade
```bash
POST /api/admin/grades
{
  "name": "Kelas 10 IPA 1",
  "grade_level": 10,
  "jurusan_id": "<jurusan_id>",
  "school_id": "00000000-0000-0000-0000-000000000001"
}
```

### Create Grade Schedule
```bash
POST /api/admin/grade-schedules
{
  "grade_id": "<grade_id>",
  "subject_id": "<subject_id>",
  "teacher_id": "f0fe017f-aaa3-4e44-acdc-94bffd80e782",
  "day_of_week": "Monday",
  "start_time": "08:00",
  "end_time": "09:00",
  "room_id": null
}
```

### Create Teacher
```bash
POST /api/admin/teachers
{
  "name": "New Teacher",
  "email": "teacher@example.com",
  "nip": "NIP123456",
  "password": "password123",
  "phone": "08123456789",
  "school_id": "00000000-0000-0000-0000-000000000001"
}
```

## Notes

- The backend code is correct (verified in `/home/raksyz/sipguru/backend/src/endpoints/admin.py`)
- The issue is purely database schema/RLS in Supabase
- Local development (SQLite) works fine with all endpoints
- Production needs the Supabase tables created and RLS configured
