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

async def send_forgot_password_email(to_email: str, user_data: dict) -> dict:
    """Send forgot password request notification to admin"""
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json"
    }
    
    from datetime import datetime, timezone, timedelta
    now_wib = datetime.now(timezone(timedelta(hours=7))).strftime('%d %B %Y, %H:%M:%S WIB')
    
    payload = {
        "from": f"noreply@{settings.APP_NAME.lower()}.com",
        "to": [to_email],
        "subject": f"[SIPGURU] Permintaan Reset Password - {user_data['name']} ({user_data['email']})",
        "html": f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🔔 SIPGURU - Notifikasi Admin</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
                <h2 style="color: #1f2937; margin-top: 0;">Permintaan Reset Password</h2>
                <p style="color: #4b5563;">Seorang guru meminta reset password. Berikut detailnya:</p>
                
                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; font-weight: 600; color: #374151; width: 30%;">Nama Lengkap</td>
                            <td style="padding: 8px 0; color: #1f2937;">{user_data['name']}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: 600; color: #374151;">Email</td>
                            <td style="padding: 8px 0; color: #1f2937;">{user_data['email']}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: 600; color: #374151;">NIP</td>
                            <td style="padding: 8px 0; color: #1f2937;">{user_data.get('nip', '-')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: 600; color: #374151;">Telepon</td>
                            <td style="padding: 8px 0; color: #1f2937;">{user_data.get('phone', '-')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: 600; color: #374151;">Waktu Request</td>
                            <td style="padding: 8px 0; color: #1f2937;">{now_wib}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; color: #065f46;">
                        <strong>⚠️ Tindakan Diperlukan:</strong> Hubungi guru tersebut untuk melakukan reset password manual melalui sistem admin atau berikan password temporary.
                    </p>
                </div>
                
                <p style="color: #9ca3af; font-size: 12px; margin-top: 30px; text-align: center;">
                    Email otomatis dari Sistem SIPGURU — Jangan balas email ini
                </p>
            </div>
        </body>
        </html>
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
                detail=f"Failed to send forgot password email: {response.text}"
            )
        
        return response.json()
