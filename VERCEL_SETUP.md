# SIPGURU - Vercel Environment Setup

## Required Environment Variables di Vercel Dashboard

1. **Login ke Vercel** → https://vercel.com/dashboard
2. **Pilih project** `sipguru` (atau `sipguru-six`)
3. **Settings** → **Environment Variables**
4. **Add variable**:

### Production Environment:
```
VITE_API_URL=https://sipguru-production.up.railway.app
```

### Preview Environment (optional):
```
VITE_API_URL=https://sipguru-production.up.railway.app
```

---

## Required Environment Variables di Railway Dashboard

1. **Login ke Railway** → https://railway.app
2. **Pilih project** `sipguru` (backend)
3. **Variables** tab
4. **Add variable**:

```
SUPABASE_URL=https://kyhbcguycelqstmoewlm.supabase.co
SUPABASE_ANON_KEY=eyJhbG...Ze78
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...whyY
JWT_SECRET=your_jwt_secret_here
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24
CRON_SECRET=generate_32_char_hex_here
```

---

## Database Migration (Supabase SQL Editor)

Run di Supabase Dashboard → SQL Editor:

```sql
-- Add avatar_url column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'avatar_url';
```

---

## Test

Setelah deploy ulang di Vercel:

1. **Buka** https://sipguru-six.vercel.app/teacher/
2. **Login** dengan akun guru (email: `raka@sipguru.com`, password: `password123`)
3. **Cek Profil Guru** → data harus tampil:
   - ✅ Nama Lengkap
   - ✅ Email
   - ✅ NIP
   - ✅ Nomor Telepon
   - ✅ Avatar (foto atau initial)

4. **Cek Dashboard Guru** → nama lengkap tampil (bukan nama pendek)

---

## Troubleshooting

### "Gagal memuat profil"
- ✅ Check `VITE_API_URL` di Vercel environment variables
- ✅ Check backend Railway running (https://sipguru-production.up.railway.app/health)
- ✅ Check browser console untuk error CORS/network

### Data kosong di form profil
- ✅ Check backend endpoint `/api/teacher/profile` return `{user: {...}}`
- ✅ Check kolom `avatar_url` ada di tabel `users` Supabase
- ✅ Check JWT token valid (tidak expired)

### Avatar tidak tampil
- ✅ Check kolom `avatar_url` di DB ada data (base64 atau URL)
- ✅ Check upload endpoint `/teacher/upload-avatar` berfungsi
