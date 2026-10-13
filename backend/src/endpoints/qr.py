from src.config import settings
from src.local_db import LocalDBClient
from src.auth import generate_hmac_token
from src.deps import get_current_user, require_admin

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

router = APIRouter()
db = LocalDBClient()


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
