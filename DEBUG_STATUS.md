# SIPGURU - Critical Bugs & Fixes

## Status: BLOCKED - Railway Deployment Issue

### Problem Summary
- ✅ Login: WORKING
- ❌ Create Teacher: 500 Internal Server Error
- ❌ Get Jurusan: 500 Internal Server Error  
- ❌ Dashboard: "Gagal memuat data dashboard"

### Root Cause Analysis

**Code sudah benar di GitHub**, tapi **Railway masih deploy code lama** atau ada issue dengan:

1. **Supabase RLS (Row Level Security)** - Tables punya policies yang block insert/select
2. **Missing columns** di Supabase vs schema yang diharapkan
3. **Railway deploy commit lama** - bukan yang terbaru

### Evidence

```bash
# Test 1: Get teachers - SUCCESS (200 OK)
curl /api/admin/teachers
# Returns: {"teachers":[...]}

# Test 2: Create teacher - FAIL (500)
curl -X POST /api/admin/teachers \
  -H "Authorization: Bearer {token}" \
  -d '{"name":"Test","email":"test@sipguru.com","nip":"GURU","password":"pwd","school_id":"..."}'
# Returns: Internal Server Error

# Test 3: Get jurusan - FAIL (500)
curl /api/admin/jurusan
# Returns: Internal Server Error
```

### Files Modified (Already Pushed to GitHub)

✅ `backend/src/supabase.py` - Added:
- `is_email_taken()` 
- `is_nip_taken()`
- `get_all_jurusan()`
- `create_user()` with password_hash support

✅ `backend/src/endpoints/admin.py` - Already correct

✅ `backend/src/database.py` - Conditional DB client (LocalDB vs Supabase)

### What Needs to Be Done

#### 1. **Check Railway Deployment**
```
https://railway.app/dashboard → sipguru → Deployments
```
- Verify latest commit hash matches GitHub (`git log -1`)
- If old, click "Redeploy"

#### 2. **Check Supabase RLS Policies**
Run in Supabase SQL Editor:
```sql
-- Disable RLS for all tables (testing only)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE jurusan DISABLE ROW LEVEL SECURITY;
ALTER TABLE schools DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;

-- Check if any policies exist
SELECT * FROM pg_policies WHERE tablename IN ('users', 'jurusan', 'schools');
```

#### 3. **Verify Supabase Schema**
```sql
-- Check users table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- Check jurusan table exists
SELECT * FROM jurusan LIMIT 1;
```

#### 4. **Test Manual Insert**
```sql
-- Test if insert works via SQL
INSERT INTO users (email, nip, name, role, school_id, password_hash)
VALUES (
  'testapi@sipguru.com',
  'TESTAPI',
  'Test API',
  'teacher',
  '00000000-0000-0000-0000-000000000001',
  '$2b$12$687O9n8.gG.S9TANtZIPvuRJap3QhdeXchB0iuKl8OB9o7C.jK/Be'
);
```

### Working Test (via SQL)
```sql
-- This WORKS (manual insert)
INSERT INTO users (email, nip, name, role, school_id, password_hash)
VALUES ('testmanual@sipguru.com', 'TEST999', 'Test Manual', 'teacher', 
        '00000000-0000-0000-0000-000000000001', 
        '$2b$12$687O9n8.gG.S9TANtZIPvuRJap3QhdeXchB0iuKl8OB9o7C.jK/Be');
-- Returns: Success

-- This FAILS (via API)
POST /api/admin/teachers
-- Returns: 500 Internal Server Error
```

### Conclusion

**Code sudah benar**, masalah ada di:
1. Railway deploy code lama (bukan commit terbaru), ATAU
2. Supabase RLS policies blocking API calls, ATAU  
3. Column mismatch antara schema Supabase vs code

**Next step**: Cek Railway deployment logs + Disable RLS di Supabase.

---

## Quick Fix Commands

### Railway
1. Go to: https://railway.app/dashboard → sipguru
2. Click "Deployments" tab
3. Click "..." on latest deployment → "Redeploy"
4. Wait for success

### Supabase
1. Go to: https://supabase.com/dashboard → SIPGURU
2. SQL Editor
3. Run:
```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE jurusan DISABLE ROW LEVEL SECURITY;
```

### Test After Fix
```bash
# Login
curl -X POST https://sipguru-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sipguru.com","password":"admin123"}'

# Create teacher
curl -X POST https://sipguru-production.up.railway.app/api/admin/teachers \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@sipguru.com","nip":"GURU","password":"pwd","school_id":"00000000-0000-0000-0000-000000000001"}'
```
