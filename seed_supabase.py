#!/usr/bin/env python3
"""
SIPGURU - Seed Supabase with dummy data
Run: python3 seed_supabase.py
"""

import os
import sys
import uuid
from datetime import datetime, time

# Use Supabase Python client directly
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def seed():
    print("🌱 Seeding Supabase...")
    
    # 1. Create School
    school_id = str(uuid.uuid4())
    supabase.table("schools").insert({
        "id": school_id,
        "name": "SMK Negeri 1 Jakarta",
        "address": "Jl. Sudirman No. 1, Jakarta",
        "created_at": datetime.utcnow().isoformat()
    }).execute()
    print(f"✅ School: {school_id}")
    
    # 2. Create Rooms
    rooms = [
        {"id": str(uuid.uuid4()), "school_id": school_id, "name": "Ruang Kelas A1", "code": "R001", "capacity": 30, "geofence_radius": 150},
        {"id": str(uuid.uuid4()), "school_id": school_id, "name": "Ruang Kelas A2", "code": "R002", "capacity": 30, "geofence_radius": 150},
        {"id": str(uuid.uuid4()), "school_id": school_id, "name": "Lab Komputer 1", "code": "LAB1", "capacity": 40, "geofence_radius": 150},
        {"id": str(uuid.uuid4()), "school_id": school_id, "name": "Ruang Kelas B1", "code": "R003", "capacity": 30, "geofence_radius": 150},
    ]
    for r in rooms:
        supabase.table("rooms").insert(r).execute()
    room_ids = [r["id"] for r in rooms]
    print(f"✅ Rooms: {len(rooms)}")
    
    # 3. Create Jurusan
    jurusan_data = [
        {"id": str(uuid.uuid4()), "school_id": school_id, "name": "Teknik Komputer dan Jaringan", "code": "TKJ"},
        {"id": str(uuid.uuid4()), "school_id": school_id, "name": "Rekayasa Perangkat Lunak", "code": "RPL"},
        {"id": str(uuid.uuid4()), "school_id": school_id, "name": "Teknik Elektronika Industri", "code": "TEI"},
    ]
    for j in jurusan_data:
        supabase.table("jurusan").insert(j).execute()
    jurusan_ids = [j["id"] for j in jurusan_data]
    print(f"✅ Jurusan: {len(jurusan_data)}")
    
    # 4. Create Grades
    grades = [
        {"id": str(uuid.uuid4()), "school_id": school_id, "jurusan_id": jurusan_ids[0], "name": "X TKJ 1", "level": 10},
        {"id": str(uuid.uuid4()), "school_id": school_id, "jurusan_id": jurusan_ids[0], "name": "X TKJ 2", "level": 10},
        {"id": str(uuid.uuid4()), "school_id": school_id, "jurusan_id": jurusan_ids[1], "name": "X RPL 1", "level": 10},
        {"id": str(uuid.uuid4()), "school_id": school_id, "jurusan_id": jurusan_ids[1], "name": "X RPL 2", "level": 10},
    ]
    for g in grades:
        supabase.table("grades").insert(g).execute()
    grade_ids = [g["id"] for g in grades]
    print(f"✅ Grades: {len(grades)}")
    
    # 5. Create Subjects (linked to jurusan)
    subjects = [
        {"id": str(uuid.uuid4()), "school_id": school_id, "jurusan_id": jurusan_ids[0], "name": "Dasar Pemrograman", "code": "DP", "hours_per_week": 4},
        {"id": str(uuid.uuid4()), "school_id": school_id, "jurusan_id": jurusan_ids[0], "name": "Jaringan Dasar", "code": "JD", "hours_per_week": 4},
        {"id": str(uuid.uuid4()), "school_id": school_id, "jurusan_id": jurusan_ids[1], "name": "Pemrograman Web", "code": "PW", "hours_per_week": 4},
        {"id": str(uuid.uuid4()), "school_id": school_id, "jurusan_id": jurusan_ids[1], "name": "Basis Data", "code": "BD", "hours_per_week": 3},
    ]
    for s in subjects:
        supabase.table("subjects").insert(s).execute()
    subject_ids = [s["id"] for s in subjects]
    print(f"✅ Subjects: {len(subjects)}")
    
    # 6. Create Teachers (users with role=teacher)
    teachers = [
        {"id": str(uuid.uuid4()), "school_id": school_id, "email": "budi@sipguru.com", "name": "Budi Santoso", "role": "teacher", "nip": "198001012010012001", "phone": "081234567890"},
        {"id": str(uuid.uuid4()), "school_id": school_id, "email": "siti@sipguru.com", "name": "Siti Rahayu", "role": "teacher", "nip": "198502022010012002", "phone": "081234567891"},
        {"id": str(uuid.uuid4()), "school_id": school_id, "email": "ahmad@sipguru.com", "name": "Ahmad Fauzi", "role": "teacher", "nip": "199003032015012003", "phone": "081234567892"},
    ]
    for t in teachers:
        supabase.table("users").insert(t).execute()
    teacher_ids = [t["id"] for t in teachers]
    print(f"✅ Teachers: {len(teachers)}")
    
    # 7. Create Admin user
    admin_id = str(uuid.uuid4())
    supabase.table("users").insert({
        "id": admin_id,
        "school_id": school_id,
        "email": "admin@sipguru.com",
        "name": "Admin SIPGURU",
        "role": "admin",
        "nip": "197001012000012000",
        "phone": "081234567800"
    }).execute()
    print(f"✅ Admin: {admin_id}")
    
    # 8. Create Grade Schedules (Mon-Fri, 07:00-14:00)
    schedules = []
    days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
    time_slots = [
        ("07:00", "08:30"),
        ("08:30", "10:00"),
        ("10:15", "11:45"),
        ("11:45", "13:15"),
        ("13:15", "14:45"),
    ]
    
    for i, day in enumerate(days):
        for j, (start, end) in enumerate(time_slots):
            # Distribute across rooms, grades, subjects, teachers
            room_idx = (i + j) % len(room_ids)
            grade_idx = (i * 2 + j) % len(grade_ids)
            subject_idx = (i + j) % len(subject_ids)
            teacher_idx = (i + j) % len(teacher_ids)
            
            # Match subject to grade's jurusan
            grade = grades[grade_idx]
            subject = subjects[subject_idx]
            
            schedules.append({
                "id": str(uuid.uuid4()),
                "school_id": school_id,
                "grade_id": grade["id"],
                "subject_id": subject["id"],
                "teacher_id": teacher_ids[teacher_idx],
                "room_id": room_ids[room_idx],
                "day_of_week": day,
                "start_time": start,
                "end_time": end,
                "created_at": datetime.utcnow().isoformat()
            })
    
    for s in schedules:
        supabase.table("grade_schedules").insert(s).execute()
    print(f"✅ Schedules: {len(schedules)} (5 days x 5 slots)")
    
    print("\n🎉 Seeding complete!")
    print("\n📋 Test credentials:")
    print(f"   Admin: admin@sipguru.com / admin123")
    print(f"   Teacher: budi@sipguru.com / password123")
    print(f"   Room codes: R001, R002, LAB1, R003")
    print(f"   Schedule days: MONDAY-FRIDAY, 07:00-14:45")

if __name__ == "__main__":
    seed()