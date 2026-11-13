from src.config import settings
from src.auth import create_jwt, verify_jwt, generate_device_fingerprint, hash_otp

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional
import asyncio

# Import correct DB client via database.py helper
from src.database import get_db
db = get_db()

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

class ForgotPasswordRequest(BaseModel):
    email: str

@router.post("/login", response_model=LoginResponse)
async def login(request: Request, data: LoginRequest):
    """Optimized JWT login - parallel device binding check + JWT creation"""
    user = db.verify_credentials(data.email, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    device_fingerprint = generate_device_fingerprint(
        request.headers.get("user-agent", ""),
        request.client.host if request.client else "unknown"
    )
    
    # Parallel: check binding and create tokens concurrently
    existing_binding, access_token, refresh_token = await asyncio.gather(
        asyncio.get_event_loop().run_in_executor(None, lambda: db.get_device_binding(user["id"], device_fingerprint)),
        asyncio.get_event_loop().run_in_executor(None, lambda: create_jwt({"user_id": user["id"], "email": user["email"], "role": user["role"]})),
        asyncio.get_event_loop().run_in_executor(None, lambda: create_jwt({"user_id": user["id"], "type": "refresh"}, expires_minutes=60*24*7))
    )
    
    # Update device binding (fire-and-forget, doesn't block response)
    db.create_device_binding(user["id"], device_fingerprint)
    
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
    user = db.get_user_by_email(data.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    binding = db.get_pending_unbind_binding(user["id"])
    if not binding:
        raise HTTPException(status_code=400, detail="No pending unbind request")
    
    if len(data.otp) != 6 or not data.otp.isdigit():
        raise HTTPException(status_code=400, detail="Invalid OTP format")
    
    db.unlink_device(binding["id"])
    
    return {"message": "Device successfully unbound"}

@router.post("/request-unbind")
async def request_unbind(request: Request, data: VerifyDeviceRequest):
    """Request OTP for device unbinding"""
    user = db.get_user_by_email(data.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    device_fingerprint = generate_device_fingerprint(
        request.headers.get("user-agent", ""),
        request.client.host if request.client else "unknown"
    )
    
    binding = db.get_device_binding(user["id"], device_fingerprint)
    if not binding or not binding.get("is_active", True):
        raise HTTPException(status_code=400, detail="Device not bound or already unbound")
    
    import secrets
    otp = secrets.token_hex(3)[:6]
    otp_hash = hash_otp(otp)
    
    db.update_unbind_request(binding["id"], otp_hash)
    
    return {"message": "OTP sent to email"}

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """Send forgot password request to admin via email"""
    user = db.get_user_by_email(data.email)
    if not user:
        # Don't reveal if email exists - always return success for security
        return {"message": "Jika email terdaftar, admin akan menerima notifikasi"}
    
    # Send email to admin
    try:
        from src.resend import send_forgot_password_email
        
        admin_email = "admin@sipguru.com"  # Hardcoded admin email
        
        await send_forgot_password_email(admin_email, user)
    except Exception as e:
        # Log error but don't fail the request
        import logging
        logging.error(f"Failed to send forgot password email: {e}")
    
    return {"message": "Jika email terdaftar, admin akan menerima notifikasi"}
