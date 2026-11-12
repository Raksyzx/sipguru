from src.config import settings
from src.database import get_db
from src.deps import get_current_user, require_admin

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

router = APIRouter()
db = get_db()


class RegisterDeviceRequest(BaseModel):
    room_code: str
    device_id: str  # ESP32 MAC address or unique ID
    device_name: Optional[str] = None


class DevicePairingCode(BaseModel):
    room_code: str
    pairing_code: str  # 6-digit code displayed on ESP32


@router.post("/register")
async def register_device(
    data: RegisterDeviceRequest,
    auth_user: dict = Depends(require_admin),
):
    """Register ESP32 device to a room (admin only)"""
    room = db.get_room_by_code(data.room_code)
    if not room:
        raise HTTPException(status_code=404, detail=f"Room with code {data.room_code} not found")
    
    # Check if device already registered
    existing = db.get_device(data.device_id)
    if existing:
        # Update existing
        db.update_device(
            device_id=data.device_id,
            room_id=room["id"],
            device_name=data.device_name or f"ESP32-{data.room_code}",
            status="active"
        )
        return {
            "message": "Device updated",
            "device_id": data.device_id,
            "room_code": data.room_code,
            "room_id": room["id"],
            "room_name": room["name"]
        }
    
    # Register new device
    device_id = db.create_device(
        device_id=data.device_id,
        room_id=room["id"],
        device_name=data.device_name or f"ESP32-{data.room_code}",
        status="active"
    )
    
    return {
        "message": "Device registered successfully",
        "device_id": data.device_id,
        "room_code": data.room_code,
        "room_id": room["id"],
        "room_name": room["name"],
        "device_db_id": device_id
    }


@router.post("/pair")
async def pair_device(
    data: DevicePairingCode,
    auth_user: dict = Depends(require_admin),
):
    """Pair ESP32 with room using 6-digit code (shown on ESP32 OLED)"""
    # Lookup pairing code in Redis/temp storage
    # For now, simple room_code match
    room = db.get_room_by_code(data.room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # In production: verify pairing_code matches what ESP32 is displaying
    # For now, just return room info for ESP32 to store
    return {
        "message": "Pairing successful",
        "room_id": room["id"],
        "room_code": data.room_code,
        "room_name": room["name"],
        "geofence_radius": room.get("geofence_radius", 150),
        "geolocation": room.get("geolocation")
    }


@router.get("/room/{room_code}")
async def get_device_info(
    room_code: str,
    auth_user: dict = Depends(get_current_user),
):
    """Get device info for a room (for ESP32 to fetch its config)"""
    room = db.get_room_by_code(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    device = db.get_device_by_room(room["id"])
    
    return {
        "room_id": room["id"],
        "room_code": room_code,
        "room_name": room["name"],
        "device_id": device["device_id"] if device else None,
        "device_name": device["device_name"] if device else None,
        "device_status": device["status"] if device else "unregistered",
        "geofence_radius": room.get("geofence_radius", 150),
        "geolocation": room.get("geolocation")
    }


@router.get("/list")
async def list_devices(
    auth_user: dict = Depends(require_admin),
):
    """List all registered ESP32 devices (admin only)"""
    devices = db.get_all_devices()
    return {"devices": devices}


@router.delete("/{device_id}")
async def unregister_device(
    device_id: str,
    auth_user: dict = Depends(require_admin),
):
    """Unregister ESP32 device (admin only)"""
    success = db.delete_device(device_id)
    if not success:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": f"Device {device_id} unregistered"}
