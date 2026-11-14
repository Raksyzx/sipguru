from src.config import settings
from src.database import get_db
from src.auth import generate_hmac_token
from src.deps import get_current_user, require_admin

from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel

router = APIRouter()
db = get_db()


class GenerateQRRequest(BaseModel):
    schedule_id: str  # Required: schedule already contains room_id, grade_id, subject_id, teacher_id
    expires_in: int = 300  # Optional: expiry in seconds (default 300 = 5 minutes)


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
    expiry = data.expires_in if hasattr(data, 'expires_in') and data.expires_in else settings.QR_EXPIRY_SECONDS
    token = generate_hmac_token(
        room_id=room_id,
        schedule_id=data.schedule_id,
        subject_id=schedule.get("subject_id"),
        teacher_id=schedule.get("teacher_id"),
        grade_id=schedule.get("grade_id"),
        expiry_seconds=expiry,
        secret=settings.JWT_SECRET
    )
    
    # Store in qr_tokens table for strict validation
    from datetime import datetime, timedelta
    expires_at = (datetime.now() + timedelta(seconds=expiry)).isoformat()
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
        "expires_in": expiry
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
    # FIX: Get current time in UTC, then convert to WIB
    utc_now = datetime.now(timezone.utc)
    now_wib = utc_now.astimezone(wib_offset)
    current_time = now_wib.strftime("%H:%M")
    # FIX: Use Indonesian day name for DB query (DB stores "Kamis", not "Thursday")
    day_of_week_en = now_wib.strftime("%A")  # e.g., "Thursday"
    day_name_map = {
        "Monday": "Senin", "Tuesday": "Selasa", "Wednesday": "Rabu",
        "Thursday": "Kamis", "Friday": "Jumat", "Saturday": "Sabtu", "Sunday": "Minggu"
    }
    day_of_week_id = day_name_map.get(day_of_week_en, day_of_week_en)  # "Kamis"
    
    # FIX: Query DB with Indonesian day name (DB stores "Kamis", not "Thursday")
    day_for_query = day_of_week_id
    
    # FIX: Get today's grade_schedules for this room (not old schedules table)
    try:
        all_schedules = db.get_all_grade_schedules()
        print(f"[QR DEBUG] all_schedules count: {len(all_schedules)}")
        print(f"[QR DEBUG] searching for room_id={room_id}, day_of_week={day_for_query}")
        if all_schedules:
            sample = all_schedules[0]
            print(f"[QR DEBUG] sample schedule keys: {list(sample.keys())}")
            print(f"[QR DEBUG] sample room_id: {sample.get('room_id')}, day_of_week: {sample.get('day_of_week')}")
        schedules = [s for s in all_schedules if s.get("room_id") == room_id and s.get("day_of_week") == day_for_query]
        print(f"[QR DEBUG] filtered schedules for room {room_id} on {day_for_query}: {len(schedules)}")
        if schedules:
            print(f"[QR DEBUG] schedules: {[(s['start_time'], s['end_time'], s.get('grade_name')) for s in schedules]}")
    except Exception as e:
        print(f"[QR DEBUG] Error getting schedules: {e}")
        import traceback
        traceback.print_exc()
        schedules = []
    
    current_schedule = None
    next_schedule = None
    state = "IDLE"
    
    debug_comparisons = []
    for schedule in schedules:
        start_time = schedule.get("start_time", "00:00")
        end_time = schedule.get("end_time", "00:00")
        
        # FIX: Use today's date to avoid year 1900 comparison bug
        today = now_wib.date()
        start_dt = datetime.combine(today, datetime.strptime(start_time, "%H:%M").time()).replace(tzinfo=wib_offset)
        end_dt = datetime.combine(today, datetime.strptime(end_time, "%H:%M").time()).replace(tzinfo=wib_offset)
        grace_end = end_dt + timedelta(minutes=10)
        
        now_floor = now_wib.replace(second=0, microsecond=0)
        match = start_dt <= now_floor <= grace_end
        
        if match:
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
    
    # Check if this is the next class (within 15 minutes) - only if no current_schedule found
    if not current_schedule:
        for schedule in schedules:
            start_time = schedule.get("start_time", "00:00")
            # FIX: Use today's date
            today = now_wib.date()
            start_dt = datetime.combine(today, datetime.strptime(start_time, "%H:%M").time()).replace(tzinfo=wib_offset)
            if start_dt > now_wib.replace(second=0, microsecond=0):
                minutes_until = (start_dt - now_wib).total_seconds() / 60
                if minutes_until <= 15 and next_schedule is None:
                    next_schedule = schedule
                    if minutes_until <= 15:
                        state = "PRE_CLASS" if state == "IDLE" else state
    
    # DEBUG: Always return debug info in response (remove in production)
    debug_info = {
        "all_schedules_count": len(all_schedules) if 'all_schedules' in locals() else 0,
        "filtered_count": len(schedules),
        "search_room_id": room_id,
        "search_day": day_of_week_en,
    }
    
    return {
        "room_id": room_id,
        "room_code": room_code,
        "room_name": room.get("name"),
        "current_time": current_time,
        "day_of_week": day_of_week_id,
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
    import traceback
    
    try:
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
        expires_at = (datetime.now() + timedelta(seconds=settings.QR_EXPIRY_SECONDS)).isoformat()
        
        print(f"[AUTO-TOKEN] Creating token for schedule={schedule_id}, room={room_id}, type={token_type}")
        
        qr_id = db.create_qr_token(
            schedule_id=schedule_id,
            room_id=room_id,
            grade_id=schedule["grade_id"],
            subject_id=schedule["subject_id"],
            teacher_id=schedule["teacher_id"],
            token=token,
            expires_at=expires_at,
            token_type=token_type
        )
        
        print(f"[AUTO-TOKEN] Token created successfully: qr_id={qr_id}")
        
        # Note: ESP32 callback via devices table temporarily disabled
        # Device will receive token directly from POST response
        
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
    except Exception as e:
        print(f"[AUTO-TOKEN] ERROR: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    
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


@router.post("/auto-generate-all")
async def auto_generate_all_qr_tokens(
    request: Request,
    x_cron_secret: str = Header(None, alias="X-Cron-Secret")
):
    """Auto-generate QR tokens for all upcoming schedules (called by cron/GitHub Actions)"""
    # Validate cron secret (if set in environment)
    if settings.CRON_SECRET and x_cron_secret != settings.CRON_SECRET:
        raise HTTPException(status_code=401, detail="Invalid cron secret")
    
    from datetime import datetime, timedelta, timezone
    
    wib_offset = timezone(timedelta(hours=7))
    utc_now = datetime.now(timezone.utc)
    now_wib = utc_now.astimezone(wib_offset)
    current_time = now_wib.strftime("%H:%M")
    
    # Convert day to Indonesian
    day_of_week_en = now_wib.strftime("%A")
    day_name_map = {
        "Monday": "Senin", "Tuesday": "Selasa", "Wednesday": "Rabu",
        "Thursday": "Kamis", "Friday": "Jumat", "Saturday": "Sabtu", "Sunday": "Minggu"
    }
    day_of_week_id = day_name_map.get(day_of_week_en, day_of_week_en)
    
    # Get all rooms with registered ESP32 devices
    rooms = db.get_all_rooms()
    devices = db.get_all_devices()
    device_by_room = {d["room_id"]: d for d in devices}
    
    results = {
        "generated": [],
        "skipped": [],
        "errors": []
    }
    
    for room in rooms:
        room_id = room["id"]
        
        # Get schedules for this room today
        all_schedules = db.get_all_grade_schedules()
        schedules = [s for s in all_schedules 
                    if s.get("room_id") == room_id 
                    and s.get("day_of_week") == day_of_week_id
                    and s.get("is_active", True)]
        
        if not schedules:
            continue
            
        for schedule in schedules:
            start_time = schedule.get("start_time", "00:00")
            end_time = schedule.get("end_time", "00:00")
            
            today = now_wib.date()
            start_dt = datetime.combine(today, datetime.strptime(start_time, "%H:%M").time()).replace(tzinfo=wib_offset)
            end_dt = datetime.combine(today, datetime.strptime(end_time, "%H:%M").time()).replace(tzinfo=wib_offset)
            
            # Generate entry token: 15 minutes before start until 10 minutes before end
            entry_window_start = start_dt - timedelta(minutes=15)
            entry_window_end = end_dt - timedelta(minutes=10)
            
            # Check if we're in the entry window
            if entry_window_start <= now_wib <= entry_window_end:
                # Check if entry token already exists and is valid
                existing_tokens = db.get_qr_tokens_by_schedule(schedule["id"])
                has_valid_entry = any(
                    t.get("token_type") == "entry" 
                    and t.get("is_active") 
                    and datetime.fromisoformat(t["expires_at"].replace("Z", "+00:00")) > now_wib
                    for t in existing_tokens
                )
                
                if not has_valid_entry:
                    try:
                        # Generate entry token (expires at end of class + 10 min buffer)
                        entry_expiry = int((entry_window_end - now_wib).total_seconds()) + 600  # 10 min buffer
                        if entry_expiry < 300:  # Minimum 5 minutes
                            entry_expiry = 300
                        
                        token = generate_hmac_token(
                            room_id=room_id,
                            schedule_id=schedule["id"],
                            subject_id=schedule.get("subject_id"),
                            teacher_id=schedule.get("teacher_id"),
                            grade_id=schedule.get("grade_id"),
                            expiry_seconds=entry_expiry,
                            secret=settings.JWT_SECRET
                        )
                        
                        expires_at = (now_wib + timedelta(seconds=entry_expiry)).isoformat()
                        qr_id = db.create_qr_token(
                            schedule_id=schedule["id"],
                            room_id=room_id,
                            grade_id=schedule["grade_id"],
                            subject_id=schedule["subject_id"],
                            teacher_id=schedule["teacher_id"],
                            token=token,
                            expires_at=expires_at,
                            token_type="entry"
                        )
                        
                        # Push to ESP32 if device registered
                        device = device_by_room.get(room_id)
                        if device and device.get("callback_url"):
                            try:
                                import requests
                                requests.post(
                                    device["callback_url"],
                                    json={
                                        "event": "qr_generated",
                                        "room_id": room_id,
                                        "room_code": room["room_code"],
                                        "schedule_id": schedule["id"],
                                        "token": token,
                                        "token_type": "entry",
                                        "expires_at": expires_at,
                                        "grade_name": schedule.get("grade_name"),
                                        "subject_name": schedule.get("subject_name")
                                    },
                                    timeout=5
                                )
                            except Exception as e:
                                print(f"Failed to push QR to ESP32: {e}")
                        
                        results["generated"].append({
                            "schedule_id": schedule["id"],
                            "room_id": room_id,
                            "room_code": room["room_code"],
                            "token_type": "entry",
                            "qr_id": qr_id,
                            "expires_at": expires_at
                        })
                    except Exception as e:
                        results["errors"].append({
                            "schedule_id": schedule["id"],
                            "room_id": room_id,
                            "error": str(e)
                        })
                else:
                    results["skipped"].append({
                        "schedule_id": schedule["id"],
                        "reason": "valid_entry_exists"
                    })
            
            # Generate exit token: 10 minutes before end until 30 minutes after end
            exit_window_start = end_dt - timedelta(minutes=10)
            exit_window_end = end_dt + timedelta(minutes=30)
            
            if exit_window_start <= now_wib <= exit_window_end:
                existing_tokens = db.get_qr_tokens_by_schedule(schedule["id"])
                has_valid_exit = any(
                    t.get("token_type") == "exit" 
                    and t.get("is_active") 
                    and datetime.fromisoformat(t["expires_at"].replace("Z", "+00:00")) > now_wib
                    for t in existing_tokens
                )
                
                if not has_valid_exit:
                    try:
                        exit_expiry = int((exit_window_end - now_wib).total_seconds()) + 60
                        if exit_expiry < 300:
                            exit_expiry = 300
                        
                        token = generate_hmac_token(
                            room_id=room_id,
                            schedule_id=schedule["id"],
                            subject_id=schedule.get("subject_id"),
                            teacher_id=schedule.get("teacher_id"),
                            grade_id=schedule.get("grade_id"),
                            expiry_seconds=exit_expiry,
                            secret=settings.JWT_SECRET
                        )
                        
                        expires_at = (now_wib + timedelta(seconds=exit_expiry)).isoformat()
                        qr_id = db.create_qr_token(
                            schedule_id=schedule["id"],
                            room_id=room_id,
                            grade_id=schedule["grade_id"],
                            subject_id=schedule["subject_id"],
                            teacher_id=schedule["teacher_id"],
                            token=token,
                            expires_at=expires_at,
                            token_type="exit"
                        )
                        
                        device = device_by_room.get(room_id)
                        if device and device.get("callback_url"):
                            try:
                                import requests
                                requests.post(
                                    device["callback_url"],
                                    json={
                                        "event": "qr_generated",
                                        "room_id": room_id,
                                        "room_code": room["room_code"],
                                        "schedule_id": schedule["id"],
                                        "token": token,
                                        "token_type": "exit",
                                        "expires_at": expires_at,
                                        "grade_name": schedule.get("grade_name"),
                                        "subject_name": schedule.get("subject_name")
                                    },
                                    timeout=5
                                )
                            except Exception as e:
                                print(f"Failed to push exit QR to ESP32: {e}")
                        
                        results["generated"].append({
                            "schedule_id": schedule["id"],
                            "room_id": room_id,
                            "room_code": room["room_code"],
                            "token_type": "exit",
                            "qr_id": qr_id,
                            "expires_at": expires_at
                        })
                    except Exception as e:
                        results["errors"].append({
                            "schedule_id": schedule["id"],
                            "room_id": room_id,
                            "error": str(e)
                })
                else:
                    results["skipped"].append({
                        "schedule_id": schedule["id"],
                        "reason": "valid_exit_exists"
                    })
    
    return {
        "timestamp": now_wib.isoformat(),
        "day": day_of_week_id,
        "current_time": current_time,
        "results": results
    }
