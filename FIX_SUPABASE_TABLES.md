# 🔴 MASALAH DITEMUKAN - FIX SUPABASE

## 🎯 ROOT CAUSE

**Tabel di Supabase TIDAK LENGKAP!**

Backend code sudah benar ✅, tapi tabel-tabel ini **BELUM ADA** di Supabase:
- ❌ `jurusan`
- ❌ `subjects`
- ❌ `grades`
- ❌ `grade_schedules`
- ❌ `qr_tokens`

Makanya semua endpoint `/api/admin/jurusan`, `/api/admin/subjects`, dll return **500 Internal Server Error**.

---

## ✅ SOLUSI

### 1. Buka Supabase SQL Editor
https://supabase.com/dashboard → Pilih project SIPGURU → SQL Editor

### 2. Copy-Paste SQL ini dan Run

```sql
-- ============================================
-- JURUSAN (Majors/Departments)
-- ============================================
CREATE TABLE IF NOT EXISTS jurusan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SUBJECTS (Mata Pelajaran)
-- ============================================
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    jurusan_id UUID NOT NULL REFERENCES jurusan(id),
    school_id UUID NOT NULL REFERENCES schools(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GRADES (Kelas/Tingkat)
-- ============================================
CREATE TABLE IF NOT EXISTS grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jurusan_id UUID NOT NULL REFERENCES jurusan(id),
    school_id UUID NOT NULL REFERENCES schools(id),
    name TEXT NOT NULL,
    grade_level INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GRADE SCHEDULES (Jadwal Kelas per Mata Pelajaran)
-- ============================================
CREATE TABLE IF NOT EXISTS grade_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grade_id UUID NOT NULL REFERENCES grades(id),
    subject_id UUID NOT NULL REFERENCES subjects(id),
    teacher_id UUID NOT NULL REFERENCES users(id),
    day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    room_id UUID REFERENCES rooms(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- QR TOKENS (for attendance sessions)
-- ============================================
CREATE TABLE IF NOT EXISTS qr_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- ============================================
-- DISABLE RLS (untuk testing)
-- ============================================
ALTER TABLE jurusan DISABLE ROW LEVEL SECURITY;
ALTER TABLE subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE grades DISABLE ROW LEVEL SECURITY;
ALTER TABLE grade_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens DISABLE ROW LEVEL SECURITY;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_school ON grades(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_jurusan ON grades(jurusan_id);
CREATE INDEX IF NOT EXISTS idx_grade_schedules_grade ON grade_schedules(grade_id);
CREATE INDEX IF NOT EXISTS idx_grade_schedules_subject ON grade_schedules(subject_id);
CREATE INDEX IF NOT EXISTS idx_grade_schedules_teacher ON grade_schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_jurusan_school ON jurusan(school_id);
```

### 3. Tunggu "Success. No rows returned"

### 4. Refresh Frontend
https://sipguru-six.vercel.app

---

## 🧪 TEST SETELAH FIX

1. **Login**: `admin@sipguru.com` / `admin123`
2. **Dashboard** → harus load tanpa alert ✅
3. **Tab Guru** → Tambah data guru ✅
4. **Tab Jurusan** → harus tampil ✅
5. **Tab Mapel** → harus tampil ✅
6. **Tab Kelas** → harus tampil ✅
7. **Tab Jadwal** → harus tampil ✅

---

## 📝 NOTES

- File lengkap: `backend/src/db/schema_supabase_complete.sql` (sudah di repo)
- Backend code: `backend/src/supabase.py` sudah ada semua methods ✅
- Frontend code: sudah benar ✅
- **Yang missing**: tabel di Supabase!

---

**Setelah run SQL di atas, semua error akan hilang!** 🚀
