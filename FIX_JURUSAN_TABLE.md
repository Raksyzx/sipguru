# 🔴 FIX JURUSAN TABLE - ADD MISSING COLUMNS

## 🎯 MASALAH

Table `jurusan` sudah ada (GET returns 200), tapi **POST gagal** karena:
- Kolom `school_id` tidak ada di tabel, ATAU
- FK constraint ke `schools` table gagal (school dengan ID tersebut tidak ada)

---

## ✅ SOLUSI: Run SQL ini di Supabase SQL Editor

```sql
-- 1. Check current jurusan table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'jurusan'
ORDER BY ordinal_position;

-- 2. If school_id missing, add it
ALTER TABLE jurusan ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

-- 3. Check schools table - ensure school exists
INSERT INTO schools (id, name, address) 
VALUES ('00000000-0000-0000-0000-000000000001', 'SMK Negeri 1', 'Jl. Merdeka No. 1')
ON CONFLICT (id) DO NOTHING;

-- 4. Also fix subjects, grades, grade_schedules, qr_tokens tables
DROP TABLE IF EXISTS qr_tokens CASCADE;
DROP TABLE IF EXISTS grade_schedules CASCADE;
DROP TABLE IF EXISTS grades CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;

-- SUBJECTS
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    jurusan_id UUID REFERENCES jurusan(id),
    school_id UUID REFERENCES schools(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GRADES
CREATE TABLE grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jurusan_id UUID REFERENCES jurusan(id),
    school_id UUID REFERENCES schools(id),
    name TEXT NOT NULL,
    grade_level INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GRADE SCHEDULES
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

-- QR TOKENS
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

-- DISABLE RLS
ALTER TABLE jurusan DISABLE ROW LEVEL SECURITY;
ALTER TABLE subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE grades DISABLE ROW LEVEL SECURITY;
ALTER TABLE grade_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens DISABLE ROW LEVEL SECURITY;
```

---

## 🧪 TEST SETELAH FIX

```bash
# 1. Test jurusan create
curl -X POST https://sipguru-production.up.railway.app/api/admin/jurusan \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Teknik Informatika","code":"TI","school_id":"00000000-0000-0000-0000-000000000001"}'

# 2. Test subjects
curl "https://sipguru-production.up.railway.app/api/admin/subjects?school_id=00000000-0000-0000-0000-000000000001" \
  -H "Authorization: Bearer <token>"

# 3. Test grades
curl "https://sipguru-production.up.railway.app/api/admin/grades?school_id=00000000-0000-0000-0000-000000000001" \
  -H "Authorization: Bearer <token>"

# 4. Test create teacher
curl -X POST https://sipguru-production.up.railway.app/api/admin/teachers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Guru","email":"test@sipguru.com","nip":"GURU001","password":"password123","school_id":"00000000-0000-0000-0000-000000000001"}'
```

---

**Run SQL di atas, lalu test!** 🚀