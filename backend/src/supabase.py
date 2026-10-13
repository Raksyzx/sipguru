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
    
    async def _get_client(self):
        if self.client is None:
            self.client = await create_client(self.url, self.key)
        return self.client
    
    # User operations
    async def verify_credentials(self, email: str, password: str) -> Optional[dict]:
        """Verify email+password (placeholder - use Supabase Auth in production)"""
        client = await self._get_client()
        result = await client.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        if result.user:
            return {
                "id": result.user.id,
                "email": result.user.email,
                "role": "teacher"  # Default, check DB for actual role
            }
        return None
    
    async def get_user(self, user_id: str) -> Optional[dict]:
        """Get user by ID"""
        client = await self._get_client()
        result = await client.table("users").select("*").eq("id", user_id).execute()
        return result.data[0] if result.data else None
    
    async def get_user_by_email(self, email: str) -> Optional[dict]:
        """Get user by email"""
        client = await self._get_client()
        result = await client.table("users").select("*").eq("email", email).execute()
        return result.data[0] if result.data else None
    
    async def create_user(self, email: str, name: str, nip: str, 
                         role: str = "teacher", phone: str = None,
                         school_id: str = None) -> str:
        """Create new teacher user"""
        client = await self._get_client()
        result = await client.table("users").insert({
            "email": email,
            "name": name,
            "nip": nip,
            "role": role,
            "phone": phone,
            "school_id": school_id
        }).execute()
        return result.data[0]["id"]
    
    # School operations
    async def get_all_schools(self) -> List[dict]:
        """Get all schools"""
        client = await self._get_client()
        result = await client.table("schools").select("*").execute()
        return result.data
    
    # Room operations
    async def get_room(self, room_id: str) -> Optional[dict]:
        """Get room by ID"""
        client = await self._get_client()
        result = await client.table("rooms").select("*").eq("id", room_id).execute()
        return result.data[0] if result.data else None
    
    async def get_room_by_code(self, room_code: str) -> Optional[dict]:
        """Get room by code (for IoT devices)"""
        client = await self._get_client()
        result = await client.table("rooms").select("*").eq("room_code", room_code).execute()
        return result.data[0] if result.data else None
    
    async def get_all_rooms(self) -> List[dict]:
        """Get all rooms"""
        client = await self._get_client()
        result = await client.table("rooms").select("*").execute()
        return result.data
    
    async def create_room(self, school_id: str, name: str, room_code: str,
                         geolocation: str = None) -> str:
        """Create new room"""
        client = await self._get_client()
        result = await client.table("rooms").insert({
            "school_id": school_id,
            "name": name,
            "room_code": room_code,
            "geolocation": geolocation
        }).execute()
        return result.data[0]["id"]
    
    # Schedule operations
    async def get_schedule_by_teacher_and_day(self, teacher_id: str, 
                                              day_of_week: str, 
                                              room_id: str = None) -> Optional[dict]:
        """Get teacher's schedule for specific day and optionally room"""
        client = await self._get_client()
        query = client.table("schedules").select("*").eq("teacher_id", teacher_id).eq("day_of_week", day_of_week)
        if room_id:
            query = query.eq("room_id", room_id)
        result = await query.execute()
        return result.data[0] if result.data else None
    
    async def get_schedules_by_teacher_and_day(self, teacher_id: str, 
                                               day_of_week: str) -> List[dict]:
        """Get all schedules for teacher on specific day"""
        client = await self._get_client()
        result = await client.table("schedules").select("*").eq("teacher_id", teacher_id).eq("day_of_week", day_of_week).execute()
        return result.data
    
    async def get_all_schedules(self) -> List[dict]:
        """Get all schedules"""
        client = await self._get_client()
        result = await client.table("schedules").select("*").execute()
        return result.data
    
    async def create_schedule(self, teacher_id: str, room_id: str,
                             day_of_week: str, start_time: str, end_time: str) -> str:
        """Create new schedule"""
        client = await self._get_client()
        result = await client.table("schedules").insert({
            "teacher_id": teacher_id,
            "room_id": room_id,
            "day_of_week": day_of_week,
            "start_time": start_time,
            "end_time": end_time
        }).execute()
        return result.data[0]["id"]
    
    # Attendance operations
    async def create_attendance_log(self, teacher_id: str, room_id: str,
                                   status: str, geolocation: str = None,
                                   qr_token: str = None, device_fingerprint: str = None,
                                   lateness_minutes: int = None,
                                   admin_remarks: str = None) -> str:
        """Create new attendance log entry"""
        client = await self._get_client()
        result = await client.table("attendance_logs").insert({
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
    
    async def get_attendance_by_teacher_and_month(self, teacher_id: str,
                                                  year: int, month: int) -> List[dict]:
        """Get attendance logs for teacher in specific month"""
        client = await self._get_client()
        result = await client.table("attendance_logs").select("*").eq(
            "teacher_id", teacher_id
        ).gte("created_at", f"{year}-{month:02d}-01").lt(
            "created_at", f"{year}-{month:02d}-32"
        ).execute()
        return result.data
    
    async def get_daily_attendance_stats(self, date_str: str) -> dict:
        """Get attendance statistics for specific date"""
        client = await self._get_client()
        result = await client.table("attendance_logs").select("*").gte(
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
    
    async def get_monthly_attendance_stats(self, year: int, month: int) -> dict:
        """Get attendance statistics for specific month"""
        client = await self._get_client()
        result = await client.table("attendance_logs").select("*").gte(
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
    async def create_leave_request(self, teacher_id: str, start_date: str,
                                  end_date: str, reason: str) -> str:
        """Create new leave request"""
        client = await self._get_client()
        result = await client.table("leave_requests").insert({
            "teacher_id": teacher_id,
            "start_date": start_date,
            "end_date": end_date,
            "reason": reason
        }).execute()
        return result.data[0]["id"]
    
    async def get_leaves_by_teacher(self, teacher_id: str,
                                   status: str = None) -> List[dict]:
        """Get leave requests for teacher"""
        client = await self._get_client()
        query = client.table("leave_requests").select("*").eq("teacher_id", teacher_id)
        if status:
            query = query.eq("status", status)
        result = await query.execute()
        return result.data
    
    async def update_leave_status(self, leave_id: str, status: str,
                                  approved_by: str = None) -> bool:
        """Update leave request status"""
        client = await self._get_client()
        update_data = {"status": status}
        if approved_by:
            update_data["approved_by"] = approved_by
        result = await client.table("leave_requests").update(
            update_data
        ).eq("id", leave_id).execute()
        return bool(result.data)
    
    # Device binding operations
    async def get_device_binding(self, user_id: str, 
                                 device_fingerprint: str) -> Optional[dict]:
        """Get device binding record"""
        client = await self._get_client()
        result = await client.table("device_bindings").select("*").eq(
            "user_id", user_id
        ).eq("device_fingerprint", device_fingerprint).eq("is_active", True).execute()
        return result.data[0] if result.data else None
    
    async def create_device_binding(self, user_id: str,
                                   device_fingerprint: str) -> str:
        """Create or update device binding"""
        client = await self._get_client()
        existing = await self.get_device_binding(user_id, device_fingerprint)
        
        if existing:
            result = await client.table("device_bindings").update({
                "is_active": True,
                "last_used": "now()"
            }).eq("id", existing["id"]).execute()
            return result.data[0]["id"]
        else:
            result = await client.table("device_bindings").insert({
                "user_id": user_id,
                "device_fingerprint": device_fingerprint,
                "is_active": True
            }).execute()
            return result.data[0]["id"]
    
    async def get_pending_unbind_binding(self, user_id: str) -> Optional[dict]:
        """Get pending unbind device binding"""
        client = await self._get_client()
        result = await client.table("device_bindings").select("*").eq(
            "user_id", user_id
        ).not_.is_("unbind_code_hash", "null").eq("is_active", True).execute()
        return result.data[0] if result.data else None
    
    async def update_unbind_request(self, binding_id: str, 
                                   unbind_code_hash: str) -> bool:
        """Update device binding with unbind code hash"""
        client = await self._get_client()
        result = await client.table("device_bindings").update({
            "unbind_code_hash": unbind_code_hash,
            "unbind_request_at": "now()"
        }).eq("id", binding_id).execute()
        return bool(result.data)
    
    async def unlink_device(self, binding_id: str) -> bool:
        """Unlink device (set is_active to False)"""
        client = await self._get_client()
        result = await client.table("device_bindings").update({
            "is_active": False
        }).eq("id", binding_id).execute()
        return bool(result.data)
    
    # Audit log operations
    async def create_audit_log(self, user_id: str, action: str,
                              entity_type: str = None, entity_id: str = None,
                              details: dict = None, ip_address: str = None,
                              user_agent: str = None) -> str:
        """Create new audit log entry"""
        client = await self._get_client()
        result = await client.table("audit_logs").insert({
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
    async def get_all_teachers(self) -> List[dict]:
        """Get all teachers (admin only)"""
        client = await self._get_client()
        result = await client.table("users").select("*").eq("role", "teacher").execute()
        return result.data
