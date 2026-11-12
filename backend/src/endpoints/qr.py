from src.config import settings
from src.database import get_db
from src.auth import generate_hmac_token
from src.deps import get_current_user, require_admin

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

router = APIRouter()
db = get_db()


class GenerateQRRequest(BaseModel):
    schedule_id: str  # Required: schedule already contains room_id, grade_id, subject_id, teacher_id


class GenerateBoundQRRequest(BaseModel):
    schedule_id: str  # bound to specific grade schedule
    room_id: str


class ValidateQRRequest(BaseModel):
    token: str
    room_id: str


@router.post("/generate")
async def generate_qr_token(
    data: GenerateQRRequest,
    auth_user: dict = Depends(require_admin),
):
    """Generate HMAC-signed QR token for a specific grade schedule (admin only) - schedule_id ties jurusan/kelas/mapel/guru"""
    schedule = db.get_grade_schedule(data.schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Grade schedule not found")
    
    # Get room_id from schedule (required for QR validation)
    room_id = schedule.get("room_id")
    if not room_id:
        raise HTTPException(status_code=400, detail="Schedule must have a room assigned")
    
    room = db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Get jurusan info from grade
    grade = db.get_grade(schedule["grade_id"])
    jurusan_name = None
    if grade and grade.get("jurusan_id"):
        jurusan = db.get_jurusan(grade["jurusan_id"])
        jurusan_name = jurusan.get("name") if jurusan else None
    
    # Generate token with schedule data embedded
    token = generate_hmac_token(
        room_id=room_id,
        schedule_id=data.schedule_id,
        subject_id=schedule.get("subject_id"),
        teacher_id=schedule.get("teacher_id"),
        grade_id=schedule.get("grade_id"),
        expiry_seconds=settings.QR_EXPIRY_SECONDS,
        secret=settings.JWT_SECRET
    )
    
    # Store in qr_tokens table for strict validation
    from datetime import datetime, timedelta
    expires_at = (datetime.now() + timedelta(seconds=settings.QR_EXPIRY_SECONDS)).isoformat()
    qr_id = db.create_qr_token(
        schedule_id=data.schedule_id,
        room_id=room_id,
        grade_id=schedule["grade_id"],
        subject_id=schedule["subject_id"],
        teacher_id=schedule["teacher_id"],
        token=token,
        expires_at=expires_at
    )
    
    return {
        "message": "QR token generated and bound to schedule",
        "qr_id": qr_id,
        "token": token,
        "schedule_id": data.schedule_id,
        "room_id": room_id,
        "grade_id": schedule["grade_id"],
        "subject_id": schedule["subject_id"],
        "teacher_id": schedule["teacher_id"],
        "grade_name": grade.get("name") if grade else None,
        "jurusan_name": jurusan_name,
        "subject_name": db.get_subject(schedule["subject_id"]).get("name") if db.get_subject(schedule["subject_id"]) else None,
        "teacher_name": db.get_user(schedule["teacher_id"]).get("name") if db.get_user(schedule["teacher_id"]) else None,
        "room_name": room.get("name"),
        "expires_at": expires_at,
        "expires_in": settings.QR_EXPIRY_SECONDS
    }


@router.post("/generate/bound")
async def generate_bound_qr_token(
    data: GenerateBoundQRRequest,
    auth_user: dict = Depends(require_admin),
):
    """Generate QR token bound to a specific grade schedule (jurusan/kelas+mapel+guru+room)"""
    schedule = db.get_grade_schedule(data.schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Grade schedule not found")
    
    # Verify schedule belongs to room
    if schedule.get("room_id") and schedule["room_id"] != data.room_id:
        raise HTTPException(status_code=400, detail="Schedule room doesn't match")
    
    # Generate token with schedule data embedded
    token = generate_hmac_token(
        room_id=data.room_id,
        schedule_id=data.schedule_id,
        subject_id=schedule.get("subject_id"),
        teacher_id=schedule.get("teacher_id"),
        grade_id=schedule.get("grade_id"),
        expiry_seconds=settings.QR_EXPIRY_SECONDS,
        secret=settings.JWT_SECRET
    )
    
    # Store in qr_tokens table for strict validation
    from datetime import datetime, timedelta
    expires_at = (datetime.now() + timedelta(seconds=settings.QR_EXPIRY_SECONDS)).isoformat()
    qr_id = db.create_qr_token(
        schedule_id=data.schedule_id,
        room_id=data.room_id,
        grade_id=schedule["grade_id"],
        subject_id=schedule["subject_id"],
        teacher_id=schedule["teacher_id"],
        token=token,
        expires_at=expires_at
    )
    
    # Get joined names
    grade = db.get_grade(schedule["grade_id"])
    subject = db.get_subject(schedule["subject_id"])
    teacher = db.get_user(schedule["teacher_id"])
    room = db.get_room(data.room_id)
    
    return {
        "message": "QR token generated and bound to schedule",
        "qr_id": qr_id,
        "token": token,
        "schedule_id": data.schedule_id,
        "room_id": data.room_id,
        "grade_id": schedule["grade_id"],
        "subject_id": schedule["subject_id"],
        "teacher_id": schedule["teacher_id"],
        "grade_name": grade.get("name") if grade else None,
        "subject_name": subject.get("name") if subject else None,
        "teacher_name": teacher.get("name") if teacher else None,
        "room_name": room.get("name") if room else None,
        "expires_at": expires_at,
        "expires_in": settings.QR_EXPIRY_SECONDS
    }


@router.post("/validate")
async def validate_qr_token(
    data: ValidateQRRequest,
    auth_user: dict = Depends(get_current_user),
):
    """Validate bound QR token with schedule matching"""
    from src.auth import verify_hmac_token
    
    token_data = verify_hmac_token(data.token, settings.JWT_SECRET)
    
    if not token_data:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    
    if token_data.get("room_id") != data.room_id:
        raise HTTPException(status_code=400, detail="Token does not match room")
    
    # Check if token is bound to a schedule in qr_tokens
    qr_record = db.get_qr_token(data.token)
    
    if qr_record:
        # Validate teacher matches
        if qr_record["teacher_id"] != auth_user.get("user_id"):
            return {
                "valid": False,
                "error": "teacher_mismatch",
                "message": "QR ini bukan untuk guru ini"
            }
        # Validate schedule and room match
        return {
            "valid": True,
            "qr_id": qr_record["id"],
            "schedule_id": qr_record["schedule_id"],
            "room_id": data.room_id,
            "teacher_id": qr_record["teacher_id"],
            "timestamp": token_data.get("timestamp"),
            "nonce": token_data.get("nonce")
        }
    
    # Legacy: non-bound token (just room-based)
    return {
        "valid": True,
        "room_id": data.room_id,
        "timestamp": token_data.get("timestamp"),
        "nonce": token_data.get("nonce")
    }


@router.get("/info/{room_code}")
async def get_room_info(room_code: str):
    """Get room info by code (for IoT devices)"""
    room = db.get_room_by_code(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    return {
        "room_id": room["id"],
        "room_code": room["room_code"],
        "name": room["name"],
        "school_id": room["school_id"]
    }


@router.get("/list")
async def list_qr_tokens(
    auth_user: dict = Depends(require_admin),
    schedule_id: str = None,
    active_only: bool = True
):
    """List QR tokens (admin only)"""
    if schedule_id:
        tokens = db.get_qr_tokens_by_schedule(schedule_id)
    else:
        tokens = db.get_all_qr_tokens(active_only=active_only)
    return {"tokens": tokens}


@router.delete("/tokens/{qr_id}")
async def delete_qr_token(
    qr_id: str,
    auth_user: dict = Depends(require_admin)
):
    """Deactivate a QR token (admin only)"""
    success = db.deactivate_qr_token(qr_id)
    if not success:
        raise HTTPException(status_code=404, detail="QR token not found")
    return {"message": "QR token deactivated"}


@router.get("/room-state/{room_code}")
async def get_room_state(room_code: str):
    """Get current room state and schedule for ESP32 auto-QR system"""
    from datetime import datetime, timedelta
    
    room = db.get_room_by_code(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room_id = room["id"]
    # Convert UTC to WIB (UTC+7) for schedule comparison
    from datetime import timezone, timedelta
    wib_offset = timezone(timedelta(hours=7))
    now_wib = datetime.now(wib_offset)
    current_time = now_wib.strftime("%H:%M")
    # FIX: Use capitalized day name for DB query (e.g., "Thursday")
    day_of_week_en = now_wib.strftime("%A").capitalize()
    # Return Indonesian day name for display
    day_name_map = {
        "Monday": "Senin", "Tuesday": "Selasa", "Wednesday": "Rabu",
        "Thursday": "Kamis", "Friday": "Jumat", "Saturday": "Sabtu", "Sunday": "Minggu"
    }
    day_of_week = day_name_map.get(day_of_week_en, day_of_week_en)
    
    # FIX: Get today's grade_schedules for this room (not old schedules table)
    all_schedules = db.get_all_grade_schedules()
    schedules = [s for s in all_schedules if s.get("room_id") == room_id and s.get("day_of_week") == day_of_week_en]
    
    current_schedule = None
    next_schedule = None
    state = "IDLE"
    
    for schedule in schedules:
        start_time = schedule.get("start_time", "00:00")
        end_time = schedule.get("end_time", "00:00")
        
        # Check if current class is active (within class time + 10 min grace)
        start_dt = datetime.strptime(start_time, "%H:%M").replace(tzinfo=wib_offset)
        end_dt = datetime.strptime(end_time, "%H:%M").replace(tzinfo=wib_offset)
        grace_end = end_dt + timedelta(minutes=10)
        
        if start_dt <= now_wib.replace(second=0, microsecond=0) <= grace_end:
            current_schedule = schedule
            # Check if entry has been scanned
            qr_tokens = db.get_qr_tokens_by_schedule(schedule["id"])
            entry_scanned = any(t.get("token_type") == "entry" and t.get("scanned_at") for t in qr_tokens)
            exit_scanned = any(t.get("token_type") == "exit" and t.get("scanned_at") for t in qr_tokens)
            
            if exit_scanned:
                state = "CLASS_ENDED"
            elif entry_scanned:
                state = "CLASS_ACTIVE"
            elif now_wib > end_dt + timedelta(minutes=10):
                state = "TEACHER_ABSENT"
            else:
                state = "CLASS_ACTIVE"
            break
        
        # Check if this is the next class (within 15 minutes)
        if start_dt > now_wib.replace(second=0, microsecond=0):
            minutes_until = (start_dt - now_wib).total_seconds() / 60
            if minutes_until <= 15 and next_schedule is None:
                next_schedule = schedule
                if minutes_until <= 15:
                    state = "PRE_CLASS" if state == "IDLE" else state
    
    return {
        "room_id": room_id,
        "room_code": room_code,
        "room_name": room.get("name"),
        "current_time": current_time,
        "day_of_week": day_of_week,
        "state": state,
        "current_schedule": current_schedule,
        "next_schedule": next_schedule
    }


@router.post("/auto-token/{schedule_id}")
async def generate_auto_qr_token(
    schedule_id: str,
    token_type: str = "entry"  # "entry" or "exit"
):
    """Auto-generate QR token for current/next schedule (for ESP32)"""
    from datetime import datetime, timedelta
    
    schedule = db.get_grade_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    room_id = schedule.get("room_id")
    if not room_id:
        raise HTTPException(status_code=400, detail="Schedule must have a room assigned")
    
    room = db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Generate token
    token = generate_hmac_token(
        room_id=room_id,
        schedule_id=schedule_id,
        subject_id=schedule.get("subject_id"),
        teacher_id=schedule.get("teacher_id"),
        grade_id=schedule.get("grade_id"),
        expiry_seconds=settings.QR_EXPIRY_SECONDS,
        secret=settings.JWT_SECRET
    )
    
    # Store in qr_tokens table
    from datetime import datetime, timedelta
    expires_at = (datetime.now() + timedelta(seconds=settings.QR_EXPIRY_SECONDS)).isoformat()
    qr_id = db.create_qr_token(
        schedule_id=schedule_id,
        room_id=room_id,
        grade_id=schedule["grade_id"],
        subject_id=schedule["subject_id"],
        teacher_id=schedule["teacher_id"],
        token=token,
        expires_at=expires_at,
        token_type=token_type  # "entry" or "exit"
    )
    
    # Push to ESP32 via HTTP callback (if device is registered)
    device = db.get_device_by_room(room_id)
    if device and device.get("callback_url"):
        try:
            import requests
            requests.post(
                device["callback_url"],
                json={
                    "event": "qr_generated",
                    "room_id": room_id,
                    "room_code": room["room_code"],
                    "schedule_id": schedule_id,
                    "token": token,
                    "token_type": token_type,
                    "expires_at": expires_at,
                    "grade_name": schedule.get("grade_name"),
                    "subject_name": schedule.get("subject_name")
                },
                timeout=5
            )
        except Exception as e:
            print(f"Failed to push QR to ESP32: {e}")
    
    return {
        "message": f"QR token generated for {token_type}",
        "qr_id": qr_id,
        "token": token,
        "schedule_id": schedule_id,
        "room_id": room_id,
        "token_type": token_type,
        "expires_at": expires_at,
        "expires_in": settings.QR_EXPIRY_SECONDS
    }
    
    expires_at = (datetime.now() + timedelta(seconds=settings.QR_EXPIRY_SECONDS)).isoformat()
    qr_id = db.create_qr_token(
        schedule_id=schedule_id,
        room_id=room_id,
        grade_id=schedule["grade_id"],
        subject_id=schedule["subject_id"],
        teacher_id=schedule["teacher_id"],
        token=token,
        expires_at=expires_at,
        token_type=token_type,
        state="scheduled"
    )
    
    # Get names for display
    grade = db.get_grade(schedule["grade_id"])
    subject = db.get_subject(schedule["subject_id"])
    teacher = db.get_user(schedule["teacher_id"])
    
    return {
        "qr_id": qr_id,
        "token": token,
        "token_type": token_type,
        "schedule_id": schedule_id,
        "room_id": room_id,
        "subject_name": subject.get("name") if subject else "N/A",
        "teacher_name": teacher.get("name") if teacher else "N/A",
        "grade_name": grade.get("name") if grade else "N/A",
        "room_name": room.get("name"),
        "expires_at": expires_at,
        "expires_in": settings.QR_EXPIRY_SECONDS
    }


@router.post("/early-request")
async def request_early_class(
    schedule_id: str,
    requested_start: str,  # ISO format datetime
    auth_user: dict = Depends(get_current_user)
):
    """Teacher requests to start class early (if previous slot is empty)"""
    from datetime import datetime
    
    schedule = db.get_grade_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    if schedule.get("teacher_id") != auth_user.get("user_id"):
        raise HTTPException(status_code=403, detail="Not authorized for this schedule")
    
    # Check if previous time slot is empty (simplified: just check if room is free)
    room_id = schedule.get("room_id")
    requested_dt = datetime.fromisoformat(requested_start)
    
    # TODO: Check if room is free at requested time
    # For now, just mark the schedule as early_approved
    db.update_schedule_state(schedule_id, "early_approved", requested_start)
    
    return {
        "message": "Early class request submitted",
        "schedule_id": schedule_id,
        "requested_start": requested_start,
        "status": "pending_approval"  # Admin can approve via admin endpoint
    }
