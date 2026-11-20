"""Attendance submission with 3-layer validation (SQLite local mode)."""

import json
from datetime import datetime
from math import atan2, cos, radians, sin, sqrt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.auth import verify_hmac_token
from src.attendance_history import session_context
from src.config import settings
from src.deps import get_current_user
from src.database import get_db

router = APIRouter()
db = get_db()


class Geolocation(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    timestamp: Optional[int] = None


class AttendanceSubmit(BaseModel):
    room_id: str
    geolocation: Geolocation
    device_fingerprint: str
    qr_token: str


class AttendanceSubmitNoAuth(BaseModel):
    """Attendance submit without auth header - QR token contains teacher_id"""
    geolocation: Geolocation
    device_fingerprint: str
    qr_token: str


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _validate_schedule(teacher_id: str, room_id: str, now: datetime, schedule_id: str = None) -> tuple[bool, dict]:
    # FIX: Convert UTC to WIB (UTC+7) for schedule comparison
    from datetime import timezone, timedelta
    wib_offset = timezone(timedelta(hours=7))
    # FIX: Get current time in UTC, then convert to WIB
    utc_now = datetime.now(timezone.utc)
    now_wib = utc_now.astimezone(wib_offset)
    
    # FIX: DB stores Indonesian day names (e.g., "Kamis"), not English
    day_name_en = now_wib.strftime("%A")  # e.g., "Thursday"
    day_name_map = {
        "Monday": "Senin", "Tuesday": "Selasa", "Wednesday": "Rabu",
        "Thursday": "Kamis", "Friday": "Jumat", "Saturday": "Sabtu", "Sunday": "Minggu"
    }
    day_name_id = day_name_map.get(day_name_en, day_name_en)  # "Kamis"
    
    print(f"[SCHEDULE DEBUG] teacher_id={teacher_id}, room_id={room_id}, schedule_id={schedule_id}")
    print(f"[SCHEDULE DEBUG] now_wib={now_wib}, day_name_id={day_name_id}")
    
    # FIX: Use Indonesian day name for DB query
    schedules = db.get_grade_schedules_by_teacher_and_day(teacher_id, day_name_id)
    
    print(f"[SCHEDULE DEBUG] schedules count={len(schedules)}")
    if schedules:
        print(f"[SCHEDULE DEBUG] schedules={[(s['start_time'], s['end_time'], s.get('room_id'), s.get('id')) for s in schedules]}")
    
    # Filter by room_id AND schedule_id (from QR token) if provided
    schedule = None
    if schedule_id and schedules:
        # Priority: match by schedule_id from QR token
        schedule = next((s for s in schedules if s.get("id") == schedule_id), None)
        print(f"[SCHEDULE DEBUG] filtered schedule by schedule_id {schedule_id}: {schedule}")
        # Debug: print all schedule IDs for comparison
        print(f"[SCHEDULE DEBUG] available schedule IDs: {[s.get('id') for s in schedules]}")
        print(f"[SCHEDULE DEBUG] schedule_id type: {type(schedule_id)}, db id types: {[type(s.get('id')) for s in schedules]}")
        
        # If schedule_id from QR token not found, reject with clear message
        if not schedule:
            return False, {
                "reason": f"QR token tidak valid - jadwal sudah diubah/dihapus. Minta admin generate QR baru.",
                "schedule_id_mismatch": True
            }
    
    # Fallback: filter by room_id only if no schedule_id was provided
    if not schedule and room_id and schedules and not schedule_id:
        schedule = next((s for s in schedules if s.get("room_id") == room_id), None)
        print(f"[SCHEDULE DEBUG] filtered schedule for room {room_id}: {schedule}")
    
    if not schedule:
        return False, {"reason": f"Tidak ada jadwal hari {day_name_en} di ruangan ini"}
    
    try:
        start = datetime.strptime(schedule["start_time"], "%H:%M").time()
        end = datetime.strptime(schedule["end_time"], "%H:%M").time()
    except (ValueError, KeyError):
        return False, {"reason": "Format jadwal tidak valid"}
    
    now_t = now_wib.time()  # Use WIB time for comparison
    
    def to_min(t):
        return t.hour * 60 + t.minute
    
    start_min = to_min(start)
    end_min = to_min(end) - 10  # 10 menit sebelum mapel selesai (untuk testing)
    now_min = to_min(now_t)
    
    # Toleransi telat 15 menit dari start time
    is_valid = start_min <= now_min <= end_min
    if not is_valid:
        return False, {
            "reason": f"Di luar jam jadwal ({schedule['start_time']}-{schedule['end_time']})",
            "schedule_id": schedule["id"],
        }
    
    is_late = now_min > to_min(start)
    lateness = (now_min - to_min(start)) if is_late else 0
    return True, {
        "schedule_id": schedule["id"],
        "start_time": schedule["start_time"],
        "end_time": schedule["end_time"],
        "is_late": is_late,
        "lateness_minutes": lateness,
    }
@router.post("/submit")
async def submit_attendance(
    data: AttendanceSubmit,
    auth_user: dict = Depends(get_current_user),
):
    """Submit attendance with 3-layer validation: QR + schedule + GPS.
    
    QR tokens bound to grade_schedules (jurusan/kelas+mapel+guru+room) are validated
    against the teacher's identity and the schedule.
    Updates QR token state to 'entry_scanned' or 'exit_scanned' based on token_type.
    """
    # Extract teacher_id from auth JWT (mobile app MUST send Authorization header)
    teacher_id = auth_user["user_id"]
    
    now = datetime.now()
    reasons: list[str] = []
    token_type = "entry"  # Default to entry
    
    # Layer 1: QR token
    token_data = verify_hmac_token(data.qr_token, settings.JWT_SECRET)
    if not token_data:
        reasons.append("QR token tidak valid atau kedaluwarsa")
    elif token_data.get("room_id") != data.room_id:
        reasons.append("QR token bukan untuk ruangan ini")

    # Layer 1b: If QR is bound to schedule, validate teacher matches the schedule's teacher
    schedule_id: str | None = None
    if token_data and token_data.get("schedule_id"):
        qr_token_data = db.get_qr_token(data.qr_token)
        if qr_token_data:
            # Check teacher matches
            if qr_token_data["teacher_id"] != teacher_id:
                reasons.append("QR token ini tidak untuk guru Anda")
            # Check schedule matches (optional - could cross-check with schedule_id in token)
            if qr_token_data["schedule_id"] != token_data["schedule_id"]:
                reasons.append("QR token tidak cocok dengan jadwal")
            # Get token type for state update
            token_type = qr_token_data.get("token_type", "entry")
            # Pass schedule_id to schedule validation
            schedule_id = token_data.get("schedule_id")

    room = db.get_room(data.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Ruangan tidak ditemukan")

    # Layer 2: schedule match (pass schedule_id from QR token)
    sched_ok, sched_info = _validate_schedule(teacher_id, data.room_id, now, schedule_id)
    if not sched_ok:
        reasons.append(sched_info.get("reason", "Jadwal tidak cocok"))

    # Layer 3: GPS geofence (only if room has coordinates)
    geo = room.get("geolocation") if isinstance(room, dict) else None
    radius = room.get("geofence_radius", settings.GEOFENCE_RADIUS_M)  # Use room-specific radius or default
    distance_m: Optional[float] = None
    if geo:
        try:
            # FIX: Handle multiple formats: "(-6.12,106.84)" or "-6.12,106.84" or "-6.12 106.84"
            geo_str = str(geo).replace("(", "").replace(")", "").strip()
            parts = geo_str.replace(",", " ").split()
            room_lat, room_lon = float(parts[0]), float(parts[1])
            distance_m = _haversine_m(
                room_lat, room_lon,
                data.geolocation.latitude, data.geolocation.longitude,
            )
            if distance_m > radius:
                reasons.append(f"GPS di luar radius ({distance_m:.0f}m > {radius}m)")
        except (ValueError, IndexError) as e:
            print(f"Geofence validation error: {e}, geolocation: {geo}")
            reasons.append("Koordinat ruangan tidak valid")

    if reasons:
        raise HTTPException(status_code=400, detail={"reasons": reasons})

    status = "late" if sched_info.get("is_late") else "on_time"
    lateness = sched_info.get("lateness_minutes", 0) if status == "late" else None

    context = session_context(db, sched_info["schedule_id"], token_type, lateness)
    log_id = db.create_attendance_log(
        teacher_id=teacher_id,
        room_id=data.room_id,
        status=status,
        geolocation=json.dumps(data.geolocation.model_dump()),
        qr_token=data.qr_token,
        device_fingerprint=data.device_fingerprint,
        attendance_context=context,
    )

    # Update QR token state to scanned
    db.update_qr_token_state(data.qr_token, f"{token_type}_scanned", now.isoformat())

    # Get full teacher data from DB (auth_user only has user_id, email, role)
    teacher_data = db.get_user(teacher_id)
    teacher_name = teacher_data.get("name", "") if teacher_data else auth_user.get("email", "Unknown")
    teacher_nip = teacher_data.get("nip", "-") if teacher_data else "-"
    
    # Convert to WIB (UTC+7) for display
    from datetime import timezone, timedelta
    wib_tz = timezone(timedelta(hours=7))
    now_wib = now.astimezone(wib_tz) if now.tzinfo else now.replace(tzinfo=timezone.utc).astimezone(wib_tz)
    
    msg = "Presensi berhasil" if status == "on_time" else f"Terlambat {lateness} menit"
    return {
        "message": msg,
        "status": status,
        "lateness_minutes": lateness,
        "log_id": log_id,
        "room_name": room.get("name"),
        "distance_m": round(distance_m, 1) if distance_m is not None else None,
        "validated_at": now.isoformat(),
        # LCD display fields
        "display": {
            "success": True,
            "teacher_name": teacher_name,
            "teacher_nip": teacher_nip,
            "room_name": room.get("name", ""),
            "timestamp": now_wib.strftime("%H:%M:%S"),
            "status_text": "TEPAT WAKTU" if status == "on_time" else f"TERLAMBAT {lateness} MENIT",
            "status_color": "green" if status == "on_time" else "orange",
            "token_type": token_type,  # For ESP32 to know if entry or exit
        }
    }


@router.get("/today")
async def today_attendance(auth_user: dict = Depends(get_current_user)):
    """Check if teacher already submitted attendance today."""
    from datetime import date

    today = date.today().isoformat()
    stats = db.get_daily_attendance_stats(today)
    history = db.get_attendance_by_teacher_and_month(
        auth_user["user_id"], date.today().year, date.today().month
    )
    todays = [h for h in history if str(h.get("created_at", ""))[:10] == today]
    return {"date": today, "submitted": len(todays) > 0, "logs": todays, "stats": stats}


@router.get("/last-scan/{room_code}")
async def last_scan(room_code: str):
    """Get last successful scan for a room (for ESP32 display)."""
    room = db.get_room_by_code(room_code)
    if not room:
        return {"has_scanned": False, "teacher_name": None, "scan_time": None}
    
    # Get latest attendance log for this room today
    from datetime import date, timezone, timedelta
    today = date.today().isoformat()
    
    # Use raw SQL via Supabase REST API - fetch logs first
    import httpx
    supabase_url = settings.SUPABASE_URL
    supabase_key = settings.SUPABASE_ANON_KEY
    
    # Query attendance_logs for today (without join)
    query_url = f"{supabase_url}/rest/v1/attendance_logs?select=*&room_id=eq.{room['id']}&created_at=gt.{today}T00:00:00&order=created_at.desc&limit=1"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                query_url,
                headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
                timeout=5.0
            )
            response.raise_for_status()
            logs = response.json()
    except Exception as e:
        print(f"[LAST_SCAN] Error querying Supabase: {e}")
        return {"has_scanned": False, "teacher_name": None, "scan_time": None}
    
    if not logs or len(logs) == 0:
        return {"has_scanned": False, "teacher_name": None, "scan_time": None}
    
    # Get the most recent scan
    latest = logs[0]
    teacher_id = latest.get("teacher_id", "")
    
    # Fetch teacher name separately
    teacher_name = ""
    if teacher_id:
        try:
            teacher_url = f"{supabase_url}/rest/v1/users?select=name&id=eq.{teacher_id}"
            async with httpx.AsyncClient() as client:
                teacher_resp = await client.get(
                    teacher_url,
                    headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
                    timeout=5.0
                )
                teacher_resp.raise_for_status()
                teachers = teacher_resp.json()
                if teachers and len(teachers) > 0:
                    teacher_name = teachers[0].get("name", "")
        except Exception as e:
            print(f"[LAST_SCAN] Error fetching teacher: {e}")
    
    # Parse created_at to WIB time
    scan_time_str = latest.get("created_at", "")
    scan_time_display = ""
    if scan_time_str:
        try:
            scan_dt = datetime.fromisoformat(scan_time_str.replace("Z", "+00:00"))
            wib_tz = timezone(timedelta(hours=7))
            scan_wib = scan_dt.astimezone(wib_tz)
            scan_time_display = scan_wib.strftime("%H:%M:%S")
        except:
            scan_time_display = scan_time_str[:19]  # Fallback
    
    return {
        "has_scanned": True,
        "teacher_name": teacher_name,
        "scan_time": scan_time_display,
        "scan_timestamp": scan_time_str
    }
