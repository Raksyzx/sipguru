# Migration Weekday ke Indonesia - Ringkasan

## Status

### ✅ Lokal (SQLite)
- Database sudah diupdate ke format Indonesia
- Backend mengembalikan: Senin, Selasa, Rabu, Kamis, Jumat
- Frontend filter logic sudah benar
- **Test:** Refresh halaman, filter "Senin" akan tampilkan 2 jadwal

### ⏳ Production (Supabase)
- Database MASIH format Inggris: Monday, Tuesday, Wednesday, Thursday, Friday
- Backend code sudah ada `normalize_day_name()` tapi belum dipakai untuk READ
- Frontend filter logic sudah benar
- **Action needed:** Jalankan migration SQL di Supabase Dashboard

## Cara Menjalankan Migration di Production

1. Buka Supabase Dashboard: https://supabase.com/dashboard/project/kyhbcguycelqstmoewlm/sql/new
2. Copy semua isi file: `backend/src/db/migrations/002_normalize_day_of_week_to_indonesian.sql`
3. Paste ke SQL Editor
4. Klik "Run"
5. Verifikasi: jalankan query ini untuk cek:
   ```sql
   SELECT DISTINCT day_of_week FROM grade_schedules;
   -- Harus return: Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu
   ```

## Verifikasi di Browser

Setelah migration production:

1. Login sebagai admin
2. Buka tab "Jadwal Kelas"
3. Filter Hari = "Senin"
4. Harus tampil jadwal untuk hari Senin
5. Ganti filter ke hari lain, harus tampil data yang sesuai

## Files yang Diubah

```
backend/src/db/migrations/002_normalize_day_of_week_to_indonesian.sql  (NEW)
backend/src/db/schema_supabase_complete.sql                            (MODIFIED)
backend/src/supabase.py                                                (MODIFIED - normalize_day_name)
backend/src/endpoints/admin.py                                         (MODIFIED - validation)
frontend/src/pages/AdminDashboard.tsx                                  (MODIFIED - filter logic)
```

## Test Command (Lokal)

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sipguru.com","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Cek format hari
curl -s http://localhost:8000/api/admin/grade-schedules \
  -H "Authorization: Bearer $TOKEN" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(set(s['day_of_week'] for s in d['grade_schedules']))"
```

Harus return: `{'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'}`
