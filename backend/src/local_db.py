"""
Local SQLite database client for SIPGURU development/testing
Qtyakakan dengan SupabaseClient di production
"""

import sqlite3
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

DB_PATH = Path("/home/raksyz/sipguru/backend/src/app.db")

class LocalDBClient:
    """SQLite-based client for local development"""
    
    def __init__(self):
        self.db_path = DB_PATH
        self._init_db()
    
    def _init_db(self):
        """Initialize database with schema"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create tables matching Supabase schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                nip TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'teacher',
                phone TEXT,
                school_id TEXT,
                password TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schools (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                address TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                school_id TEXT NOT NULL,
                name TEXT NOT NULL,
                room_code TEXT UNIQUE NOT NULL,
                geofence_radius INTEGER DEFAULT 150,
                geolocation TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (school_id) REFERENCES schools(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schedules (
                id TEXT PRIMARY KEY,
                teacher_id TEXT NOT NULL,
                room_id TEXT NOT NULL,
                day_of_week TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (teacher_id) REFERENCES users(id),
                FOREIGN KEY (room_id) REFERENCES rooms(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_logs (
                id TEXT PRIMARY KEY,
                teacher_id TEXT NOT NULL,
                room_id TEXT NOT NULL,
                status TEXT NOT NULL,
                geolocation TEXT,
                qr_token TEXT,
                device_fingerprint TEXT,
                lateness_minutes INTEGER,
                admin_remarks TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (teacher_id) REFERENCES users(id),
                FOREIGN KEY (room_id) REFERENCES rooms(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS leave_requests (
                id TEXT PRIMARY KEY,
                teacher_id TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                approved_by TEXT,
                approved_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (teacher_id) REFERENCES users(id),
                FOREIGN KEY (approved_by) REFERENCES users(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS jurusan (
                id TEXT PRIMARY KEY,
                school_id TEXT NOT NULL,
                name TEXT NOT NULL,
                code TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (school_id) REFERENCES schools(id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS subjects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT UNIQUE NOT NULL,
                description TEXT,
                jurusan_id TEXT NOT NULL,
                school_id TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (jurusan_id) REFERENCES jurusan(id),
                FOREIGN KEY (school_id) REFERENCES schools(id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS grades (
                id TEXT PRIMARY KEY,
                jurusan_id TEXT NOT NULL,
                school_id TEXT NOT NULL,
                name TEXT NOT NULL,
                grade_level INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (jurusan_id) REFERENCES jurusan(id),
                FOREIGN KEY (school_id) REFERENCES schools(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS grade_schedules (
                id TEXT PRIMARY KEY,
                grade_id TEXT NOT NULL,
                subject_id TEXT NOT NULL,
                teacher_id TEXT NOT NULL,
                day_of_week TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                room_id TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (grade_id) REFERENCES grades(id),
                FOREIGN KEY (subject_id) REFERENCES subjects(id),
                FOREIGN KEY (teacher_id) REFERENCES users(id),
                FOREIGN KEY (room_id) REFERENCES rooms(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS device_bindings (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                device_fingerprint TEXT NOT NULL,
                device_name TEXT,
                last_used TEXT DEFAULT CURRENT_TIMESTAMP,
                is_active INTEGER DEFAULT 1,
                unbind_code_hash TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, device_fingerprint),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS qr_tokens (
                id TEXT PRIMARY KEY,
                schedule_id TEXT NOT NULL,
                room_id TEXT NOT NULL,
                grade_id TEXT NOT NULL,
                subject_id TEXT NOT NULL,
                teacher_id TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                expires_at TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (schedule_id) REFERENCES grade_schedules(id),
                FOREIGN KEY (room_id) REFERENCES rooms(id),
                FOREIGN KEY (grade_id) REFERENCES grades(id),
                FOREIGN KEY (subject_id) REFERENCES subjects(id),
                FOREIGN KEY (teacher_id) REFERENCES users(id)
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_nip ON users(nip)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_schedules_teacher ON schedules(teacher_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_schedules_room ON schedules(room_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_teacher ON attendance_logs(teacher_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_logs(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_leave_teacher ON leave_requests(teacher_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_device_fingerprint ON device_bindings(device_fingerprint)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_grades_school ON grades(school_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_grade_schedules_grade ON grade_schedules(grade_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_grade_schedules_subject ON grade_schedules(subject_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_grade_schedules_teacher ON grade_schedules(teacher_id)")
        
        conn.commit()
        conn.close()
    
    def _get_connection(self):
        """Get database connection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def _generate_id(self) -> str:
        """Generate simple UUID-like ID"""
        import uuid
        return str(uuid.uuid4())[:24]
    
    # User operations
    def verify_credentials(self, email: str, password: str) -> Optional[Dict]:
        """Verify email+password"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ? AND password = ?", (email, password))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                "id": row["id"],
                "email": row["email"],
                "name": row["name"],
                "role": row["role"],
                "nip": row["nip"]
            }
        return None
    
    def get_user(self, user_id: str) -> Optional[Dict]:
        """Get user by ID"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    
    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    
    def get_user_by_nip(self, nip: str) -> Optional[Dict]:
        """Get user by NIP"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE nip = ?", (nip,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    
    def create_user(self, email: str, name: str, nip: str, 
                   role: str = "teacher", phone: str = None,
                   school_id: str = None, password: str = "password123") -> str:
        """Create new user"""
        user_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (id, email, name, nip, role, phone, school_id, password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, email, name, nip, role, phone, school_id, password))
        conn.commit()
        conn.close()
        return user_id
    
    def update_user(self, user_id: str, **fields) -> bool:
        """Update user"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        set_clause = ", ".join([f"{k} = ?" for k in fields.keys()])
        values = list(fields.values()) + [user_id]
        
        cursor.execute(f"UPDATE users SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
        conn.commit()
        conn.close()
        return cursor.rowcount > 0
    
    def delete_user(self, user_id: str) -> bool:
        """Delete user"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()
        return cursor.rowcount > 0
    
    # School operations
    def get_all_schools(self) -> List[Dict]:
        """Get all schools"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM schools")
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    
    def create_school(self, name: str, address: str = None) -> str:
        """Create school"""
        school_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO schools (id, name, address) VALUES (?, ?, ?)", 
                      (school_id, name, address))
        conn.commit()
        conn.close()
        return school_id
    
    # Room operations
    def get_room(self, room_id: str) -> Optional[Dict]:
        """Get room by ID"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rooms WHERE id = ?", (room_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    
    def get_room_by_code(self, room_code: str) -> Optional[Dict]:
        """Get room by code"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rooms WHERE room_code = ?", (room_code,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    
    def get_all_rooms(self) -> List[Dict]:
        """Get all rooms"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rooms")
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    
    def create_room(self, school_id: str, name: str, room_code: str, geofence_radius: int = 150, geolocation: str = None) -> str:
        """Create room"""
        room_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO rooms (id, school_id, name, room_code, geofence_radius, geolocation) VALUES (?, ?, ?, ?, ?, ?)",
                      (room_id, school_id, name, room_code, geofence_radius, geolocation))
        conn.commit()
        conn.close()
        return room_id
    
    # Schedule operations
    def get_schedule_by_teacher_and_day(self, teacher_id: str, 
                                       day_of_week: str, room_id: str = None) -> Optional[Dict]:
        """Get teacher's schedule for specific day"""
        conn = self._get_connection()
        cursor = conn.cursor()
        query = "SELECT * FROM schedules WHERE teacher_id = ? AND day_of_week = ?"
        params = [teacher_id, day_of_week]
        if room_id:
            query += " AND room_id = ?"
            params.append(room_id)
        cursor.execute(query, params)
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    
    def get_schedules_by_teacher_and_day(self, teacher_id: str, 
                                        day_of_week: str) -> List[Dict]:
        """Get all schedules for teacher on specific day"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM schedules WHERE teacher_id = ? AND day_of_week = ?",
                      (teacher_id, day_of_week))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    
    def get_all_schedules(self) -> List[Dict]:
        """Get all schedules"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM schedules")
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    
    def create_schedule(self, teacher_id: str, room_id: str,
                       day_of_week: str, start_time: str, end_time: str) -> str:
        """Create schedule"""
        schedule_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO schedules (id, teacher_id, room_id, day_of_week, start_time, end_time)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (schedule_id, teacher_id, room_id, day_of_week, start_time, end_time))
        conn.commit()
        conn.close()
        return schedule_id
    
    def update_schedule(self, schedule_id: str, **fields) -> bool:
        """Update schedule"""
        conn = self._get_connection()
        cursor = conn.cursor()
        set_clause = ", ".join([f"{k} = ?" for k in fields.keys()])
        values = list(fields.values()) + [schedule_id]
        cursor.execute(f"UPDATE schedules SET {set_clause} WHERE id = ?", values)
        conn.commit()
        conn.close()
        return cursor.rowcount > 0
    
    def delete_schedule(self, schedule_id: str) -> bool:
        """Delete schedule"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
        conn.commit()
        conn.close()
        return cursor.rowcount > 0
    
    # Attendance operations
    def create_attendance_log(self, teacher_id: str, room_id: str,
                             status: str, geolocation: str = None,
                             qr_token: str = None, device_fingerprint: str = None,
                             lateness_minutes: int = None,
                             admin_remarks: str = None) -> str:
        """Create attendance log"""
        log_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO attendance_logs 
            (id, teacher_id, room_id, status, geolocation, qr_token, device_fingerprint, lateness_minutes, admin_remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (log_id, teacher_id, room_id, status, geolocation, qr_token, device_fingerprint, 
              lateness_minutes, admin_remarks))
        conn.commit()
        conn.close()
        return log_id
    
    def get_attendance_by_teacher_and_month(self, teacher_id: str,
                                           year: int, month: int) -> List[Dict]:
        """Get attendance logs for teacher in specific month"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM attendance_logs 
            WHERE teacher_id = ? 
            AND strftime('%Y-%m', created_at) = ?
            ORDER BY created_at DESC
        """, (teacher_id, f"{year}-{month:02d}"))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    
    def get_daily_attendance_stats(self, date_str: str) -> Dict:
        """Get attendance statistics for specific date"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT status, COUNT(*) as count 
            FROM attendance_logs 
            WHERE strftime('%Y-%m-%d', created_at) = ?
            GROUP BY status
        """, (date_str,))
        rows = cursor.fetchall()
        conn.close()
        
        stats = {
            "total": 0,
            "on_time": 0,
            "late": 0,
            "absent": 0,
            "deferred": 0,
            "approved": 0
        }
        
        for row in rows:
            stats["total"] += row["count"]
            if row["status"] in stats:
                stats[row["status"]] = row["count"]
        
        return stats
    
    def get_monthly_attendance_stats(self, year: int, month: int) -> Dict:
        """Get attendance statistics for specific month"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT status, COUNT(*) as count 
            FROM attendance_logs 
            WHERE strftime('%Y-%m', created_at) = ?
            GROUP BY status
        """, (f"{year}-{month:02d}",))
        rows = cursor.fetchall()
        conn.close()
        
        stats = {
            "total": 0,
            "on_time": 0,
            "late": 0,
            "absent": 0,
            "deferred": 0,
            "approved": 0
        }
        
        for row in rows:
            stats["total"] += row["count"]
            if row["status"] in stats:
                stats[row["status"]] = row["count"]
        
        return stats
    
    # Leave operations
    def create_leave_request(self, teacher_id: str, start_date: str,
                            end_date: str, reason: str, schedule_id: str = None) -> str:
        """Create leave request"""
        leave_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO leave_requests (id, teacher_id, start_date, end_date, reason, status, schedule_id)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)
        """, (leave_id, teacher_id, start_date, end_date, reason, schedule_id))
        conn.commit()
        conn.close()
        return leave_id
    
    def get_leaves_by_teacher(self, teacher_id: str, status: str = None) -> List[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        query = "SELECT lr.*, g.name as grade_name, s.name as subject_name, gs.day_of_week, gs.start_time, gs.end_time FROM leave_requests lr LEFT JOIN grade_schedules gs ON lr.schedule_id = gs.id LEFT JOIN grades g ON gs.grade_id = g.id LEFT JOIN subjects s ON gs.subject_id = s.id WHERE lr.teacher_id = ?"
        params = [teacher_id]
        if status:
            query += " AND lr.status = ?"
            params.append(status)
        query += " ORDER BY lr.created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    
    def get_all_leaves(self, status: str = None) -> List[Dict]:
            """Get all leave requests (admin) with teacher name"""
            conn = self._get_connection()
            cursor = conn.cursor()
            query = """
                SELECT lr.*, u.name as teacher_name, u.nip as teacher_nip, u.email as teacher_email
                FROM leave_requests lr
                LEFT JOIN users u ON lr.teacher_id = u.id
            """
            params: list = []
            if status:
                query += " WHERE lr.status = ?"
                params.append(status)
            query += " ORDER BY lr.created_at DESC"
            cursor.execute(query, params)
            rows = cursor.fetchall()
            conn.close()
            return [dict(r) for r in rows]

    def get_all_teachers(self) -> List[Dict]:
        """Get all teachers (users with role=teacher)"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, email, name, nip, role, phone, school_id
            FROM users WHERE role = 'teacher'
            ORDER BY name
        """)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def update_leave_status(self, leave_id: str, status: str,
                           approved_by: str = None) -> bool:
        """Update leave request status"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        if approved_by:
            cursor.execute("""
                UPDATE leave_requests 
                SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (status, approved_by, leave_id))
        else:
            cursor.execute("""
                UPDATE leave_requests 
                SET status = ?, approved_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (status, leave_id))
        
        conn.commit()
        conn.close()
        return cursor.rowcount > 0
    
    # Subject operations (Mata Pelajaran)
    def get_subject(self, subject_id: str) -> Optional[Dict]:
        """Get subject by ID"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    
    def get_subject_by_code(self, code: str) -> Optional[Dict]:
        """Get subject by code"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM subjects WHERE code = ?", (code,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    
    def get_all_subjects(self, school_id: str = None) -> List[Dict]:
            """Get all subjects, optionally filtered by school"""
            conn = self._get_connection()
            cursor = conn.cursor()
            if school_id:
                cursor.execute("""
                    SELECT s.*, j.name as jurusan_name
                    FROM subjects s
                    LEFT JOIN jurusan j ON s.jurusan_id = j.id
                    WHERE s.school_id = ?
                    ORDER BY s.name
                """, (school_id,))
            else:
                cursor.execute("""
                    SELECT s.*, j.name as jurusan_name
                    FROM subjects s
                    LEFT JOIN jurusan j ON s.jurusan_id = j.id
                    ORDER BY s.name
                """)
            rows = cursor.fetchall()
            conn.close()
            return [dict(r) for r in rows]
    
    def create_subject(self, name: str, code: str, description: str = None,
                      school_id: str = None, jurusan_id: str = None) -> str:
        """Create subject"""
        subject_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO subjects (id, name, code, description, school_id, jurusan_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (subject_id, name, code, description, school_id, jurusan_id))
        conn.commit()
        conn.close()
        return subject_id
    
    def update_subject(self, subject_id: str, **fields) -> bool:
        """Update subject"""
        conn = self._get_connection()
        cursor = conn.cursor()
        set_clause = ", ".join([f"{k} = ?" for k in fields.keys()])
        values = list(fields.values()) + [subject_id]
        cursor.execute(f"UPDATE subjects SET {set_clause} WHERE id = ?", values)
        conn.commit()
        conn.close()
        return cursor.rowcount > 0
    
    def delete_subject(self, subject_id: str) -> bool:
        """Delete subject"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
        conn.commit()
        conn.close()
        return cursor.rowcount > 0
    
    # Grade operations (Kelas)
    def get_grade(self, grade_id: str) -> Optional[Dict]:
        """Get grade by ID"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grades WHERE id = ?", (grade_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    
    def get_all_grades(self, school_id: str = None) -> List[Dict]:
        """Get all grades, optionally filtered by school"""
        conn = self._get_connection()
        cursor = conn.cursor()
        if school_id:
            cursor.execute("""
                SELECT g.*, j.name as jurusan_name, j.code as jurusan_code
                FROM grades g
                LEFT JOIN jurusan j ON g.jurusan_id = j.id
                WHERE g.school_id = ?
                ORDER BY g.grade_level
            """, (school_id,))
        else:
            cursor.execute("""
                SELECT g.*, j.name as jurusan_name, j.code as jurusan_code
                FROM grades g
                LEFT JOIN jurusan j ON g.jurusan_id = j.id
                ORDER BY g.grade_level
            """)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    
    def create_grade(self, school_id: str, jurusan_id: str, name: str, grade_level: int) -> str:
            """Create grade (kelas)"""
            grade_id = self._generate_id()
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO grades (id, school_id, jurusan_id, name, grade_level)
                VALUES (?, ?, ?, ?, ?)
            """, (grade_id, school_id, jurusan_id, name, grade_level))
            conn.commit()
            conn.close()
            return grade_id
    
    def update_grade(self, grade_id: str, **fields) -> bool:
        """Update grade"""
        conn = self._get_connection()
        cursor = conn.cursor()
        set_clause = ", ".join([f"{k} = ?" for k in fields.keys()])
        values = list(fields.values()) + [grade_id]
        cursor.execute(f"UPDATE grades SET {set_clause} WHERE id = ?", values)
        conn.commit()
        conn.close()
        return cursor.rowcount > 0
    
    def delete_grade(self, grade_id: str) -> bool:
        """Delete grade"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM grades WHERE id = ?", (grade_id,))
        conn.commit()
        conn.close()
        return cursor.rowcount > 0


    # Grade schedule operations (Jadwal Kelas)

    # Jurusan operations
    def get_jurusan(self, jurusan_id: str) -> Optional[Dict]:
        """Get jurusan by ID"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM jurusan WHERE id = ?", (jurusan_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_all_jurusan(self, school_id: str = None) -> List[Dict]:
        """Get all jurusan"""
        conn = self._get_connection()
        cursor = conn.cursor()
        if school_id:
            cursor.execute("SELECT * FROM jurusan WHERE school_id = ? ORDER BY name", (school_id,))
        else:
            cursor.execute("SELECT * FROM jurusan ORDER BY name")
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def create_jurusan(self, school_id: str, name: str, code: str, description: str = None) -> str:
        """Create jurusan"""
        jurusan_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO jurusan (id, school_id, name, code, description)
            VALUES (?, ?, ?, ?, ?)
        """, (jurusan_id, school_id, name, code, description))
        conn.commit()
        conn.close()
        return jurusan_id

    def update_jurusan(self, jurusan_id: str, **fields) -> bool:
        """Update jurusan"""
        conn = self._get_connection()
        cursor = conn.cursor()
        set_clause = ", ".join([f"{k} = ?" for k in fields.keys()])
        values = list(fields.values()) + [jurusan_id]
        cursor.execute(f"UPDATE jurusan SET {set_clause} WHERE id = ?", values)
        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    def delete_jurusan(self, jurusan_id: str) -> bool:
        """Delete jurusan"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM jurusan WHERE id = ?", (jurusan_id,))
        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    # Device binding operations
    def get_device_binding(self, user_id: str, device_fingerprint: str) -> Optional[Dict]:
        """Get device binding record"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM device_bindings 
            WHERE user_id = ? AND device_fingerprint = ? AND is_active = 1
        """, (user_id, device_fingerprint))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def create_device_binding(self, user_id: str, device_fingerprint: str) -> str:
        """Create or update device binding"""
        conn = self._get_connection()
        cursor = conn.cursor()
        # Check if binding exists
        cursor.execute("""
            SELECT id FROM device_bindings 
            WHERE user_id = ? AND device_fingerprint = ?
        """, (user_id, device_fingerprint))
        row = cursor.fetchone()
        
        if row:
            # Update existing
            cursor.execute("""
                UPDATE device_bindings 
                SET last_used = CURRENT_TIMESTAMP, is_active = 1, unbind_code_hash = NULL
                WHERE id = ?
            """, (row["id"],))
        else:
            # Create new
            binding_id = self._generate_id()
            cursor.execute("""
                INSERT INTO device_bindings (id, user_id, device_fingerprint, device_name, is_active)
                VALUES (?, ?, ?, ?, 1)
            """, (binding_id, user_id, device_fingerprint, "Web Browser"))
        conn.commit()
        conn.close()
        return binding_id if not row else row["id"]

    def get_pending_unbind_binding(self, user_id: str) -> Optional[Dict]:
        """Get pending unbind device binding"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM device_bindings 
            WHERE user_id = ? AND unbind_code_hash IS NOT NULL AND is_active = 1
        """, (user_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def update_unbind_request(self, binding_id: str, unbind_code_hash: str) -> bool:
        """Update device binding with unbind code hash"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE device_bindings 
            SET unbind_code_hash = ? 
            WHERE id = ?
        """, (unbind_code_hash, binding_id))
        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    def unlink_device(self, binding_id: str) -> bool:
        """Unlink device (set is_active to False)"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE device_bindings 
            SET is_active = 0 
            WHERE id = ?
        """, (binding_id,))
        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    def get_grade_schedule(self, schedule_id: str) -> Optional[Dict]:
        """Get grade schedule by ID"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM grade_schedules WHERE id = ?", (schedule_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    # Grade schedule operations
    def get_all_grade_schedules(self, school_id: str = None) -> List[Dict]:
        """Get all grade schedules"""
        conn = self._get_connection()
        cursor = conn.cursor()
        if school_id:
            cursor.execute("""
                SELECT gs.*, g.name as grade_name, j.name as jurusan_name, s.name as subject_name, u.name as teacher_name, r.name as room_name
                FROM grade_schedules gs
                JOIN grades g ON gs.grade_id = g.id
                LEFT JOIN jurusan j ON g.jurusan_id = j.id
                JOIN subjects s ON gs.subject_id = s.id
                JOIN users u ON gs.teacher_id = u.id
                LEFT JOIN rooms r ON gs.room_id = r.id
                WHERE g.school_id = ? AND gs.is_active = 1
                ORDER BY g.grade_level, gs.day_of_week, gs.start_time
            """, (school_id,))
        else:
            cursor.execute("""
                SELECT gs.*, g.name as grade_name, j.name as jurusan_name, s.name as subject_name, u.name as teacher_name, r.name as room_name
                FROM grade_schedules gs
                JOIN grades g ON gs.grade_id = g.id
                LEFT JOIN jurusan j ON g.jurusan_id = j.id
                JOIN subjects s ON gs.subject_id = s.id
                JOIN users u ON gs.teacher_id = u.id
                LEFT JOIN rooms r ON gs.room_id = r.id
                WHERE gs.is_active = 1
                ORDER BY g.grade_level, gs.day_of_week, gs.start_time
            """)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_grade_schedules_by_grade(self, grade_id: str) -> List[Dict]:
        """Get grade schedules for a specific grade"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT gs.*, g.name as grade_name, s.name as subject_name, u.name as teacher_name, r.name as room_name
            FROM grade_schedules gs
            JOIN grades g ON gs.grade_id = g.id
            JOIN subjects s ON gs.subject_id = s.id
            JOIN users u ON gs.teacher_id = u.id
            LEFT JOIN rooms r ON gs.room_id = r.id
            WHERE gs.grade_id = ? AND gs.is_active = 1
            ORDER BY gs.day_of_week, gs.start_time
        """, (grade_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_grade_schedules_by_teacher(self, teacher_id: str) -> List[Dict]:
        """Get grade schedules for a specific teacher"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT gs.*, g.name as grade_name, s.name as subject_name, u.name as teacher_name, r.name as room_name
            FROM grade_schedules gs
            JOIN grades g ON gs.grade_id = g.id
            JOIN subjects s ON gs.subject_id = s.id
            JOIN users u ON gs.teacher_id = u.id
            LEFT JOIN rooms r ON gs.room_id = r.id
            WHERE gs.teacher_id = ? AND gs.is_active = 1
            ORDER BY gs.day_of_week, gs.start_time
        """, (teacher_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def create_grade_schedule(self, grade_id: str, subject_id: str, teacher_id: str,
                              day_of_week: str, start_time: str, end_time: str,
                              room_id: str = None) -> str:
        """Create grade schedule"""
        schedule_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO grade_schedules (id, grade_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (schedule_id, grade_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_id))
        conn.commit()
        conn.close()
        return schedule_id

    def update_grade_schedule(self, schedule_id: str, **fields) -> bool:
        """Update grade schedule"""
        allowed = {"grade_id", "subject_id", "teacher_id", "day_of_week", "start_time", "end_time", "room_id", "is_active"}
        fields = {k: v for k, v in fields.items() if k in allowed}
        if not fields:
            return False
        conn = self._get_connection()
        cursor = conn.cursor()
        set_clause = ", ".join([f"{k} = ?" for k in fields.keys()])
        values = list(fields.values()) + [schedule_id]
        cursor.execute(f"UPDATE grade_schedules SET {set_clause} WHERE id = ?", values)
        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    def delete_grade_schedule(self, schedule_id: str) -> bool:
        """Delete grade schedule"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM grade_schedules WHERE id = ?", (schedule_id,))
        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    # QR Token operations
    def create_qr_token(self, schedule_id: str, room_id: str, grade_id: str,
                        subject_id: str, teacher_id: str, token: str, expires_at: str) -> str:
        """Create QR token record"""
        qr_id = self._generate_id()
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO qr_tokens (id, schedule_id, room_id, grade_id, subject_id, teacher_id, token, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (qr_id, schedule_id, room_id, grade_id, subject_id, teacher_id, token, expires_at))
        conn.commit()
        conn.close()
        return qr_id

    def get_qr_token(self, token: str) -> Optional[Dict]:
        """Get QR token by token string"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM qr_tokens WHERE token = ? AND is_active = 1", (token,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_all_qr_tokens(self, active_only: bool = True) -> List[Dict]:
        """Get all QR tokens"""
        conn = self._get_connection()
        cursor = conn.cursor()
        if active_only:
            cursor.execute("""
                SELECT qt.*, g.name as grade_name, s.name as subject_name, u.name as teacher_name, r.name as room_name
                FROM qr_tokens qt
                JOIN grades g ON qt.grade_id = g.id
                JOIN subjects s ON qt.subject_id = s.id
                JOIN users u ON qt.teacher_id = u.id
                JOIN rooms r ON qt.room_id = r.id
                WHERE qt.is_active = 1 AND qt.expires_at > datetime('now')
                ORDER BY qt.created_at DESC
            """)
        else:
            cursor.execute("""
                SELECT qt.*, g.name as grade_name, s.name as subject_name, u.name as teacher_name, r.name as room_name
                FROM qr_tokens qt
                JOIN grades g ON qt.grade_id = g.id
                JOIN subjects s ON qt.subject_id = s.id
                JOIN users u ON qt.teacher_id = u.id
                JOIN rooms r ON qt.room_id = r.id
                ORDER BY qt.created_at DESC
            """)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_qr_tokens_by_schedule(self, schedule_id: str) -> List[Dict]:
        """Get QR tokens for a specific schedule"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT qt.*, g.name as grade_name, s.name as subject_name, u.name as teacher_name, r.name as room_name
            FROM qr_tokens qt
            JOIN grades g ON qt.grade_id = g.id
            JOIN subjects s ON qt.subject_id = s.id
            JOIN users u ON qt.teacher_id = u.id
            JOIN rooms r ON qt.room_id = r.id
            WHERE qt.schedule_id = ?
            ORDER BY qt.created_at DESC
        """, (schedule_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def deactivate_qr_token(self, qr_id: str) -> bool:
        """Deactivate QR token"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE qr_tokens SET is_active = 0 WHERE id = ?", (qr_id,))
        conn.commit()
        conn.close()
        return cursor.rowcount > 0
    
