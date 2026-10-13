from datetime import datetime, timedelta
from typing import Optional
import hashlib
import hmac
import secrets
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

from src.config import settings

def create_jwt(payload: dict, secret: str = None, expires_minutes: int = None) -> str:
    """Create a JWT token"""
    from jose import jwt
    if secret is None:
        secret = settings.JWT_SECRET
    
    expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes or (settings.JWT_EXPIRY_HOURS * 60))
    payload_with_exp = {**payload, "exp": expires_at}
    
    return jwt.encode(payload_with_exp, secret, algorithm=settings.JWT_ALGORITHM)

def verify_jwt(token: str, secret: str = None) -> Optional[dict]:
    """Verify and decode a JWT token"""
    from jose import jwt, JWTError
    if secret is None:
        secret = settings.JWT_SECRET
    
    try:
        payload = jwt.decode(token, secret, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None

def generate_hmac_token(
    room_id: str,
    expiry_seconds: int = None,
    secret: str = None,
    schedule_id: str = None,
    subject_id: str = None,
    teacher_id: str = None,
    grade_id: str = None
) -> str:
    """Generate HMAC-signed QR token for room, optionally bound to schedule"""
    if secret is None:
        secret = settings.JWT_SECRET
    
    if expiry_seconds is None:
        expiry_seconds = settings.QR_EXPIRY_SECONDS
    
    nonce = secrets.token_hex(16)
    payload_parts = [
        room_id,
        str(int(datetime.utcnow().timestamp())),
        str(expiry_seconds),
        nonce,
        schedule_id or "",
        subject_id or "",
        teacher_id or "",
        grade_id or "",
    ]
    payload = ":".join(payload_parts)
    
    signature = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"{payload}:{signature}"

def verify_hmac_token(token: str, secret: str = None) -> Optional[dict]:
    """Verify HMAC token and extract payload (supports both legacy and bound formats)"""
    if secret is None:
        secret = settings.JWT_SECRET
    
    try:
        parts = token.split(':')
        if len(parts) < 5:
            return None
        
        # Legacy format: room_id:timestamp:expiry:nonce:signature
        # New format: room_id:timestamp:expiry:nonce:schedule_id:subject_id:teacher_id:grade_id:signature
        room_id = parts[0]
        timestamp = int(parts[1])
        expiry = int(parts[2])
        nonce = parts[3]
        
        # Check if bound format (9 parts total: 8 payload + 1 signature)
        if len(parts) >= 9:
            schedule_id = parts[4] or None
            subject_id = parts[5] or None
            teacher_id = parts[6] or None
            grade_id = parts[7] or None
            signature = parts[8]
            expected_payload = ":".join(parts[:8])
        else:
            # Legacy format
            signature = parts[4]
            schedule_id = subject_id = teacher_id = grade_id = None
            expected_payload = ":".join(parts[:5])
        
        # Verify signature
        expected_sig = hmac.new(
            secret.encode(),
            expected_payload.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_sig):
            return None
        
        # Check expiry
        current_time = int(datetime.utcnow().timestamp())
        if current_time - timestamp > expiry:
            return None
        
        return {
            "room_id": room_id,
            "timestamp": timestamp,
            "nonce": nonce,
            "schedule_id": schedule_id,
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "grade_id": grade_id,
            "valid": True
        }
    except Exception:
        return None

def generate_device_fingerprint(user_agent: str, ip_address: str) -> str:
    """Generate deterministic device fingerprint"""
    data = f"{user_agent}:{ip_address}"
    return hashlib.sha256(data.encode()).hexdigest()[:32]

def generate_otp(length: int = 6) -> str:
    """Generate numeric OTP code"""
    return secrets.token_hex(length // 2)[:length]

def hash_otp(otp: str) -> str:
    """Hash OTP for storage"""
    return hashlib.sha256(otp.encode()).hexdigest()

def verify_otp(stored_hash: str, provided_otp: str) -> bool:
    """Verify OTP against hash"""
    return stored_hash == hash_otp(provided_otp)