# 🔴 FIX: RECREATE TABLES DENGAN SCHEMA BENAR

## 🎯 MASALAH

Tabel `jurusan` sudah OK (HTTP 200), tapi tabel lain masih error karena **schema tidak cocok** dengan yang diharapkan backend.

Kemungkinan:
- `subjects` tidak punya kolom `jurusan_id`
- `grades` tidak punya kolom `jurusan_id`
- `grade_schedules` schema lama
- `qr_tokens` schema lama

---

## ✅ SOLUSI

Run SQL ini di **Supabase SQL Editor**:

```sql
-- ============================================
-- DROP OLD TABLES (cascade akan drop dependents)
-- ============================================
DROP TABLE IF EXISTS qr_tokens CASCADE;
DROP TABLE IF EXISTS grade_schedules CASCADE;
DROP TABLE IF EXISTS grades CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;

-- ============================================
-- SUBJECTS (Mata Pelajaran)
-- ============================================
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    jurusan_id UUID REFERENCES jurusan(id),
    school_id UUID REFERENCES schools(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GRADES (Kelas/Tingkat)
-- ============================================
CREATE TABLE grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jurusan_id UUID REFERENCES jurusan(id),
    school_id UUID REFERENCES schools(id),
    name TEXT NOT NULL,
    grade_level INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GRADE SCHEDULES (Jadwal Kelas)
-- ============================================
CREATE TABLE grade_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grade_id UUID REFERENCES grades(id),
    subject_id UUID REFERENCES subjects(id),
    teacher_id UUID REFERENCES users(id),
    day_of_week TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    room_id UUID REFERENCES rooms(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- QR TOKENS
-- ============================================
CREATE TABLE qr_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID REFERENCES grade_schedules(id),
    room_id UUID REFERENCES rooms(id),
    grade_id UUID REFERENCES grades(id),
    subject_id UUID REFERENCES subjects(id),
    teacher_id UUID REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DISABLE RLS
-- ============================================
ALTER TABLE subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE grades DISABLE ROW LEVEL SECURITY;
ALTER TABLE grade_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens DISABLE ROW LEVEL SECURITY;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_jurusan ON subjects(jurusan_id);
CREATE INDEX IF NOT EXISTS idx_grades_school ON grades(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_jurusan ON grades(jurusan_id);
CREATE INDEX IF NOT EXISTS idx_grade_schedules_grade ON grade_schedules(grade_id);
CREATE INDEX IF NOT EXISTS idx_grade_schedules_subject ON grade_schedules(subject_id);
CREATE INDEX IF NOT EXISTS idx_grade_schedules_teacher ON grade_schedules(teacher_id);
```

---

## 🧪 TEST SETELAH FIX

Refresh: https://sipguru-six.vercel.app

1. Login: `admin@sipguru.com` / `admin123`
2. Dashboard → harus load tanpa alert ✅
3. Tab Guru → Tambah data ✅
4. Tab Jurusan → tampil ✅
5. Tab Mapel → tampil ✅
6. Tab Kelas → tampil ✅
7. Tab Jadwal → tampil ✅

---

**Run SQL sekarang!** 🚀
