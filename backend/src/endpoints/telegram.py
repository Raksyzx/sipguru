"""Telegram bot notifications for SIPGURU attendance."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime
import httpx
import os

from src.local_db import LocalDBClient
from src.deps import get_current_user
from src.config import settings

router = APIRouter()
db = LocalDBClient()

# Telegram configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_ENABLED = bool(TELEGRAM_BOT_TOKEN)


class TelegramNotifyRequest(BaseModel):
    """Request for sending Telegram notification after attendance."""
    teacher_id: str
    teacher_name: str
    teacher_nip: str
    room_name: str
    status: str  # "on_time" or "late"
    lateness_minutes: int = 0
    timestamp: str


async def send_telegram_message(chat_id: str, message: str):
    """Send message to Telegram chat."""
    if not TELEGRAM_ENABLED:
        return {"sent": False, "reason": "Telegram bot token not configured"}
    
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=10)
            result = response.json()
            return {"sent": result.get("ok", False), "result": result}
    except Exception as e:
        return {"sent": False, "error": str(e)}


@router.post("/notify/attendance")
async def notify_attendance(
    data: TelegramNotifyRequest,
    auth_user: dict = Depends(get_current_user),
):
    """Send Telegram notification after successful attendance scan."""
    if not TELEGRAM_ENABLED:
        return {
            "success": False,
            "message": "Notifikasi Telegram tidak aktif (bot token tidak dikonfigurasi)",
            "telegram_enabled": False
        }
    
    # Get teacher's Telegram chat_id from user profile (phone field used as chat_id for now)
    # In production, you'd have a separate telegram_chat_id field or user mapping table
    teacher = db.get_user(data.teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    
    # For demo: use phone as chat_id placeholder
    # In real implementation, you'd have a telegram_users table mapping user_id to chat_id
    chat_id = teacher.get("phone")  # Temporary: phone field stores chat_id
    
    if not chat_id:
        return {
            "success": False,
            "message": "Chat ID Telegram belum diatur untuk guru ini",
            "telegram_enabled": True
        }
    
    # Build notification message
    status_emoji = "✅" if data.status == "on_time" else "⚠️"
    status_text = "TEPAT WAKTU" if data.status == "on_time" else f"TERLAMBAT {data.lateness_minutes} MENIT"
    
    message = f"""
{status_emoji} <b>Presensi Berhasil</b>

👤 <b>Nama:</b> {data.teacher_name}
🆔 <b>NIP:</b> {data.teacher_nip}
📍 <b>Ruangan:</b> {data.room_name}
⏰ <b>Waktu:</b> {data.timestamp}
📊 <b>Status:</b> {status_text}

Terima kasih telah melakukan presensi.
"""
    
    result = await send_telegram_message(chat_id, message)
    
    if result.get("sent"):
        return {
            "success": True,
            "message": "Notifikasi Telegram terkirim",
            "telegram_enabled": True,
            "chat_id": chat_id
        }
    else:
        return {
            "success": False,
            "message": f"Gagal mengirim notifikasi: {result.get('error', 'Unknown error')}",
            "telegram_enabled": True
        }


@router.get("/setup")
async def setup_telegram_info(auth_user: dict = Depends(get_current_user)):
    """Get Telegram bot setup instructions."""
    bot_username = ""
    if TELEGRAM_ENABLED:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getMe",
                    timeout=5
                )
                if response.status_code == 200:
                    bot_info = response.json()
                    if bot_info.get("ok"):
                        bot_username = bot_info["result"].get("username", "")
        except:
            pass
    
    return {
        "telegram_enabled": TELEGRAM_ENABLED,
        "bot_username": bot_username,
        "setup_instructions": (
            "1. Chat bot Telegram di @{} dan klik Start\n"
            "2. Dapatkan Chat ID Anda dengan mengirim /start\n"
            "3. Update profile Anda dengan Chat ID tersebut"
        ).format(bot_username) if bot_username else "Konfigurasi TELEGRAM_BOT_TOKEN di environment"
    }


@router.post("/test/{chat_id}")
async def test_telegram_notification(
    chat_id: str,
    auth_user: dict = Depends(get_current_user),
):
    """Send test Telegram notification."""
    if not TELEGRAM_ENABLED:
        raise HTTPException(status_code=400, detail="Telegram bot tidak dikonfigurasi")
    
    message = """
🧪 <b>Test Notifikasi SIPGURU</b>

Ini adalah pesan test dari sistem SIPGURU.
Jika Anda menerima pesan ini, notifikasi Telegram berfungsi dengan baik.

Waktu: {}
""".format(datetime.now().strftime("%d/%m/%Y %H:%M"))
    
    result = await send_telegram_message(chat_id, message)
    
    if not result.get("sent"):
        raise HTTPException(
            status_code=400,
            detail=f"Gagal mengirim test: {result.get('error', 'Unknown error')}"
        )
    
    return {"success": True, "message": "Test notification sent", "chat_id": chat_id}
