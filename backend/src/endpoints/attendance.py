"""Attendance submission with 3-layer validation (SQLite local mode)."""

import json
from datetime import datetime
from math import atan2, cos, radians, sin, sqrt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.auth import verify_hmac_token
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


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _validate_schedule(teacher_id: str, room_id: str, now: datetime) -> tuple[bool, dict]:
    day_name = now.strftime("%A")
    schedule = db.get_schedule_by_teacher_and_day(teacher_id, day_name, room_id)
    if not schedule:
        return False, {"reason": f"Tidak ada jadwal hari {day_name} di ruangan ini"}

    try:
        start = datetime.strptime(schedule["start_time"], "%H:%M").time()
        end = datetime.strptime(schedule["end_time"], "%H:%M").time()
    except (ValueError, KeyError):
        return False, {"reason": "Format jadwal tidak valid"}

    now_t = now.time()
    tol_min = settings.LATE_TOLERANCE_MINUTES

    def to_min(t):
        return t.hour * 60 + t.minute

    start_min = to_min(start) - tol_min
    end_min = to_min(end) + tol_min
    now_min = to_min(now_t)

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
    """
    teacher_id = auth_user["user_id"]
    now = datetime.now()
    reasons: list[str] = []

    # Layer 1: QR token
    token_data = verify_hmac_token(data.qr_token, settings.JWT_SECRET)
    if not token_data:
        reasons.append("QR token tidak valid atau kedaluwarsa")
    elif token_data.get("room_id") != data.room_id:
        reasons.append("QR token bukan untuk ruangan ini")

    # Layer 1b: If QR is bound to schedule, validate teacher matches the schedule's teacher
    if token_data and token_data.get("schedule_id"):
        qr_token_data = db.get_qr_token(data.qr_token)
        if qr_token_data:
            # Check teacher matches
            if qr_token_data["teacher_id"] != teacher_id:
                reasons.append("QR token ini tidak untuk guru Anda")
            # Check schedule matches (optional - could cross-check with schedule_id in token)
            if qr_token_data["schedule_id"] != token_data["schedule_id"]:
                reasons.append("QR token tidak cocok dengan jadwal")

    room = db.get_room(data.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Ruangan tidak ditemukan")

    # Layer 2: schedule match
    sched_ok, sched_info = _validate_schedule(teacher_id, data.room_id, now)
    if not sched_ok:
        reasons.append(sched_info.get("reason", "Jadwal tidak cocok"))

    # Layer 3: GPS geofence (only if room has coordinates)
    geo = room.get("geolocation") if isinstance(room, dict) else None
    radius = room.get("geofence_radius", settings.GEOFENCE_RADIUS_M)  # Use room-specific radius or default
    distance_m: Optional[float] = None
    if geo:
        try:
            parts = str(geo).replace(",", " ").split()
            room_lat, room_lon = float(parts[0]), float(parts[1])
            distance_m = _haversine_m(
                room_lat, room_lon,
                data.geolocation.latitude, data.geolocation.longitude,
            )
            if distance_m > radius:
                reasons.append(f"GPS di luar radius ({distance_m:.0f}m > {radius}m)")
        except (ValueError, IndexError):
            reasons.append("Koordinat ruangan tidak valid")

    if reasons:
        raise HTTPException(status_code=400, detail={"reasons": reasons})

    status = "late" if sched_info.get("is_late") else "on_time"
    lateness = sched_info.get("lateness_minutes", 0) if status == "late" else None

    log_id = db.create_attendance_log(
        teacher_id=teacher_id,
        room_id=data.room_id,
        status=status,
        geolocation=json.dumps(data.geolocation.model_dump()),
        qr_token=data.qr_token,
        device_fingerprint=data.device_fingerprint,
        lateness_minutes=lateness,
    )

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
            "teacher_name": auth_user.get("name", ""),
            "teacher_nip": auth_user.get("nip", ""),
            "room_name": room.get("name", ""),
            "timestamp": now.strftime("%H:%M:%S"),
            "status_text": "TEPAT WAKTU" if status == "on_time" else f"TERLAMBAT {lateness} MENIT",
            "status_color": "green" if status == "on_time" else "orange",
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
