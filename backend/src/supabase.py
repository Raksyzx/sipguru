from src.config import settings
from supabase import create_client, Client
from typing import Optional, Dict, Any, List
from datetime import date, time
import json
import time
import logging
from functools import wraps
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Query execution time threshold for logging (in seconds)
SLOW_QUERY_THRESHOLD = 0.5

# Timeout settings (in seconds)
DEFAULT_TIMEOUT = 30
READ_TIMEOUT = 10
WRITE_TIMEOUT = 15

# Retry settings
MAX_RETRIES = 3
RETRY_DELAY = 1  # Base delay in seconds
RETRY_MAX_DELAY = 10  # Maximum delay between retries

# Connection pool settings
CONNECTION_POOL_SIZE = 10
CONNECTION_POOL_TTL = 60  # seconds

# Day name mapping: English -> Indonesian
DAY_NAME_MAP = {
    "Monday": "Senin",
    "Tuesday": "Selasa",
    "Wednesday": "Rabu",
    "Thursday": "Kamis",
    "Friday": "Jumat",
    "Saturday": "Sabtu",
    "Sunday": "Minggu",
}

def get_day_name_indonesian(day_name_en: str) -> str:
    """Convert English day name to Indonesian."""
    return DAY_NAME_MAP.get(day_name_en, day_name_en)


def log_query_time(func):
    """Decorator to log query execution time."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            elapsed = time.time() - start_time
            if elapsed > SLOW_QUERY_THRESHOLD:
                logger.warning(f"Slow query: {func.__name__} took {elapsed:.3f}s")
            else:
                logger.debug(f"Query: {func.__name__} took {elapsed:.3f}s")
            return result
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"Query failed: {func.__name__} after {elapsed:.3f}s - {str(e)}")
            raise
    return wrapper


def create_http_client_with_pool():
    """Create an HTTP client with connection pooling and timeout settings."""
    limits = httpx.Limits(
        max_connections=CONNECTION_POOL_SIZE,
        max_keepalive_connections=CONNECTION_POOL_SIZE // 2,
        keepalive_expiry=CONNECTION_POOL_TTL
    )
    timeout = httpx.Timeout(
        timeout=DEFAULT_TIMEOUT,
        connect=10.0,
        read=READ_TIMEOUT,
        write=WRITE_TIMEOUT
    )
    return httpx.Client(limits=limits, timeout=timeout)


class SupabaseClient:
    def __init__(self):
        self.url = settings.SUPABASE_URL
        self.key = settings.SUPABASE_SERVICE_ROLE_KEY
        self.client = None
        self._http_client = None
    
    def _get_http_client(self):
        """Get or create HTTP client with connection pooling."""
        if self._http_client is None:
            self._http_client = create_http_client_with_pool()
        return self._http_client
    
    def _get_client(self) -> Client:
        """Get or create Supabase client."""
        if self.client is None:
            self.client = create_client(self.url, self.key)
        return self.client
    
    def close(self):
        """Close HTTP client connection pool."""
        if self._http_client:
            self._http_client.close()
            self._http_client = None
        if self.client:
            self.client = None
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
    
    # Retry decorator for network operations
    def _retry_on_network_error(self, func):
        """Apply retry logic to network operations."""
        @retry(
            stop=stop_after_attempt(MAX_RETRIES),
            wait=wait_exponential(multiplier=RETRY_DELAY, max=RETRY_MAX_DELAY),
            retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException, httpx.RemoteProtocolError)),
            reraise=True
        )
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        return wrapper
    
    # User operations
    @log_query_time
    def verify_credentials(self, email: str, password: str) -> Optional[dict]:
        """Verify email+password against public.users table"""
        client = self._get_client()
        result = client.table("users").select("id,email,role,password_hash").eq("email", email).execute()
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
    
    @log_query_time
    def get_user(self, user_id: str) -> Optional[dict]:
        """Get user by ID"""
        client = self._get_client()
        result = client.table("users").select("id,email,name,role,nip,phone,school_id").eq("id", user_id).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
    def get_user_by_email(self, email: str) -> Optional[dict]:
        """Get user by email"""
        client = self._get_client()
        result = client.table("users").select("id,email,name,role,nip,phone,school_id").eq("email", email).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
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
    
    @log_query_time
    def update_user(self, user_id: str, **fields) -> bool:
        """Update user"""
        client = self._get_client()
        result = client.table("users").update(fields).eq("id", user_id).execute()
        return bool(result.data)
    
    @log_query_time
    def delete_user(self, user_id: str) -> bool:
        """Delete user"""
        client = self._get_client()
        result = client.table("users").delete().eq("id", user_id).execute()
        return bool(result.data)
    
    # School operations
    @log_query_time
    def get_all_schools(self) -> List[dict]:
        """Get all schools"""
        client = self._get_client()
        result = client.table("schools").select("id,name,address,phone").execute()
        return result.data
    
    # Room operations
    @log_query_time
    def get_room(self, room_id: str) -> Optional[dict]:
        """Get room by ID"""
        client = self._get_client()
        result = client.table("rooms").select("id,name,room_code,school_id,geofence_radius,geolocation").eq("id", room_id).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
    def get_room_by_code(self, room_code: str) -> Optional[dict]:
        """Get room by code (for IoT devices)"""
        client = self._get_client()
        result = client.table("rooms").select("id,name,room_code,school_id,geofence_radius,geolocation").eq("room_code", room_code).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
    def get_all_rooms(self) -> List[dict]:
        """Get all rooms"""
        client = self._get_client()
        result = client.table("rooms").select("id,name,room_code,school_id,geofence_radius,geolocation").execute()
        return result.data
    
    @log_query_time
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
    
    @log_query_time
    def update_room(self, room_id: str, name: str = None, room_code: str = None,
                   geofence_radius: int = None, geolocation: str = None) -> bool:
        """Update room"""
        client = self._get_client()
        fields = {}
        if name:
            fields["name"] = name
        if room_code:
            fields["room_code"] = room_code
        if geofence_radius is not None:
            fields["geofence_radius"] = geofence_radius
        if geolocation:
            fields["geolocation"] = geolocation
        result = client.table("rooms").update(fields).eq("id", room_id).execute()
        return bool(result.data)
    
    @log_query_time
    def delete_room(self, room_id: str) -> bool:
        """Delete room"""
        client = self._get_client()
        result = client.table("rooms").delete().eq("id", room_id).execute()
        return bool(result.data)
    
    # Schedule operations
    @log_query_time
    def get_schedule_by_teacher_and_day(self, teacher_id: str, 
                                        day_of_week: str, 
                                        room_id: str = None) -> Optional[dict]:
        """Get teacher's schedule for specific day and optionally room"""
        client = self._get_client()
        query = client.table("schedules").select("id,teacher_id,room_id,day_of_week,start_time,end_time").eq("teacher_id", teacher_id).eq("day_of_week", day_of_week)
        if room_id:
            query = query.eq("room_id", room_id)
        result = query.execute()
        return result.data[0] if result.data else None
    
    @log_query_time
    def get_schedules_by_teacher_and_day(self, teacher_id: str, 
                                         day_of_week: str) -> List[dict]:
        """Get all schedules for teacher on specific day"""
        client = self._get_client()
        result = client.table("schedules").select("id,teacher_id,room_id,day_of_week,start_time,end_time").eq("teacher_id", teacher_id).eq("day_of_week", day_of_week).execute()
        return result.data
    
    @log_query_time
    def get_all_schedules(self) -> List[dict]:
        """Get all schedules"""
        client = self._get_client()
        result = client.table("schedules").select("id,teacher_id,room_id,day_of_week,start_time,end_time").execute()
        return result.data
    
    @log_query_time
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
    
    @log_query_time
    def update_schedule(self, schedule_id: str, **fields) -> bool:
        """Update schedule"""
        client = self._get_client()
        result = client.table("schedules").update(fields).eq("id", schedule_id).execute()
        return bool(result.data)
    
    @log_query_time
    def delete_schedule(self, schedule_id: str) -> bool:
        """Delete schedule"""
        client = self._get_client()
        result = client.table("schedules").delete().eq("id", schedule_id).execute()
        return bool(result.data)
    
    # Attendance operations
    @log_query_time
    def create_attendance_log(self, teacher_id: str, room_id: str,
                             status: str, geolocation: str = None,
                             qr_token: str = None, device_fingerprint: str = None,
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
            "admin_remarks": admin_remarks
        }).execute()
        return result.data[0]["id"]
    
    @log_query_time
    def get_attendance_by_teacher_and_month(self, teacher_id: str,
                                            year: int, month: int) -> List[dict]:
        """Get attendance logs for teacher in specific month"""
        client = self._get_client()
        # Use explicit date range for better index utilization
        start_date = f"{year}-{month:02d}-01T00:00:00"
        # Calculate end of month properly
        if month == 12:
            end_year = year + 1
            end_month = 1
        else:
            end_year = year
            end_month = month + 1
        end_date = f"{end_year}-{end_month:02d}-01T00:00:00"
        
        result = client.table("attendance_logs").select(
            "id,teacher_id,room_id,status,geolocation,created_at"
        ).eq("teacher_id", teacher_id).gte("created_at", start_date).lt("created_at", end_date).execute()
        return result.data
    
    @log_query_time
    def get_daily_attendance_stats(self, date_str: str) -> dict:
        """Get attendance statistics for specific date"""
        client = self._get_client()
        start_datetime = f"{date_str}T00:00:00"
        end_datetime = f"{date_str}T23:59:59.999"
        
        # Use COUNT queries for efficiency instead of fetching all rows
        stats = {"total": 0, "on_time": 0, "late": 0, "absent": 0, "deferred": 0, "approved": 0}
        
        for status in ["on_time", "late", "absent", "deferred", "approved"]:
            count_result = client.table("attendance_logs").select("*", count="exact").gte(
                "created_at", start_datetime
            ).lt("created_at", end_datetime).eq("status", status).execute()
            stats[status] = count_result.count if hasattr(count_result, 'count') else 0
        
        stats["total"] = sum(stats.values())
        return stats
    
    @log_query_time
    def get_monthly_attendance_stats(self, year: int, month: int) -> dict:
        """Get attendance statistics for specific month using COUNT query"""
        client = self._get_client()
        
        start_date = f"{year}-{month:02d}-01T00:00:00"
        if month == 12:
            end_year = year + 1
            end_month = 1
        else:
            end_year = year
            end_month = month + 1
        end_date = f"{end_year}-{end_month:02d}-01T00:00:00"
        
        # Try RPC function first
        result = client.rpc("get_attendance_stats", {
            "target_month": start_date,
            "target_end": end_date
        }).execute()
        
        if result.data and len(result.data) > 0:
            stats = result.data[0]
            return {
                "total": stats.get("total_count", 0),
                "on_time": stats.get("on_time_count", 0),
                "late": stats.get("late_count", 0),
                "absent": stats.get("absent_count", 0),
                "deferred": stats.get("deferred_count", 0),
                "approved": stats.get("approved_count", 0)
            }
        
        # Fallback: manual count if RPC function not available
        stats = {"total": 0, "on_time": 0, "late": 0, "absent": 0, "deferred": 0, "approved": 0}
        for status in ["on_time", "late", "absent", "deferred", "approved"]:
            count_result = client.table("attendance_logs").select("*", count="exact").gte(
                "created_at", start_date
            ).lt("created_at", end_date).eq("status", status).execute()
            stats[status] = count_result.count if hasattr(count_result, 'count') else 0
        stats["total"] = sum(stats.values())
        return stats
    
    # Leave operations
    @log_query_time
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
    
    @log_query_time
    def get_leaves_by_teacher(self, teacher_id: str,
                             status: str = None) -> List[dict]:
        """Get leave requests for teacher"""
        client = self._get_client()
        query = client.table("leave_requests").select("id,teacher_id,start_date,end_date,reason,status,approved_by").eq("teacher_id", teacher_id)
        if status:
            query = query.eq("status", status)
        result = query.execute()
        return result.data
    
    @log_query_time
    def get_all_leaves(self, status: str = None) -> List[dict]:
        """Get all leave requests"""
        client = self._get_client()
        query = client.table("leave_requests").select("id,teacher_id,start_date,end_date,reason,status,approved_by")
        if status:
            query = query.eq("status", status)
        result = query.execute()
        return result.data
    
    @log_query_time
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
    @log_query_time
    def get_device_binding(self, user_id: str, 
                           device_fingerprint: str) -> Optional[dict]:
        """Get device binding record"""
        client = self._get_client()
        result = client.table("device_bindings").select("id,user_id,device_fingerprint,is_active,last_used").eq(
            "user_id", user_id
        ).eq("device_fingerprint", device_fingerprint).eq("is_active", True).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
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
    
    @log_query_time
    def get_pending_unbind_binding(self, user_id: str) -> Optional[dict]:
        """Get pending unbind device binding"""
        client = self._get_client()
        result = client.table("device_bindings").select("id,user_id,unbind_code_hash,unbind_request_at,is_active").eq(
            "user_id", user_id
        ).not_.is_("unbind_code_hash", "null").eq("is_active", True).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
    def update_unbind_request(self, binding_id: str, 
                             unbind_code_hash: str) -> bool:
        """Update device binding with unbind code hash"""
        client = self._get_client()
        result = client.table("device_bindings").update({
            "unbind_code_hash": unbind_code_hash,
            "unbind_request_at": "now()"
        }).eq("id", binding_id).execute()
        return bool(result.data)
    
    @log_query_time
    def unlink_device(self, binding_id: str) -> bool:
        """Unlink device (set is_active to False)"""
        client = self._get_client()
        result = client.table("device_bindings").update({
            "is_active": False
        }).eq("id", binding_id).execute()
        return bool(result.data)
    
    # Audit log operations
    @log_query_time
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
    @log_query_time
    def get_all_teachers(self) -> List[dict]:
        """Get all teachers (admin only)"""
        client = self._get_client()
        result = client.table("users").select("id,email,name,role,nip,phone,school_id").eq("role", "teacher").execute()
        return result.data
    
    @log_query_time
    def is_email_taken(self, email: str, exclude_id: str = None) -> bool:
        """Check if email already exists"""
        client = self._get_client()
        query = client.table("users").select("id", count="exact").eq("email", email)
        if exclude_id:
            query = query.neq("id", exclude_id)
        result = query.execute()
        return result.count > 0 if hasattr(result, 'count') else len(result.data) > 0
    
    @log_query_time
    def is_nip_taken(self, nip: str, exclude_id: str = None) -> bool:
        """Check if NIP already exists"""
        client = self._get_client()
        query = client.table("users").select("id", count="exact").eq("nip", nip)
        if exclude_id:
            query = query.neq("id", exclude_id)
        result = query.execute()
        return result.count > 0 if hasattr(result, 'count') else len(result.data) > 0
    
    # Jurusan operations
    @log_query_time
    def get_all_jurusan(self, school_id: str = None) -> List[dict]:
        """Get all jurusan"""
        client = self._get_client()
        query = client.table("jurusan").select("id,name,code,school_id,description")
        if school_id:
            query = query.eq("school_id", school_id)
        result = query.execute()
        return result.data
    
    @log_query_time
    def get_jurusan(self, jurusan_id: str) -> Optional[dict]:
        """Get jurusan by ID"""
        client = self._get_client()
        result = client.table("jurusan").select("id,name,code,school_id,description").eq("id", jurusan_id).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
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
    
    @log_query_time
    def update_jurusan(self, jurusan_id: str, **fields) -> bool:
        """Update jurusan"""
        client = self._get_client()
        result = client.table("jurusan").update(fields).eq("id", jurusan_id).execute()
        return bool(result.data)
    
    @log_query_time
    def delete_jurusan(self, jurusan_id: str) -> bool:
        """Delete jurusan with cascade (remove from grades & subjects first)"""
        client = self._get_client()
        # 1. Remove jurusan_id from grades that reference it
        client.table("grades").update({"jurusan_id": None}).eq("jurusan_id", jurusan_id).execute()
        # 2. Remove jurusan_id from subjects that reference it
        client.table("subjects").update({"jurusan_id": None}).eq("jurusan_id", jurusan_id).execute()
        # 3. Delete jurusan
        result = client.table("jurusan").delete().eq("id", jurusan_id).execute()
        return bool(result.data)
    
    # Subjects operations
    @log_query_time
    def get_all_subjects(self, school_id: str = None) -> List[dict]:
        """Get all subjects"""
        client = self._get_client()
        query = client.table("subjects").select("id,name,code,jurusan_id,school_id,description")
        if school_id:
            query = query.eq("school_id", school_id)
        result = query.execute()
        return result.data
    
    @log_query_time
    def get_subject(self, subject_id: str) -> Optional[dict]:
        """Get subject by ID"""
        client = self._get_client()
        result = client.table("subjects").select("id,name,code,jurusan_id,school_id,description").eq("id", subject_id).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
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
    
    @log_query_time
    def update_subject(self, subject_id: str, **fields) -> bool:
        """Update subject"""
        client = self._get_client()
        result = client.table("subjects").update(fields).eq("id", subject_id).execute()
        return bool(result.data)
    
    @log_query_time
    def delete_subject(self, subject_id: str) -> bool:
        """Delete subject"""
        client = self._get_client()
        result = client.table("subjects").delete().eq("id", subject_id).execute()
        return bool(result.data)
    
    # Grades operations
    @log_query_time
    def get_all_grades(self, school_id: str = None) -> List[dict]:
        """Get all grades"""
        client = self._get_client()
        query = client.table("grades").select("id,name,jurusan_id,school_id,grade_level")
        if school_id:
            query = query.eq("school_id", school_id)
        result = query.execute()
        return result.data
    
    @log_query_time
    def get_grade(self, grade_id: str) -> Optional[dict]:
        """Get grade by ID"""
        client = self._get_client()
        result = client.table("grades").select("id,name,jurusan_id,school_id,grade_level").eq("id", grade_id).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
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
    
    @log_query_time
    def update_grade(self, grade_id: str, **fields) -> bool:
        """Update grade"""
        client = self._get_client()
        result = client.table("grades").update(fields).eq("id", grade_id).execute()
        return bool(result.data)
    
    @log_query_time
    def delete_grade(self, grade_id: str) -> bool:
        """Delete grade"""
        client = self._get_client()
        result = client.table("grades").delete().eq("id", grade_id).execute()
        return bool(result.data)
    
    # Grade Schedules operations - Optimized with batch operations
    @log_query_time
    def get_all_grade_schedules(self, school_id: str = None) -> List[dict]:
        """Get all grade schedules with enriched data - OPTIMIZED BATCH VERSION"""
        client = self._get_client()
        
        query = client.table("grade_schedules").select("id,grade_id,subject_id,teacher_id,room_id,day_of_week,start_time,end_time,is_active")
        
        if school_id:
            # Filter by school_id via grades table
            grades_result = client.table("grades").select("id").eq("school_id", school_id).execute()
            grade_ids = [g["id"] for g in grades_result.data]
            if not grade_ids:
                return []
            query = query.in_("grade_id", grade_ids)
        
        result = query.execute()
        schedules = result.data or []
        
        # Batch enrichment - fetch all related data in parallel
        return self._enrich_schedules_batch(client, schedules)
    
    def _enrich_schedules_batch(self, client, schedules: List[dict]) -> List[dict]:
        """Batch enrich schedules with related data to avoid N+1 queries."""
        if not schedules:
            return []
        
        # Collect unique IDs
        grade_ids = list(set(s["grade_id"] for s in schedules))
        subject_ids = list(set(s["subject_id"] for s in schedules))
        teacher_ids = list(set(s["teacher_id"] for s in schedules))
        room_ids = list(set(s["room_id"] for s in schedules if s.get("room_id")))
        
        # Fetch all related data in parallel (batch queries)
        grades_map = {}
        if grade_ids:
            grades_result = client.table("grades").select("id,name,jurusan_id").in_("id", grade_ids).execute()
            grades_map = {g["id"]: g for g in grades_result.data}
        
        subjects_map = {}
        if subject_ids:
            subjects_result = client.table("subjects").select("id,name").in_("id", subject_ids).execute()
            subjects_map = {s["id"]: s for s in subjects_result.data}
        
        teachers_map = {}
        if teacher_ids:
            teachers_result = client.table("users").select("id,name").in_("id", teacher_ids).execute()
            teachers_map = {t["id"]: t for t in teachers_result.data}
        
        rooms_map = {}
        if room_ids:
            rooms_result = client.table("rooms").select("id,name,room_code").in_("id", room_ids).execute()
            rooms_map = {r["id"]: r for r in rooms_result.data}
        
        # Get jurusan for grades
        jurusan_ids = list(set(g.get("jurusan_id") for g in grades_map.values() if g.get("jurusan_id")))
        jurusan_map = {}
        if jurusan_ids:
            jurusan_result = client.table("jurusan").select("id,name").in_("id", jurusan_ids).execute()
            jurusan_map = {j["id"]: j for j in jurusan_result.data}
        
        # Build enriched schedules
        enriched = []
        for s in schedules:
            grade = grades_map.get(s["grade_id"], {})
            subject = subjects_map.get(s["subject_id"], {})
            teacher = teachers_map.get(s["teacher_id"], {})
            room = rooms_map.get(s["room_id"], {}) if s.get("room_id") else None
            jurusan = jurusan_map.get(grade.get("jurusan_id")) if grade.get("jurusan_id") else None
            
            enriched.append({
                **s,
                "grade_name": grade.get("name", "N/A"),
                "jurusan_name": jurusan.get("name") if jurusan else None,
                "subject_name": subject.get("name", "N/A"),
                "teacher_name": teacher.get("name", "N/A"),
                "room_name": room.get("name") if room else None
            })
        return enriched
    
    @log_query_time
    def get_grade_schedules_by_grade(self, grade_id: str) -> List[dict]:
        """Get grade schedules by grade with JOINs for names"""
        client = self._get_client()
        result = client.table("grade_schedules").select("id,grade_id,subject_id,teacher_id,room_id,day_of_week,start_time,end_time,is_active").eq("grade_id", grade_id).eq("is_active", True).execute()
        schedules = result.data or []
        
        # Use batch enrichment
        return self._enrich_schedules_batch(client, schedules)
    
    @log_query_time
    def get_grade_schedules_by_teacher(self, teacher_id: str) -> List[dict]:
        """Get grade schedules by teacher with JOINs for names"""
        client = self._get_client()
        result = client.table("grade_schedules").select("id,grade_id,subject_id,teacher_id,room_id,day_of_week,start_time,end_time,is_active").eq("teacher_id", teacher_id).eq("is_active", True).execute()
        schedules = result.data or []
        
        # Use batch enrichment
        enriched = self._enrich_schedules_batch(client, schedules)
        # Add day name
        for s in enriched:
            s["day_name"] = get_day_name_indonesian(s.get("day_of_week", ""))
        return enriched
    
    @log_query_time
    def get_grade_schedules_by_teacher_and_day(self, teacher_id: str, day_name_en: str) -> List[dict]:
        """Get grade schedules by teacher for specific day with enriched names"""
        client = self._get_client()
        result = client.table("grade_schedules").select("id,grade_id,subject_id,teacher_id,room_id,day_of_week,start_time,end_time,is_active").eq("teacher_id", teacher_id).eq("day_of_week", day_name_en).eq("is_active", True).execute()
        schedules = result.data or []
        
        # Use batch enrichment
        enriched = self._enrich_schedules_batch(client, schedules)
        # Add day name
        day_indonesian = get_day_name_indonesian(day_name_en)
        for s in enriched:
            s["day_name"] = day_indonesian
        return enriched
    
    @log_query_time
    def get_grade_schedule(self, schedule_id: str) -> Optional[dict]:
        """Get grade schedule by ID with JOINs for names"""
        client = self._get_client()
        result = client.table("grade_schedules").select("id,grade_id,subject_id,teacher_id,room_id,day_of_week,start_time,end_time").eq("id", schedule_id).execute()
        if not result.data:
            return None
        s = result.data[0]
        
        # Enrich single schedule
        grade = self.get_grade(s["grade_id"])
        subject = self.get_subject(s["subject_id"])
        teacher = self.get_user(s["teacher_id"])
        room = self.get_room(s.get("room_id")) if s.get("room_id") else None
        
        return {
            **s,
            "grade_name": grade["name"] if grade else "N/A",
            "subject_name": subject["name"] if subject else "N/A",
            "teacher_name": teacher["name"] if teacher else "N/A",
            "room_name": room["name"] if room else None
        }
    
    @log_query_time
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
    
    @log_query_time
    def update_grade_schedule(self, schedule_id: str, **fields) -> bool:
        """Update grade schedule"""
        client = self._get_client()
        result = client.table("grade_schedules").update(fields).eq("id", schedule_id).execute()
        return bool(result.data)
    
    @log_query_time
    def delete_grade_schedule(self, schedule_id: str) -> bool:
        """Delete grade schedule (with cascade to qr_tokens)"""
        client = self._get_client()
        # First delete associated QR tokens to avoid foreign key violation
        client.table("qr_tokens").delete().eq("schedule_id", schedule_id).execute()
        # Then delete the schedule
        result = client.table("grade_schedules").delete().eq("id", schedule_id).execute()
        return bool(result.data)
    
    # QR Token operations
    @log_query_time
    def get_all_qr_tokens(self, active_only: bool = True) -> List[dict]:
        """Get all QR tokens"""
        client = self._get_client()
        query = client.table("qr_tokens").select("id,schedule_id,room_id,grade_id,subject_id,teacher_id,token,expires_at,token_type,state,is_active")
        if active_only:
            query = query.eq("is_active", True)
        result = query.execute()
        return result.data
    
    @log_query_time
    def get_qr_tokens_by_schedule(self, schedule_id: str) -> List[dict]:
        """Get QR tokens by schedule"""
        client = self._get_client()
        result = client.table("qr_tokens").select("id,schedule_id,room_id,grade_id,subject_id,teacher_id,token,expires_at,token_type,state,is_active").eq("schedule_id", schedule_id).execute()
        return result.data
    
    @log_query_time
    def create_qr_token(self, schedule_id: str, room_id: str, grade_id: str,
                       subject_id: str, teacher_id: str, token: str, expires_at: str,
                       token_type: str = 'entry', state: str = 'scheduled') -> str:
        """Create new QR token"""
        client = self._get_client()
        result = client.table("qr_tokens").insert({
            "schedule_id": schedule_id,
            "room_id": room_id,
            "grade_id": grade_id,
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "token": token,
            "expires_at": expires_at,
            "token_type": token_type,
            "state": state
        }).execute()
        return result.data[0]["id"]
    
    @log_query_time
    def update_qr_token_state(self, token: str, state: str, scanned_at: str = None) -> bool:
        """Update QR token state (entry scanned, exit scanned, etc)"""
        client = self._get_client()
        update_data = {"state": state}
        if scanned_at:
            update_data["scanned_at"] = scanned_at
        result = client.table("qr_tokens").update(update_data).eq("token", token).execute()
        return bool(result.data)
    
    @log_query_time
    def get_qr_token(self, token: str) -> Optional[dict]:
        """Get QR token by token string"""
        client = self._get_client()
        result = client.table("qr_tokens").select("id,schedule_id,room_id,grade_id,subject_id,teacher_id,token,expires_at,token_type,state,is_active").eq("token", token).eq("is_active", True).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
    def get_schedules_by_room_and_day(self, room_id: str, day_of_week: str) -> List[dict]:
        """Get all grade schedules for a room on a specific day"""
        client = self._get_client()
        result = client.table("grade_schedules").select("""
            *,
            grades(name),
            subjects(name),
            users(name),
            rooms(name)
        """).eq("room_id", room_id).eq("day_of_week", day_of_week).eq("is_active", True).execute()
        return result.data
    
    @log_query_time
    def update_schedule_state(self, schedule_id: str, state: str, early_start: str = None) -> bool:
        """Update schedule state (for early request approval)"""
        client = self._get_client()
        update_data = {"state": state}
        if early_start:
            update_data["start_time"] = early_start.split("T")[1][:5]
        result = client.table("grade_schedules").update(update_data).eq("id", schedule_id).execute()
        return bool(result.data)
    
    @log_query_time
    def deactivate_qr_token(self, token_id: str) -> bool:
        """Deactivate QR token"""
        client = self._get_client()
        result = client.table("qr_tokens").update({"is_active": False}).eq("id", token_id).execute()
        return bool(result.data)
    
    @log_query_time
    def create_device(self, device_id: str, room_id: str, device_name: str, status: str = "active") -> str:
        """Register new ESP32 device"""
        client = self._get_client()
        result = client.table("devices").insert({
            "device_id": device_id,
            "room_id": room_id,
            "device_name": device_name,
            "status": status
        }).execute()
        return result.data[0]["id"]
    
    @log_query_time
    def get_device(self, device_id: str) -> Optional[dict]:
        """Get device by device_id"""
        client = self._get_client()
        result = client.table("devices").select("*").eq("device_id", device_id).execute()
        return result.data[0] if result.data else None
    
    @log_query_time
    def get_device_by_room(self, room_id: str) -> Optional[dict]:
        """Get device by room_id"""
        client = self._get_client()
        result = client.table("devices").select("*").eq("room_id", room_id).eq("status", "active").execute()
        return result.data[0] if result.data else None
    
    @log_query_time
    def update_device(self, device_id: str, room_id: str = None, device_name: str = None, status: str = None) -> bool:
        """Update device info"""
        client = self._get_client()
        update_data = {}
        if room_id:
            update_data["room_id"] = room_id
        if device_name:
            update_data["device_name"] = device_name
        if status:
            update_data["status"] = status
        result = client.table("devices").update(update_data).eq("device_id", device_id).execute()
        return bool(result.data)
    
    @log_query_time
    def get_all_devices(self) -> List[dict]:
        """Get all registered devices"""
        client = self._get_client()
        result = client.table("devices").select("*").execute()
        return result.data
    
    @log_query_time
    def delete_device(self, device_id: str) -> bool:
        """Delete device registration"""
        client = self._get_client()
        result = client.table("devices").delete().eq("device_id", device_id).execute()
        return bool(result.data)
