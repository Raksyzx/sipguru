"""Shared history boundaries, immutable session context, and aggregation."""

from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
import json

WIB = timezone(timedelta(hours=7))
CATEGORY_FIELDS = (
    "jurusan_id", "jurusan_name", "grade_id", "grade_name", "subject_id", "subject_name",
)


def history_dates(filter_type, year, month, day=None, week=None):
    now = datetime.now(WIB)
    year = year if year is not None else now.year
    month = month if month is not None else now.month
    last_day = monthrange(year, month)[1]
    if filter_type == "day":
        start = end = date(year, month, day if day is not None else now.day)
    elif filter_type == "week":
        week = week if week is not None else (now.day - 1) // 7 + 1
        start = date(year, month, (week - 1) * 7 + 1)
        end = date(year, month, min(week * 7, last_day))
    elif filter_type == "month":
        start, end = date(year, month, 1), date(year, month, last_day)
    elif filter_type == "year":
        start, end = date(year, 1, 1), date(year, 12, 31)
    else:
        raise ValueError("Periode history tidak valid")
    return start.isoformat(), end.isoformat()


def period_bounds(start_date, end_date):
    start = datetime.combine(date.fromisoformat(start_date), datetime.min.time(), WIB)
    end = datetime.combine(date.fromisoformat(end_date) + timedelta(days=1), datetime.min.time(), WIB)
    return start.isoformat(), end.isoformat()


def attendance_time(value):
    timestamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(WIB)


def session_context(db, schedule_id, token_type, lateness_minutes=0):
    """Capture names as well as IDs so later schedule edits cannot rewrite history."""
    schedule = db.get_grade_schedule(schedule_id)
    if not schedule:
        raise ValueError("Jadwal absensi tidak ditemukan")
    grade = db.get_grade(schedule["grade_id"]) or {}
    subject = db.get_subject(schedule["subject_id"]) or {}
    jurusan_id = grade.get("jurusan_id") or subject.get("jurusan_id")
    jurusan = db.get_jurusan(jurusan_id) if jurusan_id else None
    return {
        "schedule_id": schedule_id,
        "grade_id": schedule["grade_id"],
        "grade_name": grade.get("name"),
        "subject_id": schedule["subject_id"],
        "subject_name": subject.get("name"),
        "jurusan_id": jurusan_id,
        "jurusan_name": (jurusan or {}).get("name"),
        "jurusan_code": (jurusan or {}).get("code"),
        "token_type": token_type,
        "lateness_minutes": lateness_minutes or 0,
        "start_time": schedule.get("start_time"),
        "end_time": schedule.get("end_time"),
    }


def enrich_record(record):
    context = record.pop("attendance_context", None) or {}
    if isinstance(context, str):
        try:
            context = json.loads(context)
        except (ValueError, TypeError):
            context = {}
    if not isinstance(context, dict):
        context = {}
    for field in CATEGORY_FIELDS:
        record[field] = context.get(field)
    record["schedule_id"] = context.get("schedule_id")
    record["token_type"] = context.get("token_type")
    record["lateness_minutes"] = context.get("lateness_minutes", record.get("lateness_minutes")) or 0
    record["start_time"] = context.get("start_time")
    record["end_time"] = context.get("end_time")
    # Reports never need the QR credential or device fingerprint.
    for field in ("qr_token", "device_fingerprint", "admin_remarks"):
        record.pop(field, None)
    return record


def filter_categories(records, jurusan_id=None, grade_id=None, subject_id=None):
    filters = {"jurusan_id": jurusan_id, "grade_id": grade_id, "subject_id": subject_id}
    return [record for record in records if all(
        not value or record.get(field) == value for field, value in filters.items()
    )]


def summarize(records):
    total = len(records)
    on_time = sum(record["status"] == "on_time" for record in records)
    late = sum(record["status"] == "late" for record in records)
    lateness = sum(record.get("lateness_minutes", 0) or 0 for record in records if record["status"] == "late")
    return {
        "total": total, "on_time": on_time, "late": late,
        "attendance_rate": round(on_time / max(total, 1) * 100, 2),
        "avg_lateness_minutes": round(lateness / max(late, 1), 1),
        "unique_teachers": len({record["teacher_id"] for record in records}),
    }


def build_history(records, filter_type, year, month, day=None, week=None):
    start_date, end_date = history_dates(filter_type, year, month, day, week)
    days = {}
    groups = {}
    for record in records:
        date_str = attendance_time(record["created_at"]).date().isoformat()
        daily = days.setdefault(date_str, {
            "date": date_str, "teachers": [], "day_total": 0, "day_on_time": 0, "day_late": 0,
        })
        key = (date_str, record["teacher_id"], record.get("jurusan_id"), record.get("grade_id"), record.get("subject_id"))
        if key not in groups:
            groups[key] = {
                "teacher_id": record["teacher_id"], "teacher_name": record.get("teacher_name", ""),
                "nip": record.get("nip", ""), **{field: record.get(field) for field in CATEGORY_FIELDS},
                "total": 0, "on_time": 0, "late": 0, "avg_lateness": 0,
            }
            daily["teachers"].append(groups[key])
        group = groups[key]
        group["total"] += 1
        daily["day_total"] += 1
        if record["status"] == "on_time":
            group["on_time"] += 1
            daily["day_on_time"] += 1
        if record["status"] == "late":
            previous = group["avg_lateness"] * group["late"]
            group["late"] += 1
            group["avg_lateness"] = (previous + (record.get("lateness_minutes") or 0)) / group["late"]
            daily["day_late"] += 1
    for group in groups.values():
        group["avg_lateness"] = round(group["avg_lateness"], 1)
    return {
        "filter_type": filter_type, "period": {"year": year, "month": month, "day": day, "week": week},
        "start_date": start_date, "end_date": end_date, "summary": summarize(records),
        "history": sorted(days.values(), key=lambda item: item["date"], reverse=True),
    }


def build_sessions(records):
    """Return flat list of attendance sessions (one row per absensi) with schedule details."""
    sessions = []
    for record in records:
        created = attendance_time(record["created_at"])
        sessions.append({
            "date": created.date().isoformat(),
            "time": created.strftime("%H:%M"),
            "teacher_id": record["teacher_id"],
            "teacher_name": record.get("teacher_name", ""),
            "nip": record.get("nip", ""),
            "jurusan_id": record.get("jurusan_id"),
            "jurusan_name": record.get("jurusan_name"),
            "grade_id": record.get("grade_id"),
            "grade_name": record.get("grade_name"),
            "subject_id": record.get("subject_id"),
            "subject_name": record.get("subject_name"),
            "room_name": record.get("room_name", ""),
            "start_time": record.get("start_time"),
            "end_time": record.get("end_time"),
            "status": record["status"],
            "lateness_minutes": record.get("lateness_minutes") or 0,
        })
    return sorted(sessions, key=lambda s: (s["date"], s["time"], s["teacher_name"]), reverse=True)
