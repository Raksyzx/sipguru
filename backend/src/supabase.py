from src.config import settings
from supabase import create_client
from typing import Optional, Dict, Any, List
from datetime import date, time
import json

class SupabaseClient:
    def __init__(self):
        self.url = settings.SUPABASE_URL
        self.key = settings.SUPABASE_SERVICE_KEY
        self.client = None
    
    def _get_client(self):
        if self.client is None:
            self.client = create_client(self.url, self.key)
        return self.client
    
    # User operations
    def verify_credentials(self, email: str, password: str) -> Optional[dict]:
        """Verify email+password against public.users table"""
        client = self._get_client()
        result = client.table("users").select("*").eq("email", email).execute()
        if not result.data:
            return None
        
        user = result.data[0]
        # Verify password using bcrypt (stored in password_hash column)
        import bcrypt
        if not user.get("password_hash"):
            return None
        if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
            return None
        
        return {
            "id": user["id"],
            "email": user["email"],
            "role": user.get("role", "teacher")
        }
    
    def get_user(self, user_id: str) -> Optional[dict]:
        """Get user by ID"""
        client = self._get_client()
        result = client.table("users").select("*").eq("id", user_id).execute()
        return result.data[0] if result.data else None
    
    def get_user_by_email(self, email: str) -> Optional[dict]:
        """Get user by email"""
        client = self._get_client()
        result = client.table("users").select("*").eq("email", email).execute()
        return result.data[0] if result.data else None
    
    def create_user(self, email: str, name: str, nip: str, 
                    role: str = "teacher", phone: str = None,
                    school_id: str = None, password_hash: str = None) -> str:
        """Create new teacher user"""
        client = self._get_client()
        data = {
            "email": email,
            "name": name,
            "nip": nip,
            "role": role,
            "phone": phone,
            "school_id": school_id
        }
        if password_hash:
            data["password_hash"] = password_hash
        result = client.table("users").insert(data).execute()
        if not result.data:
            raise Exception(f"Failed to create user: {result}")
        return result.data[0]["id"]
    
    # School operations
    def get_all_schools(self) -> List[dict]:
        """Get all schools"""
        client = self._get_client()
        result = client.table("schools").select("*").execute()
        return result.data
    
    # Room operations
    def get_room(self, room_id: str) -> Optional[dict]:
        """Get room by ID"""
        client = self._get_client()
        result = client.table("rooms").select("*").eq("id", room_id).execute()
        return result.data[0] if result.data else None
    
    def get_room_by_code(self, room_code: str) -> Optional[dict]:
        """Get room by code (for IoT devices)"""
        client = self._get_client()
        result = client.table("rooms").select("*").eq("room_code", room_code).execute()
        return result.data[0] if result.data else None
    
    def get_all_rooms(self) -> List[dict]:
        """Get all rooms"""
        client = self._get_client()
        result = client.table("rooms").select("*").execute()
        return result.data
    
    def create_room(self, school_id: str, name: str, room_code: str,
                   geofence_radius: int = 150, geolocation: str = None) -> str:
        """Create new room"""
        client = self._get_client()
        result = client.table("rooms").insert({
            "school_id": school_id,
            "name": name,
            "room_code": room_code,
            "geofence_radius": geofence_radius,
            "geolocation": geolocation
        }).execute()
        return result.data[0]["id"]
    
    # Schedule operations
    def get_schedule_by_teacher_and_day(self, teacher_id: str, 
                                        day_of_week: str, 
                                        room_id: str = None) -> Optional[dict]:
        """Get teacher's schedule for specific day and optionally room"""
        client = self._get_client()
        query = client.table("schedules").select("*").eq("teacher_id", teacher_id).eq("day_of_week", day_of_week)
        if room_id:
            query = query.eq("room_id", room_id)
        result = query.execute()
        return result.data[0] if result.data else None
    
    def get_schedules_by_teacher_and_day(self, teacher_id: str, 
                                         day_of_week: str) -> List[dict]:
        """Get all schedules for teacher on specific day"""
        client = self._get_client()
        result = client.table("schedules").select("*").eq("teacher_id", teacher_id).eq("day_of_week", day_of_week).execute()
        return result.data
    
    def get_all_schedules(self) -> List[dict]:
        """Get all schedules"""
        client = self._get_client()
        result = client.table("schedules").select("*").execute()
        return result.data
    
    def create_schedule(self, teacher_id: str, room_id: str,
                       day_of_week: str, start_time: str, end_time: str) -> str:
        """Create new schedule"""
        client = self._get_client()
        result = client.table("schedules").insert({
            "teacher_id": teacher_id,
            "room_id": room_id,
            "day_of_week": day_of_week,
            "start_time": start_time,
            "end_time": end_time
        }).execute()
        return result.data[0]["id"]
    
    # Attendance operations
    def create_attendance_log(self, teacher_id: str, room_id: str,
                             status: str, geolocation: str = None,
                             qr_token: str = None, device_fingerprint: str = None,
                             lateness_minutes: int = None,
                             admin_remarks: str = None) -> str:
        """Create new attendance log entry"""
        client = self._get_client()
        result = client.table("attendance_logs").insert({
            "teacher_id": teacher_id,
            "room_id": room_id,
            "status": status,
            "geolocation": geolocation,
            "qr_token": qr_token,
            "device_fingerprint": device_fingerprint,
            "lateness_minutes": lateness_minutes,
            "admin_remarks": admin_remarks
        }).execute()
        return result.data[0]["id"]
    
    def get_attendance_by_teacher_and_month(self, teacher_id: str,
                                            year: int, month: int) -> List[dict]:
        """Get attendance logs for teacher in specific month"""
        client = self._get_client()
        result = client.table("attendance_logs").select("*").eq(
            "teacher_id", teacher_id
        ).gte("created_at", f"{year}-{month:02d}-01").lt(
            "created_at", f"{year}-{month:02d}-32"
        ).execute()
        return result.data
    
    def get_daily_attendance_stats(self, date_str: str) -> dict:
        """Get attendance statistics for specific date"""
        client = self._get_client()
        result = client.table("attendance_logs").select("*").gte(
            "created_at", f"{date_str}T00:00:00"
        ).lt("created_at", f"{date_str}T23:59:59").execute()
        
        stats = {
            "total": len(result.data),
            "on_time": len([x for x in result.data if x["status"] == "on_time"]),
            "late": len([x for x in result.data if x["status"] == "late"]),
            "absent": len([x for x in result.data if x["status"] == "absent"]),
            "deferred": len([x for x in result.data if x["status"] == "deferred"]),
            "approved": len([x for x in result.data if x["status"] == "approved"])
        }
        return stats
    
    def get_monthly_attendance_stats(self, year: int, month: int) -> dict:
        """Get attendance statistics for specific month"""
        client = self._get_client()
        result = client.table("attendance_logs").select("*").gte(
            "created_at", f"{year}-{month:02d}-01"
        ).lt("created_at", f"{year}-{month:02d}-32").execute()
        
        stats = {
            "total": len(result.data),
            "on_time": len([x for x in result.data if x["status"] == "on_time"]),
            "late": len([x for x in result.data if x["status"] == "late"]),
            "absent": len([x for x in result.data if x["status"] == "absent"]),
            "deferred": len([x for x in result.data if x["status"] == "deferred"]),
            "approved": len([x for x in result.data if x["status"] == "approved"])
        }
        return stats
    
    # Leave operations
    def create_leave_request(self, teacher_id: str, start_date: str,
                            end_date: str, reason: str) -> str:
        """Create new leave request"""
        client = self._get_client()
        result = client.table("leave_requests").insert({
            "teacher_id": teacher_id,
            "start_date": start_date,
            "end_date": end_date,
            "reason": reason
        }).execute()
        return result.data[0]["id"]
    
    def get_leaves_by_teacher(self, teacher_id: str,
                             status: str = None) -> List[dict]:
        """Get leave requests for teacher"""
        client = self._get_client()
        query = client.table("leave_requests").select("*").eq("teacher_id", teacher_id)
        if status:
            query = query.eq("status", status)
        result = query.execute()
        return result.data
    
    def update_leave_status(self, leave_id: str, status: str,
                            approved_by: str = None) -> bool:
        """Update leave request status"""
        client = self._get_client()
        update_data = {"status": status}
        if approved_by:
            update_data["approved_by"] = approved_by
        result = client.table("leave_requests").update(
            update_data
        ).eq("id", leave_id).execute()
        return bool(result.data)
    
    # Device binding operations
    def get_device_binding(self, user_id: str, 
                           device_fingerprint: str) -> Optional[dict]:
        """Get device binding record"""
        client = self._get_client()
        result = client.table("device_bindings").select("*").eq(
            "user_id", user_id
        ).eq("device_fingerprint", device_fingerprint).eq("is_active", True).execute()
        return result.data[0] if result.data else None
    
    def create_device_binding(self, user_id: str,
                             device_fingerprint: str) -> str:
        """Create or update device binding"""
        client = self._get_client()
        existing = self.get_device_binding(user_id, device_fingerprint)
        
        if existing:
            result = client.table("device_bindings").update({
                "is_active": True,
                "last_used": "now()"
            }).eq("id", existing["id"]).execute()
            return result.data[0]["id"]
        else:
            result = client.table("device_bindings").insert({
                "user_id": user_id,
                "device_fingerprint": device_fingerprint,
                "is_active": True
            }).execute()
            return result.data[0]["id"]
    
    def get_pending_unbind_binding(self, user_id: str) -> Optional[dict]:
        """Get pending unbind device binding"""
        client = self._get_client()
        result = client.table("device_bindings").select("*").eq(
            "user_id", user_id
        ).not_.is_("unbind_code_hash", "null").eq("is_active", True).execute()
        return result.data[0] if result.data else None
    
    def update_unbind_request(self, binding_id: str, 
                             unbind_code_hash: str) -> bool:
        """Update device binding with unbind code hash"""
        client = self._get_client()
        result = client.table("device_bindings").update({
            "unbind_code_hash": unbind_code_hash,
            "unbind_request_at": "now()"
        }).eq("id", binding_id).execute()
        return bool(result.data)
    
    def unlink_device(self, binding_id: str) -> bool:
        """Unlink device (set is_active to False)"""
        client = self._get_client()
        result = client.table("device_bindings").update({
            "is_active": False
        }).eq("id", binding_id).execute()
        return bool(result.data)
    
    # Audit log operations
    def create_audit_log(self, user_id: str, action: str,
                        entity_type: str = None, entity_id: str = None,
                        details: dict = None, ip_address: str = None,
                        user_agent: str = None) -> str:
        """Create new audit log entry"""
        client = self._get_client()
        result = client.table("audit_logs").insert({
            "user_id": user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": json.dumps(details) if details else None,
            "ip_address": ip_address,
            "user_agent": user_agent
        }).execute()
        return result.data[0]["id"]
    
    # Teacher operations
    def get_all_teachers(self) -> List[dict]:
        """Get all teachers (admin only)"""
        client = self._get_client()
        result = client.table("users").select("*").eq("role", "teacher").execute()
        return result.data

    def is_email_taken(self, email: str, exclude_id: str = None) -> bool:
        """Check if email already exists"""
        client = self._get_client()
        query = client.table("users").select("id").eq("email", email)
        if exclude_id:
            query = query.neq("id", exclude_id)
        result = query.execute()
        return len(result.data) > 0

    def is_nip_taken(self, nip: str, exclude_id: str = None) -> bool:
        """Check if NIP already exists"""
        client = self._get_client()
        query = client.table("users").select("id").eq("nip", nip)
        if exclude_id:
            query = query.neq("id", exclude_id)
        result = query.execute()
        return len(result.data) > 0

    # Jurusan operations
    def get_all_jurusan(self, school_id: str = None) -> List[dict]:
        """Get all jurusan"""
        client = self._get_client()
        query = client.table("jurusan").select("*")
        if school_id:
            query = query.eq("school_id", school_id)
        result = query.execute()
        return result.data

    def get_jurusan(self, jurusan_id: str) -> Optional[dict]:
        """Get jurusan by ID"""
        client = self._get_client()
        result = client.table("jurusan").select("*").eq("id", jurusan_id).execute()
        return result.data[0] if result.data else None

    def create_jurusan(self, school_id: str, name: str, code: str, description: str = None) -> str:
        """Create new jurusan"""
        client = self._get_client()
        result = client.table("jurusan").insert({
            "school_id": school_id,
            "name": name,
            "code": code,
            "description": description
        }).execute()
        return result.data[0]["id"]

    def update_jurusan(self, jurusan_id: str, **fields) -> bool:
        """Update jurusan"""
        client = self._get_client()
        result = client.table("jurusan").update(fields).eq("id", jurusan_id).execute()
        return bool(result.data)

    def delete_jurusan(self, jurusan_id: str) -> bool:
        """Delete jurusan"""
        client = self._get_client()
        result = client.table("jurusan").delete().eq("id", jurusan_id).execute()
        return bool(result.data)

    # Subjects operations
    def get_all_subjects(self, school_id: str = None) -> List[dict]:
        """Get all subjects"""
        client = self._get_client()
        query = client.table("subjects").select("*")
        if school_id:
            query = query.eq("school_id", school_id)
        result = query.execute()
        return result.data

    def get_subject(self, subject_id: str) -> Optional[dict]:
        """Get subject by ID"""
        client = self._get_client()
        result = client.table("subjects").select("*").eq("id", subject_id).execute()
        return result.data[0] if result.data else None

    def create_subject(self, name: str, code: str, jurusan_id: str, school_id: str, description: str = None) -> str:
        """Create new subject"""
        client = self._get_client()
        result = client.table("subjects").insert({
            "name": name,
            "code": code,
            "jurusan_id": jurusan_id,
            "school_id": school_id,
            "description": description
        }).execute()
        return result.data[0]["id"]

    def update_subject(self, subject_id: str, **fields) -> bool:
        """Update subject"""
        client = self._get_client()
        result = client.table("subjects").update(fields).eq("id", subject_id).execute()
        return bool(result.data)

    def delete_subject(self, subject_id: str) -> bool:
        """Delete subject"""
        client = self._get_client()
        result = client.table("subjects").delete().eq("id", subject_id).execute()
        return bool(result.data)

    # Grades operations
    def get_all_grades(self, school_id: str = None) -> List[dict]:
        """Get all grades"""
        client = self._get_client()
        query = client.table("grades").select("*")
        if school_id:
            query = query.eq("school_id", school_id)
        result = query.execute()
        return result.data

    def get_grade(self, grade_id: str) -> Optional[dict]:
        """Get grade by ID"""
        client = self._get_client()
        result = client.table("grades").select("*").eq("id", grade_id).execute()
        return result.data[0] if result.data else None

    def create_grade(self, jurusan_id: str, school_id: str, name: str, grade_level: int) -> str:
        """Create new grade"""
        client = self._get_client()
        result = client.table("grades").insert({
            "jurusan_id": jurusan_id,
            "school_id": school_id,
            "name": name,
            "grade_level": grade_level
        }).execute()
        return result.data[0]["id"]

    def update_grade(self, grade_id: str, **fields) -> bool:
        """Update grade"""
        client = self._get_client()
        result = client.table("grades").update(fields).eq("id", grade_id).execute()
        return bool(result.data)

    def delete_grade(self, grade_id: str) -> bool:
        """Delete grade"""
        client = self._get_client()
        result = client.table("grades").delete().eq("id", grade_id).execute()
        return bool(result.data)

    # Grade Schedules operations
    def get_all_grade_schedules(self, school_id: str = None) -> List[dict]:
        """Get all grade schedules"""
        client = self._get_client()
        query = client.table("grade_schedules").select("*")
        if school_id:
            query = query.eq("school_id", school_id)
        result = query.execute()
        return result.data

    def get_grade_schedules_by_grade(self, grade_id: str) -> List[dict]:
        """Get grade schedules by grade"""
        client = self._get_client()
        result = client.table("grade_schedules").select("*").eq("grade_id", grade_id).execute()
        return result.data

    def get_grade_schedules_by_teacher(self, teacher_id: str) -> List[dict]:
        """Get grade schedules by teacher"""
        client = self._get_client()
        result = client.table("grade_schedules").select("*").eq("teacher_id", teacher_id).execute()
        return result.data

    def get_grade_schedule(self, schedule_id: str) -> Optional[dict]:
        """Get grade schedule by ID"""
        client = self._get_client()
        result = client.table("grade_schedules").select("*").eq("id", schedule_id).execute()
        return result.data[0] if result.data else None

    def create_grade_schedule(self, grade_id: str, subject_id: str, teacher_id: str,
                             day_of_week: str, start_time: str, end_time: str,
                             room_id: str = None) -> str:
        """Create new grade schedule"""
        client = self._get_client()
        result = client.table("grade_schedules").insert({
            "grade_id": grade_id,
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "day_of_week": day_of_week,
            "start_time": start_time,
            "end_time": end_time,
            "room_id": room_id
        }).execute()
        return result.data[0]["id"]

    def update_grade_schedule(self, schedule_id: str, **fields) -> bool:
        """Update grade schedule"""
        client = self._get_client()
        result = client.table("grade_schedules").update(fields).eq("id", schedule_id).execute()
        return bool(result.data)

    def delete_grade_schedule(self, schedule_id: str) -> bool:
        """Delete grade schedule"""
        client = self._get_client()
        result = client.table("grade_schedules").delete().eq("id", schedule_id).execute()
        return bool(result.data)

    # QR Token operations
    def get_all_qr_tokens(self, active_only: bool = True) -> List[dict]:
        """Get all QR tokens"""
        client = self._get_client()
        query = client.table("qr_tokens").select("*")
        if active_only:
            query = query.eq("is_active", True)
        result = query.execute()
        return result.data

    def get_qr_tokens_by_schedule(self, schedule_id: str) -> List[dict]:
        """Get QR tokens by schedule"""
        client = self._get_client()
        result = client.table("qr_tokens").select("*").eq("schedule_id", schedule_id).execute()
        return result.data

    def create_qr_token(self, schedule_id: str, room_id: str, grade_id: str,
                       subject_id: str, teacher_id: str, token: str, expires_at: str) -> str:
        """Create new QR token"""
        client = self._get_client()
        result = client.table("qr_tokens").insert({
            "schedule_id": schedule_id,
            "room_id": room_id,
            "grade_id": grade_id,
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "token": token,
            "expires_at": expires_at
        }).execute()
        return result.data[0]["id"]

    def deactivate_qr_token(self, token_id: str) -> bool:
        """Deactivate QR token"""
        client = self._get_client()
        result = client.table("qr_tokens").update({"is_active": False}).eq("id", token_id).execute()
        return bool(result.data)

    # User operations (additional)
    def update_user(self, user_id: str, **fields) -> bool:
        """Update user"""
        client = self._get_client()
        result = client.table("users").update(fields).eq("id", user_id).execute()
        return bool(result.data)

    def delete_user(self, user_id: str) -> bool:
        """Delete user"""
        client = self._get_client()
        result = client.table("users").delete().eq("id", user_id).execute()
        return bool(result.data)

    # Leave operations (additional)
    def get_all_leaves(self, status: str = None) -> List[dict]:
        """Get all leave requests"""
        client = self._get_client()
        query = client.table("leave_requests").select("*")
        if status:
            query = query.eq("status", status)
        result = query.execute()
        return result.data

    # Schedule operations (additional)
    def update_schedule(self, schedule_id: str, **fields) -> bool:
        """Update schedule"""
        client = self._get_client()
        result = client.table("schedules").update(fields).eq("id", schedule_id).execute()
        return bool(result.data)

    def delete_schedule(self, schedule_id: str) -> bool:
        """Delete schedule"""
        client = self._get_client()
        result = client.table("schedules").delete().eq("id", schedule_id).execute()
        return bool(result.data)
