-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Users table (teachers and admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    nip VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'teacher', -- 'teacher' or 'admin'
    phone VARCHAR(20),
    school_id UUID REFERENCES schools(id),
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schools table
CREATE TABLE schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    geolocation POINT, -- Format: longitude, latitude
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms table (classrooms)
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(id) NOT NULL,
    name VARCHAR(100) NOT NULL,
    room_code VARCHAR(20) UNIQUE NOT NULL,
    geofence_radius INTEGER DEFAULT 150, -- Radius in meters
    geolocation POINT, -- Center point for geofencing
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teacher schedules
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID REFERENCES users(id) NOT NULL,
    room_id UUID REFERENCES rooms(id) NOT NULL,
    day_of_week VARCHAR(10) NOT NULL, -- 'Monday' to 'Sunday'
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance logs
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID REFERENCES users(id) NOT NULL,
    room_id UUID REFERENCES rooms(id) NOT NULL,
    scheduled_time TIME, -- when teacher should have been there
    actual_time TIME, -- when they actually checked in
    status VARCHAR(50) NOT NULL, -- 'on_time', 'late', 'absent', 'deferred', 'approved'
    geolocation POINT,
    qr_token VARCHAR(255), -- HMAC token that was verified
    device_fingerprint VARCHAR(255),
    notes TEXT,
    admin_remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leave requests (Izin)
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID REFERENCES users(id) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (for admin overrides and system events)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Device binding table (1 account = 1 device)
CREATE TABLE device_bindings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    last_used TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    unbind_request_at TIMESTAMPTZ,
    unbind_code_hash VARCHAR(255), -- OTP code hash for unbinding
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_device UNIQUE(user_id, device_fingerprint)
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_nip ON users(nip);
CREATE INDEX idx_schedules_teacher ON schedules(teacher_id);
CREATE INDEX idx_schedules_day ON schedules(day_of_week);
CREATE INDEX idx_attendance_teacher ON attendance_logs(teacher_id);
CREATE INDEX idx_attendance_date ON attendance_logs(created_at);
CREATE INDEX idx_attendance_room ON attendance_logs(room_id);
CREATE INDEX idx_leave_teacher ON leave_requests(teacher_id);
CREATE INDEX idx_device_fingerprint ON device_bindings(device_fingerprint);
CREATE INDEX idx_rooms_school ON rooms(school_id);
CREATE INDEX idx_schedules_room ON schedules(room_id);

-- RLS Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_bindings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can read own data" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admin can manage all users" ON users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- RLS Policies for schools
CREATE POLICY "Admin can manage schools" ON schools
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- RLS Policies for rooms
CREATE POLICY "Admin can manage rooms" ON rooms
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- RLS Policies for schedules
CREATE POLICY "Teachers can read own schedules" ON schedules
    FOR SELECT USING (
        teacher_id = auth.uid() OR
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admin can manage schedules" ON schedules
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- RLS Policies for attendance_logs
CREATE POLICY "Teachers can read own attendance" ON attendance_logs
    FOR SELECT USING (
        teacher_id = auth.uid() OR
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admin can manage attendance" ON attendance_logs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- RLS Policies for leave_requests
CREATE POLICY "Teachers can manage own leaves" ON leave_requests
    FOR ALL USING (teacher_id = auth.uid());

CREATE POLICY "Admin can manage leaves" ON leave_requests
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- RLS Policies for device_bindings
CREATE POLICY "Users can manage own device bindings" ON device_bindings
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admin can manage device bindings" ON device_bindings
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert default school and admin user (for development)
-- Note: Password should be hashed with bcrypt in production
-- This is for initial setup only
INSERT INTO schools (id, name, address) 
VALUES ('00000000-0000-0000-0000-000000000001', 'SIPGURU Demo School', 'Jl. Pendidikan No. 1')
ON CONFLICT (id) DO NOTHING;

-- Default admin user (password: admin123, bcrypt hashed)
-- In production, use proper password hashing
INSERT INTO users (id, email, nip, name, role, password_hash, school_id)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'admin@sipguru.com',
    'ADMIN001',
    'Admin SIPGURU',
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PZvO.S', -- admin123
    '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (email) DO NOTHING;