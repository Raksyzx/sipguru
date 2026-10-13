SIPGURU Frontend - React + TypeScript Teacher Attendance App
================================================================

## Stack
- React 18 + TypeScript
- Vite 5 (build tool)
- Tailwind CSS 3
- Zustand (state management)
- Lucide Icons

## Run
cd frontend
npm install
npm run dev

## Pages
- /login               - Login page
- /attendance         - Teacher attendance (GPS + QR scanner)
- /teacher/dashboard  - Teacher dashboard (placeholder)
- /admin/dashboard    - Admin dashboard (with stats, CRUD)

## Features
- Mobile-first responsive design
- Real-time GPS geolocation
- QR scanner (camera-based)
- Device fingerprinting
- JWT auth with refresh tokens
- 3-layer validation submission

## Environment
VITE_API_URL=http://localhost:8000/api

## Build
npm run build
# Output: dist/

## Deployment
Deploy dist/ folder to Vercel/Netlify
