from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.auth import verify_jwt as _verify_raw_jwt

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """Extract and verify JWT from Authorization: Bearer <token> header."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )
    user = _verify_raw_jwt(credentials.credentials)
    if not user or "user_id" not in user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency to check if user is admin."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
