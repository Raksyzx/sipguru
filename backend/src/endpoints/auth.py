from src.config import settings
from src.auth import create_jwt, verify_jwt, generate_device_fingerprint, hash_otp

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional

# Import correct DB client based on DEVELOPMENT mode
if settings.DEVELOPMENT:
    from src.local_db import LocalDBClient
    db = LocalDBClient()
else:
    from src.supabase import SupabaseClient
    db = SupabaseClient()

router = APIRouter()

# Pydantic Models
class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: str
    role: str
    device_bound: bool

class VerifyDeviceRequest(BaseModel):
    email: str
    device_fingerprint: str
    otp: str

@router.post("/login", response_model=LoginResponse)
async def login(request: Request, data: LoginRequest):
    """Custom JWT login with SQLite"""
    user = await db.verify_credentials(data.email, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    device_fingerprint = generate_device_fingerprint(
        request.headers.get("user-agent", ""),
        request.client.host if request.client else "unknown"
    )
    
    # Check device binding
    existing_binding = await db.get_device_binding(user["id"], device_fingerprint)
    
    # Create JWT
    access_token = create_jwt({
        "user_id": user["id"],
        "email": user["email"],
        "role": user["role"]
    })
    
    refresh_token = create_jwt({
        "user_id": user["id"],
        "type": "refresh"
    }, expires_minutes=60*24*7)
    
    # Update device binding
    await db.create_device_binding(user["id"], device_fingerprint)
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user["id"],
        role=user["role"],
        device_bound=bool(existing_binding)
    )

@router.post("/verify-device")
async def verify_device(data: VerifyDeviceRequest):
    """Verify OTP for device unbinding"""
    user = await db.get_user_by_email(data.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    binding = await db.get_pending_unbind_binding(user["id"])
    if not binding:
        raise HTTPException(status_code=400, detail="No pending unbind request")
    
    if len(data.otp) != 6 or not data.otp.isdigit():
        raise HTTPException(status_code=400, detail="Invalid OTP format")
    
    await db.unlink_device(binding["id"])
    
    return {"message": "Device successfully unbound"}

@router.post("/request-unbind")
async def request_unbind(request: Request, data: VerifyDeviceRequest):
    """Request OTP for device unbinding"""
    user = await db.get_user_by_email(data.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    device_fingerprint = generate_device_fingerprint(
        request.headers.get("user-agent", ""),
        request.client.host if request.client else "unknown"
    )
    
    binding = await db.get_device_binding(user["id"], device_fingerprint)
    if not binding or not binding.get("is_active", True):
        raise HTTPException(status_code=400, detail="Device not bound or already unbound")
    
    import secrets
    otp = secrets.token_hex(3)[:6]
    otp_hash = hash_otp(otp)
    
    await db.update_unbind_request(binding["id"], otp_hash)
    
    return {"message": "OTP sent to email"}
