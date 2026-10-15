-- SIPGURU Complete Database Schema for Supabase
-- Run this in Supabase SQL Editor
-- Updated to match local_db.py latest schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SCHOOLS
-- ============================================
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USERS (Teachers & Admins)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    nip TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'teacher' CHECK (role IN ('admin', 'teacher')),
    phone TEXT,
    school_id UUID REFERENCES schools(id),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
-- ROOMS (Ruangan Kelas)
-- ============================================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id),
    name TEXT NOT NULL,
    room_code TEXT UNIQUE NOT NULL,
    geofence_radius INTEGER DEFAULT 150,
    geolocation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCHEDULES (Legacy - for teacher attendance schedule)
-- ============================================
CREATE TABLE IF NOT EXISTS schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES users(id),
    room_id UUID NOT NULL REFERENCES rooms(id),
    day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ATTENDANCE LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES users(id),
    room_id UUID NOT NULL REFERENCES rooms(id),
    status TEXT NOT NULL CHECK (status IN ('on_time', 'late', 'absent', 'deferred', 'approved')),
    geolocation TEXT,
    qr_token TEXT,
    device_fingerprint TEXT,
    lateness_minutes INTEGER DEFAULT 0,
    admin_remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LEAVE REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES users(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DEVICE BINDINGS
-- ============================================
CREATE TABLE IF NOT EXISTS device_bindings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    device_fingerprint TEXT NOT NULL,
    device_name TEXT,
    last_used TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    unbind_code_hash TEXT,
    unbind_request_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, device_fingerprint)
);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
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
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_nip ON users(nip);
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_schedules_teacher ON schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_schedules_room ON schedules(room_id);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher ON attendance_logs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_room ON attendance_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_leave_teacher ON leave_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_device_fingerprint ON device_bindings(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_user ON device_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_qr_token ON qr_tokens(token);
CREATE INDEX IF NOT EXISTS idx_qr_schedule ON qr_tokens(schedule_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_school ON grades(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_jurusan ON grades(jurusan_id);
CREATE INDEX IF NOT EXISTS idx_grade_schedules_grade ON grade_schedules(grade_id);
CREATE INDEX IF NOT EXISTS idx_grade_schedules_subject ON grade_schedules(subject_id);
CREATE INDEX IF NOT EXISTS idx_grade_schedules_teacher ON grade_schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_jurusan_school ON jurusan(school_id);

-- ============================================
-- ROW LEVEL SECURITY (Optional - enable when ready)
-- ============================================
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
-- ... add policies as needed

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================
-- INSERT INTO schools (id, name, address) VALUES 
-- ('00000000-0000-0000-0000-000000000001', 'SMK Negeri 1', 'Jl. Merdeka No. 1');

-- Password hash for 'admin123': $2b$12$29fsjDn4Iug1abLzsCB8ue2dsa/2YTJh86lw/N4oZwr60Atz9PKmq
-- Password hash for 'password123': $2b$12$687O9n8.gG.S9TANtZIPvuRJap3QhdeXchB0iuKl8OB9o7C.jK/Be

-- INSERT INTO users (id, email, nip, name, role, school_id, password_hash) VALUES
-- ('00000000-0000-0000-0000-000000000002', 'admin@sipguru.com', 'ADMIN001', 'Admin SIPGURU', 'admin', '00000000-0000-0000-0000-000000000001', '$2b$12$29fsjDn4Iug1abLzsCB8ue2dsa/2YTJh86lw/N4oZwr60Atz9PKmq'),
-- ('00000000-0000-0000-0000-000000000003', 'guru1@sipguru.com', 'GUR001', 'Ahmad Hidayat', 'teacher', '00000000-0000-0000-0000-000000000001', '$2b$12$687O9n8.gG.S9TANtZIPvuRJap3QhdeXchB0iuKl8OB9o7C.jK/Be');