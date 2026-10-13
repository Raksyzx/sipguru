import httpx
from fastapi import HTTPException

from src.config import settings

RESEND_BASE_URL = "https://api.resend.com"

async def send_otp_email(to_email: str, otp: str, user_name: str) -> dict:
    """Send OTP via Resend email API"""
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "from": f"noreply@{settings.APP_NAME.lower()}.com",
        "to": [to_email],
        "subject": f"Kode OTP - {settings.APP_NAME}",
        "html": f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">{settings.APP_NAME}</h2>
            <p>Halo <strong>{user_name}</strong>,</p>
            <p>Kode OTP Anda untuk {settings.APP_NAME} adalah:</p>
            <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e3a8a;">
                    {otp}
                </span>
            </div>
            <p>Kode ini berlaku selama 10 menit.</p>
            <p>Jika Anda tidak meminta kode ini, abaikan email ini.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="font-size: 12px; color: #6b7280;">{settings.APP_NAME} - Sistem Presensi Guru</p>
        </div>
        """
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{RESEND_BASE_URL}/emails",
            json=payload,
            headers=headers
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to send OTP email: {response.text}"
            )
        
        return response.json()

async def send_unbind_email(to_email: str, unbind_code: str, user_name: str) -> dict:
    """Send unbind request email with OTP code"""
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "from": f"noreply@{settings.APP_NAME.lower()}.com",
        "to": [to_email],
        "subject": f"Konfirmasi Basin Device - {settings.APP_NAME}",
        "html": f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">{settings.APP_NAME}</h2>
            <p>Halo <strong>{user_name}</strong>,</p>
            <p>Permintaan untuk membatalkan binding device ini dikirim.</p>
            <p>Kode konfirmasi Anda adalah:</p>
            <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <span style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #dc2626;">
                    {unbind_code}
                </span>
            </div>
            <p>Kode ini berlaku selama 10 menit.</p>
            <p>Jika Anda tidak meminta ini,abaikan email ini.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="font-size: 12px; color: #6b7280;">{settings.APP_NAME} - Sistem Presensi Guru</p>
        </div>
        """
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{RESEND_BASE_URL}/emails",
            json=payload,
            headers=headers
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to send unbind email: {response.text}"
            )
        
        return response.json()
