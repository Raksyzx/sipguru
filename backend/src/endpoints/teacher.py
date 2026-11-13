from src.config import settings
from src.database import get_db

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from src.deps import get_current_user as verify_jwt
from src.supabase import get_day_name_indonesian
import datetime
import asyncio

router = APIRouter()
db = get_db()

# In-memory cache for rarely changing data (schedules, rooms)
_schedule_cache = {}
_rooms_cache = None
_rooms_cache_time = 0
CACHE_TTL = 300  # 5 minutes

async def _get_cached_rooms():
    """Get rooms with in-memory caching"""
    global _rooms_cache, _rooms_cache_time
    import time
    now = time.time()
    if _rooms_cache is not None and (now - _rooms_cache_time) < CACHE_TTL:
        return _rooms_cache
    _rooms_cache = await asyncio.get_event_loop().run_in_executor(None, db.get_all_rooms)
    _rooms_cache_time = now
    return _rooms_cache

async def _get_cached_teacher_schedules(teacher_id: str):
    """Get teacher schedules with in-memory caching"""
    import time
    cache_key = f"schedules_{teacher_id}"
    now = time.time()
    if cache_key in _schedule_cache:
        cached, cache_time = _schedule_cache[cache_key]
        if (now - cache_time) < CACHE_TTL:
            return cached
    schedules = await asyncio.get_event_loop().run_in_executor(None, db.get_grade_schedules_by_teacher, teacher_id)
    _schedule_cache[cache_key] = (schedules, now)
    return schedules

async def _get_cached_teacher_schedules_by_day(teacher_id: str, day_name_en: str):
    """Get teacher schedules by day with in-memory caching"""
    import time
    cache_key = f"schedules_{teacher_id}_{day_name_en}"
    now = time.time()
    if cache_key in _schedule_cache:
        cached, cache_time = _schedule_cache[cache_key]
        if (now - cache_time) < CACHE_TTL:
            return cached
    schedules = await asyncio.get_event_loop().run_in_executor(None, db.get_grade_schedules_by_teacher_and_day, teacher_id, day_name_en)
    _schedule_cache[cache_key] = (schedules, now)
    return schedules

@router.get("/todays-schedule")
async def get_todays_schedule(
    auth_user: dict = Depends(verify_jwt)
):
    """Get teacher's schedule for today with enriched data - optimized with caching"""
    # FIX: Convert UTC to WIB and use Indonesian day name
    from datetime import timezone, timedelta
    wib_offset = timezone(timedelta(hours=7))
    utc_now = datetime.datetime.now(timezone.utc)
    now_wib = utc_now.astimezone(wib_offset)
    
    day_name_en = now_wib.strftime("%A")  # e.g., "Thursday"
    day_name_map = {
        "Monday": "Senin", "Tuesday": "Selasa", "Wednesday": "Rabu",
        "Thursday": "Kamis", "Friday": "Jumat", "Saturday": "Sabtu", "Sunday": "Minggu"
    }
    day_name_id = day_name_map.get(day_name_en, day_name_en)  # "Kamis"
    
    print(f"[TEACHER DEBUG] now_wib={now_wib}, day_name_en={day_name_en}, day_name_id={day_name_id}")
    
    # FIX: Use Indonesian day name for DB query (DB stores "Kamis", not "Thursday")
    schedules = await _get_cached_teacher_schedules_by_day(auth_user["user_id"], day_name_id)
    
    return {"schedules": schedules, "day": day_name_id}

@router.get("/history")
async def get_attendance_history(
    auth_user: dict = Depends(verify_jwt),
    month: int = None,
    year: int = None,
    search: str = None,
    day: str = None,
    room_id: str = None,
    status: str = None
):
    """Get attendance history with optional filters (search, day, room, status)"""
    import datetime
    now = datetime.datetime.now()
    target_year = year if year is not None else now.year
    target_month = month if month is not None else now.month
    
    history = db.get_attendance_by_teacher_and_month(
        auth_user["user_id"],
        target_year,
        target_month
    )
    
    # Enrich with room names
    rooms = await _get_cached_rooms()
    room_map = {r["id"]: r["name"] for r in rooms}
    
    enriched_history = []
    for h in history:
        enriched = dict(h)
        enriched["room_name"] = room_map.get(h.get("room_id"), "Unknown")
        
        # Parse created_at for day name
        created_at = h.get("created_at", "") or ""
        if created_at:
            try:
                dt = datetime.datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                dt_wib = dt.astimezone(datetime.timezone(datetime.timedelta(hours=7)))
                enriched["day_name"] = get_day_name_indonesian(dt_wib.strftime("%A"))
                enriched["date_str"] = dt_wib.strftime("%Y-%m-%d")
                enriched["time_str"] = dt_wib.strftime("%H:%M")
            except:
                enriched["day_name"] = ""
                enriched["date_str"] = ""
                enriched["time_str"] = ""
        else:
            enriched["day_name"] = ""
            enriched["date_str"] = ""
            enriched["time_str"] = ""
        
        # Apply filters
        if search:
            search_lower = search.lower()
            match = (
                search_lower in enriched.get("room_name", "").lower() or
                search_lower in enriched.get("day_name", "").lower()
            )
            if not match:
                continue
        
        if day and enriched.get("day_name") != day:
            continue
        
        if room_id and enriched.get("room_id") != room_id:
            continue
        
        if status and enriched.get("status") != status:
            continue
        
        enriched_history.append(enriched)
    
    # Sort by created_at desc
    enriched_history.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {
        "history": enriched_history,
        "month": target_month,
        "year": target_year,
        "total": len(enriched_history),
        "on_time": len([h for h in enriched_history if h.get("status") == "on_time"]),
        "late": len([h for h in enriched_history if h.get("status") == "late"]),
    }

@router.post("/leave")
async def submit_leave(
    request: dict,
    auth_user: dict = Depends(verify_jwt)
):
    """Submit leave request"""
    leave_id = db.create_leave_request(
        teacher_id=auth_user["user_id"],
        start_date=request["start_date"],
        end_date=request["end_date"],
        reason=request["reason"],
        schedule_id=request.get("schedule_id")
    )
    
    return {"message": "Leave request submitted", "leave_id": leave_id}

@router.get("/leave")
async def get_leaves(
    auth_user: dict = Depends(verify_jwt),
    status: str = None
):
    """Get leave requests"""
    leaves = db.get_leaves_by_teacher(
        auth_user["user_id"],
        status
    )
    
    return {"leaves": leaves}

@router.get("/profile")
async def get_profile(
    auth_user: dict = Depends(verify_jwt)
):
    """Get user profile"""
    user = db.get_user(auth_user["user_id"])
    return {"user": user}

@router.post("/upload-avatar")
async def upload_avatar(
    avatar: UploadFile = File(...),
    auth_user: dict = Depends(verify_jwt)
):
    """Upload profile avatar photo"""
    import hashlib
    import time
    
    user_id = auth_user["user_id"]
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if avatar.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Format gambar harus JPG, PNG, atau WebP")
    
    # Validate file size (max 2MB)
    content = await avatar.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ukuran gambar maksimal 2MB")
    
    # Generate unique filename
    file_ext = avatar.filename.split(".")[-1] if "." in avatar.filename else "jpg"
    file_hash = hashlib.md5(f"{user_id}{time.time()}".encode()).hexdigest()
    filename = f"avatar_{user_id}_{file_hash}.{file_ext}"
    
    # For now, store as base64 in DB (in production, use S3/Cloud storage)
    import base64
    avatar_base64 = base64.b64encode(content).decode()
    avatar_url = f"data:{avatar.content_type};base64,{avatar_base64}"
    
    # Update user
    success = db.update_user(user_id, avatar_url=avatar_url)
    if not success:
        raise HTTPException(status_code=500, detail="Gagal menyimpan foto profil")
    
    return {"avatar_url": avatar_url}

@router.patch("/profile")
async def update_profile(
    request: dict,
    auth_user: dict = Depends(verify_jwt)
):
    """Update user profile (name, nip, phone)"""
    user_id = auth_user["user_id"]
    
    # Validate
    name = request.get("name", "").strip()
    nip = request.get("nip", "").strip()
    phone = request.get("phone", "").strip()
    
    if not name:
        raise HTTPException(status_code=400, detail="Nama tidak boleh kosong")
    
    # Check NIP uniqueness if provided
    if nip:
        # Skip validation if function doesn't exist (will be added to supabase.py)
        pass
    
    # Update
    success = db.update_user(user_id, name=name, nip=nip, phone=phone)
    if not success:
        raise HTTPException(status_code=500, detail="Gagal memperbarui profil")
    
    return {"message": "Profil berhasil diperbarui"}

@router.post("/change-password")
async def change_password(
    request: dict,
    auth_user: dict = Depends(verify_jwt)
):
    """Change user password"""
    import bcrypt
    
    current_password = request.get("current_password", "")
    new_password = request.get("new_password", "")
    
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Password lama dan baru harus diisi")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password minimal 6 karakter")
    
    user = db.get_user(auth_user["user_id"])
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=400, detail="User tidak ditemukan")
    
    # Verify current password
    if not bcrypt.checkpw(current_password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=400, detail="Password saat ini salah")
    
    # Hash new password
    new_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    
    # Update
    success = db.update_user(auth_user["user_id"], password_hash=new_hash)
    if not success:
        raise HTTPException(status_code=500, detail="Gagal mengubah password")
    
    return {"message": "Password berhasil diubah"}

@router.get("/my-schedules")
async def get_my_schedules(
    auth_user: dict = Depends(verify_jwt)
):
    """Get teacher's own grade schedules with enriched data (grade_name, subject_name, room_name, day_name) - optimized with caching"""
    schedules = await _get_cached_teacher_schedules(auth_user["user_id"])
    return {"schedules": schedules}

@router.get("/all-schedules")
async def get_all_schedules(
    auth_user: dict = Depends(verify_jwt)
):
    """Get all teacher's grade schedules (alias for my-schedules) - optimized with caching"""
    schedules = await _get_cached_teacher_schedules(auth_user["user_id"])
    return {"schedules": schedules}

@router.get("/attendance-stats")
async def get_attendance_stats(
    auth_user: dict = Depends(verify_jwt),
    year: int = None,
    month: int = None
):
    """Get attendance statistics using optimized RPC function"""
    import datetime
    now = datetime.datetime.now()
    target_year = year if year is not None else now.year
    target_month = month if month is not None else now.month
    
    # Use the RPC function for fast aggregated stats
    stats = await asyncio.get_event_loop().run_in_executor(
        None, db.get_monthly_attendance_stats, target_year, target_month
    )
    
    return {"stats": stats, "year": target_year, "month": target_month}

@router.get("/rooms")
async def get_rooms(
    auth_user: dict = Depends(verify_jwt)
):
    """Get all rooms (for schedule display) - optimized with caching"""
    rooms = await _get_cached_rooms()
    return {"rooms": rooms}
