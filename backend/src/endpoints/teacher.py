from src.config import settings
from src.database import get_db

from fastapi import APIRouter, HTTPException, Depends
from src.deps import get_current_user as verify_jwt

router = APIRouter()
db = get_db()

@router.get("/todays-schedule")
async def get_todays_schedule(
    auth_user: dict = Depends(verify_jwt)
):
    """Get teacher's schedule for today"""
    import datetime
    day_name = datetime.datetime.now().strftime("%A")
    
    schedules = db.get_schedules_by_teacher_and_day(
        auth_user["user_id"],
        day_name
    )
    
    return {"schedules": schedules, "day": day_name}

@router.get("/history")
async def get_attendance_history(
    auth_user: dict = Depends(verify_jwt),
    month: int = None,
    year: int = None
):
    """Get attendance history"""
    if month is None:
        month = 10
    if year is None:
        year = 2026
    
    history = db.get_attendance_by_teacher_and_month(
        auth_user["user_id"],
        year,
        month
    )
    
    return {"history": history, "month": month, "year": year}

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

@router.get("/my-schedules")
async def get_my_schedules(
    auth_user: dict = Depends(verify_jwt)
):
    """Get teacher's own grade schedules with jurusan/mapel info"""
    schedules = db.get_grade_schedules_by_teacher(auth_user["user_id"])
    return {"schedules": schedules}

@router.get("/rooms")
async def get_rooms(
    auth_user: dict = Depends(verify_jwt)
):
    """Get all rooms (for schedule display)"""
    return {"rooms": db.get_all_rooms()}
