from src.config import settings
from src.database import get_db

from fastapi import APIRouter, HTTPException, Request, Depends
from src.deps import get_current_user, require_admin

router = APIRouter()
db = get_db()

@router.get("/stats/daily")
async def get_daily_stats(
    auth_user: dict = Depends(require_admin),
    date: str = None
):
    """Get daily attendance statistics"""
    from datetime import date as date_cls
    if date is None:
        date = date_cls.today().isoformat()

    stats = db.get_daily_attendance_stats(date)
    return {"date": date, "stats": stats}

@router.get("/stats/monthly")
async def get_monthly_stats(
    auth_user: dict = Depends(require_admin),
    month: int = None,
    year: int = None
):
    """Get monthly attendance statistics"""
    if month is None:
        month = 10
    if year is None:
        year = 2026
    
    stats = db.get_monthly_attendance_stats(year, month)
    return {"year": year, "month": month, "stats": stats}

@router.get("/teachers")
async def get_teachers(
    auth_user: dict = Depends(require_admin)
):
    """Get all teachers (admin only)"""
    teachers = db.get_all_teachers()
    return {"teachers": teachers}

@router.post("/teachers")
async def create_teacher(
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Create new teacher (admin only)"""
    # Validate unique email
    if db.is_email_taken(data["email"]):
        raise HTTPException(status_code=400, detail="Email already exists")
    # Validate unique NIP (required, not auto-generated)
    if not data.get("nip"):
        raise HTTPException(status_code=400, detail="NIP wajib diisi")
    if db.is_nip_taken(data["nip"]):
        raise HTTPException(status_code=400, detail="NIP already exists")
    
    # Hash password
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    password_hash = pwd_context.hash(data.get("password", "password123"))
    
    user_id = db.create_user(
        email=data["email"],
        name=data["name"],
        nip=data["nip"],
        role="teacher",
        phone=data.get("phone"),
        school_id=data.get("school_id"),
        password_hash=password_hash
    )
    
    return {"message": "Teacher created", "user_id": user_id}

@router.put("/teachers/{teacher_id}")
async def update_teacher(
    teacher_id: str,
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Update teacher (admin only, validates unique NIP/email, supports password update)"""
    # Check existence
    teacher = db.get_user(teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if teacher.get("role") != "teacher":
        raise HTTPException(status_code=400, detail="Not a teacher account")
    
    # Validate uniqueness excluding self
    if "email" in data and db.is_email_taken(data["email"], exclude_id=teacher_id):
        raise HTTPException(status_code=400, detail="Email already exists")
    if "nip" in data and db.is_nip_taken(data["nip"], exclude_id=teacher_id):
        raise HTTPException(status_code=400, detail="NIP already exists")
    
    # Separate password from other fields
    allowed_fields = ["email", "name", "nip", "phone", "school_id"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    # Handle password update
    if "password" in data and data["password"]:
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        update_data["password_hash"] = pwd_context.hash(data["password"])
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    success = db.update_user(teacher_id, **update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"message": "Teacher updated"}

@router.delete("/teachers/{teacher_id}")
async def delete_teacher(
    teacher_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Delete teacher (admin only)"""
    teacher = db.get_user(teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    success = db.delete_user(teacher_id)
    if not success:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"message": "Teacher deleted"}

@router.post("/teachers/reset-password")
async def reset_teacher_password(
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Reset teacher password (admin only)"""
    teacher_id = data.get("teacher_id")
    new_password = data.get("new_password")
    
    if not teacher_id or not new_password:
        raise HTTPException(status_code=400, detail="teacher_id dan new_password wajib diisi")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password minimal 6 karakter")
    
    teacher = db.get_user(teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    if teacher.get("role") != "teacher":
        raise HTTPException(status_code=400, detail="Bukan akun guru")
    
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    hashed_password = pwd_context.hash(new_password)
    
    success = db.update_user(teacher_id, password_hash=hashed_password)
    if not success:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    return {"message": "Password guru berhasil direset"}

@router.get("/rooms")
async def get_rooms(
    auth_user: dict = Depends(require_admin)
):
    """Get all rooms (admin only)"""
    rooms = db.get_all_rooms()
    return {"rooms": rooms}

@router.post("/rooms")
async def create_room(
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Create new room with geofence radius (admin only)"""
    room_id = db.create_room(
        school_id=data.get("school_id"),
        name=data["name"],
        room_code=data["room_code"],
        geofence_radius=data.get("geofence_radius", 150),
        geolocation=data.get("geolocation")
    )
    return {"message": "Room created", "room_id": room_id}

@router.get("/schedules")
async def get_schedules(
    auth_user: dict = Depends(require_admin)
):
    """Get all schedules (admin only)"""
    schedules = db.get_all_schedules()
    return {"schedules": schedules}

@router.get("/leaves")
async def get_leaves(
    auth_user: dict = Depends(require_admin),
    status: str = None
):
    """Get leave requests (admin only)"""
    leaves = db.get_all_leaves(status)
    return {"leaves": leaves}

@router.post("/leaves/approve")
async def approve_leave(
    leave_id: str,
    auth_user: dict = Depends(require_admin),
    approve: bool = True
):
    """Approve or reject leave request (admin only)"""
    db.update_leave_status(
        leave_id=leave_id,
        status="approved" if approve else "rejected",
        approved_by=auth_user["user_id"]
    )
    
    return {"message": f"Leave {'approved' if approve else 'rejected'}"}

# ============ Subject (Mata Pelajaran) CRUD ============
@router.get("/subjects")
async def get_subjects(
    auth_user: dict = Depends(require_admin),
    school_id: str = None
):
    """Get all subjects"""
    subjects = db.get_all_subjects(school_id)
    return {"subjects": subjects}

@router.get("/subjects/{subject_id}")
async def get_subject(
    subject_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Get subject by ID"""
    subject = db.get_subject(subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return {"subject": subject}

@router.post("/subjects")
async def create_subject(
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Create new subject"""
    if not data.get("jurusan_id"):
        raise HTTPException(status_code=400, detail="jurusan_id wajib diisi")
    jurusan = db.get_jurusan(data["jurusan_id"])
    if not jurusan:
        raise HTTPException(status_code=400, detail="Jurusan tidak ditemukan")
    # school_id fallback dari jurusan kalau tidak dikirim frontend
    school_id = data.get("school_id") or jurusan.get("school_id")
    subject_id = db.create_subject(
        name=data["name"],
        code=data["code"],
        description=data.get("description"),
        school_id=school_id,
        jurusan_id=data.get("jurusan_id")
    )
    return {"message": "Subject created", "subject_id": subject_id}

@router.put("/subjects/{subject_id}")
async def update_subject(
    subject_id: str,
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Update subject"""
    allowed_fields = ["name", "code", "description", "school_id"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    success = db.update_subject(subject_id, **update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    return {"message": "Subject updated"}

@router.delete("/subjects/{subject_id}")
async def delete_subject(
    subject_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Delete subject"""
    success = db.delete_subject(subject_id)
    if not success:
        raise HTTPException(status_code=404, detail="Subject not found")
    return {"message": "Subject deleted"}

# ============ Grade (Kelas) CRUD ============
@router.get("/grades")
async def get_grades(
    auth_user: dict = Depends(require_admin),
    school_id: str = None
):
    """Get all grades"""
    grades = db.get_all_grades(school_id)
    return {"grades": grades}

@router.get("/grades/{grade_id}")
async def get_grade(
    grade_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Get grade by ID"""
    grade = db.get_grade(grade_id)
    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    return {"grade": grade}

@router.post("/grades")
async def create_grade(
    data: dict,
    auth_user: dict = Depends(require_admin),
):
    """Create new grade"""
    if not data.get("jurusan_id"):
        raise HTTPException(status_code=400, detail="jurusan_id Required")
    grade_id = db.create_grade(
        school_id=data["school_id"],
        jurusan_id=data["jurusan_id"],
        name=data["name"],
        grade_level=data["grade_level"]
    )
    return {"message": "Grade created", "grade_id": grade_id}

@router.put("/grades/{grade_id}")
async def update_grade(
    grade_id: str,
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Update grade"""
    allowed_fields = ["name", "grade_level", "school_id"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    success = db.update_grade(grade_id, **update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Grade not found")
    
    return {"message": "Grade updated"}

@router.delete("/grades/{grade_id}")
async def delete_grade(
    grade_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Delete grade"""
    success = db.delete_grade(grade_id)
    if not success:
        raise HTTPException(status_code=404, detail="Grade not found")
    return {"message": "Grade deleted"}


# ============ Jurusan CRUD ============
@router.get("/jurusan")
async def get_jurusan(
    auth_user: dict = Depends(require_admin),
    school_id: str = None
):
    """Get all jurusan"""
    jurusan = db.get_all_jurusan(school_id)
    return {"jurusan": jurusan}

@router.get("/jurusan/{jurusan_id}")
async def get_jurusan_by_id(
    jurusan_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Get jurusan by ID"""
    jurusan = db.get_jurusan(jurusan_id)
    if not jurusan:
        raise HTTPException(status_code=404, detail="Jurusan not found")
    return {"jurusan": jurusan}

@router.post("/jurusan")
async def create_jurusan(
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Create new jurusan"""
    jurusan_id = db.create_jurusan(
        school_id=data["school_id"],
        name=data["name"],
        code=data["code"],
        description=data.get("description")
    )
    return {"message": "Jurusan created", "jurusan_id": jurusan_id}

@router.put("/jurusan/{jurusan_id}")
async def update_jurusan(
    jurusan_id: str,
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Update jurusan"""
    update_data = {k: v for k, v in data.items() if k in ["name", "code", "description", "school_id"]}
    success = db.update_jurusan(jurusan_id, **update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Jurusan not found")
    return {"message": "Jurusan updated"}

@router.delete("/jurusan/{jurusan_id}")
async def delete_jurusan(
    jurusan_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Delete jurusan"""
    success = db.delete_jurusan(jurusan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Jurusan not found")
    return {"message": "Jurusan deleted"}

# ============ Grade Schedule (Jadwal Kelas) CRUD ============
@router.get("/grade-schedules")
async def get_grade_schedules(
    auth_user: dict = Depends(require_admin),
    school_id: str = None,
    grade_id: str = None
):
    """Get all grade schedules"""
    if grade_id:
        schedules = db.get_grade_schedules_by_grade(grade_id)
    else:
        schedules = db.get_all_grade_schedules(school_id)
    return {"grade_schedules": schedules}

@router.get("/grade-schedules/teacher/{teacher_id}")
async def get_teacher_grade_schedules(
    teacher_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Get grade schedules for a teacher"""
    schedules = db.get_grade_schedules_by_teacher(teacher_id)
    return {"grade_schedules": schedules}

@router.get("/grade-schedules/{schedule_id}")
async def get_grade_schedule(
    schedule_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Get grade schedule by ID"""
    schedule = db.get_grade_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Grade schedule not found")
    return {"grade_schedule": schedule}

@router.post("/grade-schedules")
async def create_grade_schedule(
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Create new grade schedule (jadwal: jurusan via kelas + mapel + guru + room)"""
    for field in ("grade_id", "subject_id", "teacher_id"):
        if not data.get(field):
            raise HTTPException(status_code=400, detail=f"{field} wajib diisi")
    grade = db.get_grade(data["grade_id"])
    if not grade:
        raise HTTPException(status_code=400, detail="Kelas tidak ditemukan")
    subject = db.get_subject(data["subject_id"])
    if not subject:
        raise HTTPException(status_code=400, detail="Mapel tidak ditemukan")
    teacher = db.get_user(data["teacher_id"])
    if not teacher or teacher.get("role") != "teacher":
        raise HTTPException(status_code=400, detail="Guru tidak ditemukan")
    # Mapel dan kelas harus satu jurusan (kalau keduanya sudah terikat jurusan)
    if grade.get("jurusan_id") and subject.get("jurusan_id") and grade["jurusan_id"] != subject["jurusan_id"]:
        raise HTTPException(status_code=400, detail="Mapel dan kelas beda jurusan")
    if data.get("room_id") and not db.get_room(data["room_id"]):
        raise HTTPException(status_code=400, detail="Ruangan tidak ditemukan")
    schedule_id = db.create_grade_schedule(
        grade_id=data["grade_id"],
        subject_id=data["subject_id"],
        teacher_id=data["teacher_id"],
        day_of_week=data["day_of_week"],
        start_time=data["start_time"],
        end_time=data["end_time"],
        room_id=data.get("room_id")
    )
    return {"message": "Grade schedule created", "schedule_id": schedule_id}

@router.put("/grade-schedules/{schedule_id}")
async def update_grade_schedule(
    schedule_id: str,
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Update grade schedule"""
    allowed_fields = ["grade_id", "subject_id", "teacher_id", "day_of_week", "start_time", "end_time", "room_id", "is_active"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    success = db.update_grade_schedule(schedule_id, **update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Grade schedule not found")
    
    return {"message": "Grade schedule updated"}

@router.delete("/grade-schedules/{schedule_id}")
async def delete_grade_schedule(
    schedule_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Delete grade schedule"""
    success = db.delete_grade_schedule(schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Grade schedule not found")
    return {"message": "Grade schedule deleted"}

# ============ QR Token Management (bound to schedule) ============
@router.get("/qr-tokens")
async def list_qr_tokens(
    auth_user: dict = Depends(require_admin),
    schedule_id: str = None,
    active_only: bool = True
):
    """List QR tokens with schedule/grade/subject/teacher context"""
    if schedule_id:
        tokens = db.get_qr_tokens_by_schedule(schedule_id)
    else:
        tokens = db.get_all_qr_tokens(active_only=active_only)
    return {"tokens": tokens}

@router.post("/qr-tokens")
async def create_qr_for_schedule(
    data: dict,
    auth_user: dict = Depends(require_admin)
):
    """Create QR token bound to grade schedule (jurusan/kelas+mapel+guru+room)"""
    from src.auth import generate_hmac_token
    from src.config import settings as cfg
    from datetime import datetime, timedelta

    schedule_id = data.get("schedule_id")
    if not schedule_id:
        raise HTTPException(status_code=400, detail="schedule_id required")

    schedule = db.get_grade_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Grade schedule not found")

    room_id = data.get("room_id") or schedule.get("room_id")
    if not room_id:
        raise HTTPException(status_code=400, detail="room_id required (schedule has no room)")

    expiry = int(data.get("expiry_seconds") or cfg.QR_EXPIRY_SECONDS)
    token = generate_hmac_token(
        room_id=room_id,
        expiry_seconds=expiry,
        secret=cfg.JWT_SECRET,
        schedule_id=schedule_id,
        subject_id=schedule.get("subject_id"),
        teacher_id=schedule.get("teacher_id"),
        grade_id=schedule.get("grade_id"),
    )
    expires_at = (datetime.now() + timedelta(seconds=expiry)).isoformat()
    qr_id = db.create_qr_token(
        schedule_id=schedule_id,
        room_id=room_id,
        grade_id=schedule["grade_id"],
        subject_id=schedule["subject_id"],
        teacher_id=schedule["teacher_id"],
        token=token,
        expires_at=expires_at,
    )
    return {"message": "QR created", "qr_id": qr_id, "token": token, "expires_at": expires_at}

@router.delete("/qr-tokens/{qr_id}")
async def delete_qr_token(
    qr_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Deactivate a QR token"""
    success = db.deactivate_qr_token(qr_id)
    if not success:
        raise HTTPException(status_code=404, detail="QR token not found")
    return {"message": "QR token deactivated"}