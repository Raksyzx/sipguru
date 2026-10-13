from datetime import datetime, date, time
from typing import Optional, Tuple
from fastapi import HTTPException

from src.db.supabase import SupabaseClient
from src.auth import verify_jwt, create_jwt

class ValidationService:
    def __init__(self, supabase: SupabaseClient):
        self.supabase = supabase
    
    async def validate_presence(
        self,
        teacher_id: str,
        room_id: str,
        geolocation: dict,
        device_fingerprint: str,
        qr_token: str,
        current_time: datetime = None
    ) -> dict:
        """
        3-Layer Validation:
        1. GPS Geofence (150m radius)
        2. QR Token Verification
        3. Schedule Match (with 15 min tolerance)
        """
        from math import radians, sin, cos, sqrt, atan2
        
        if current_time is None:
            current_time = datetime.now()
        
        result = {
            "valid": False,
            "status": None,
            "reasons": [],
            "lateness_minutes": None
        }
        
        # Layer 1: GPS Geofence Validation
        geofence_valid, geofence_distance = await self._validate_geofence(
            room_id, geolocation
        )
        if not geofence_valid:
            result["reasons"].append(f"GPS di luar radius {geofence_distance:.0f}m")
        
        result["geofence"] = {
            "valid": geofence_valid,
            "distance_m": geofence_distance
        }
        
        # Layer 2: QR Token Validation
        token_valid, token_data = await self._validate_qr_token(qr_token, room_id)
        if not token_valid:
            result["reasons"].append("QR token tidak valid atau expired")
        
        result["qr_token"] = {
            "valid": token_valid,
            "data": token_data
        }
        
        # Layer 3: Schedule Match Validation
        schedule_valid, schedule_info = await self._validate_schedule(
            teacher_id, room_id, current_time
        )
        
        result["schedule"] = {
            "valid": schedule_valid,
            "info": schedule_info
        }
        
        # Determine overall status
        all_valid = geofence_valid and token_valid and schedule_valid
        
        if not all_valid:
            result["reasons"].append("Validasi tidak lolos")
        else:
            result["valid"] = True
            result["status"] = "on_time"
            
            # Check lateness
            if schedule_info and schedule_info.get("is_late"):
                result["status"] = "late"
                result["lateness_minutes"] = schedule_info.get("lateness_minutes")
                result["reasons"].append(f"Terlambat {result['lateness_minutes']} menit")
        
        result["all_valid"] = all_valid
        result["validated_at"] = current_time.isoformat()
        result["device_fingerprint"] = device_fingerprint
        
        return result
    
    async def _validate_geofence(
        self, room_id: str, user_location: dict
    ) -> Tuple[bool, float]:
        """Validate user is within 150m radius of room"""
        try:
            room = await self.supabase.get_room(room_id)
            if not room or not room.get("geolocation"):
                return False, 9999
            
            room_lat, room_lon = self._parse_point(room["geolocation"])
            user_lat = user_location.get("latitude")
            user_lon = user_location.get("longitude")
            
            if not all([room_lat, room_lon, user_lat, user_lon]):
                return False, 9999
            
            distance = self._haversine_distance(
                room_lat, room_lon, user_lat, user_lon
            )
            
            return distance <= 150, distance
        except Exception:
            return False, 9999
    
    async def _validate_qr_token(
        self, token: str, expected_room_id: str
    ) -> Tuple[bool, Optional[dict]]:
        """Validate HMAC-signed QR token"""
        # This would use the auth module's verify_hmac_token
        # For now, return placeholder
        from src.auth import verify_hmac_token
        from src.config import settings
        
        token_data = verify_hmac_token(token, settings.JWT_SECRET)
        if not token_data:
            return False, None
        
        if token_data.get("room_id") != expected_room_id:
            return False, None
        
        return True, token_data
    
    async def _validate_schedule(
        self, teacher_id: str, room_id: str, current_time: datetime
    ) -> Tuple[bool, Optional[dict]]:
        """Validate teacher schedule matches room and time"""
        try:
            # Get today's schedule
            day_name = current_time.strftime("%A")
            
            schedule = await self.supabase.get_schedule_by_teacher_and_day(
                teacher_id, day_name, room_id
            )
            
            if not schedule:
                return False, {"reason": "No schedule found for this day/room"}
            
            start_time = schedule["start_time"]
            end_time = schedule["end_time"]
            
            current_time_only = current_time.time()
            
            # Check if within schedule window (with 15 min tolerance)
            from datetime import timedelta
            
            tolerance = timedelta(minutes=15)
            
            # Schedule window is start_time to end_time, plus tolerance
            schedule_start_with_tolerance = (
                datetime.combine(date.today(), start_time) - tolerance
            ).time()
            schedule_end_with_tolerance = (
                datetime.combine(date.today(), end_time) + tolerance
            ).time()
            
            is_late = current_time_only > start_time
            
            # Calculate lateness in minutes
            lateness_minutes = None
            if is_late:
                start_dt = datetime.combine(date.today(), start_time)
                current_dt = datetime.combine(date.today(), current_time_only)
                lateness_minutes = (current_dt - start_dt).seconds // 60
            
            is_valid = (
                schedule_start_with_tolerance <= current_time_only <= schedule_end_with_tolerance
            )
            
            return is_valid, {
                "schedule_id": schedule["id"],
                "start_time": str(start_time),
                "end_time": str(end_time),
                "is_late": is_late,
                "lateness_minutes": lateness_minutes
            }
        except Exception as e:
            return False, {"reason": str(e)}
    
    def _parse_point(self, point_str: str) -> Tuple[float, float]:
        """Parse POINT(x y) format"""
        if not point_str:
            return None, None
        # Format: (x,y) or POINT(x y)
        import re
        match = re.search(r'[(-]([\d.]+)[,\s]+([\d.]+)[)]', point_str)
        if match:
            return float(match.group(2)), float(match.group(1))  # lat, lon
        return None, None
    
    def _haversine_distance(
        self, lat1: float, lon1: float, lat2: float, lon2: float
    ) -> float:
        """Calculate distance between two points in meters"""
        R = 6371000  # Earth radius in meters
        
        phi1 = radians(lat1)
        phi2 = radians(lat2)
        delta_phi = radians(lat2 - lat1)
        delta_lambda = radians(lon2 - lon1)
        
        a = sin(delta_phi/2)**2 + cos(phi1) * cos(phi2) * sin(delta_lambda/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        return R * c
