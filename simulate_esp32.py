#!/usr/bin/env python3
"""
SIPGURU ESP32 Simulator
Simulate ESP32 polling room-state & auto-generate QR tokens
"""

import requests
import time
from datetime import datetime

API_BASE = "https://sipguru-production.up.railway.app"
ROOM_CODE = "RR1"
POLL_INTERVAL = 10  # 10 detik (biar cepat test, ESP32 asli 60s)

def log(msg):
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}")

def get_room_state():
    """Simulate ESP32 polling /api/qr/room-state/{room_code}"""
    try:
        resp = requests.get(f"{API_BASE}/api/qr/room-state/{ROOM_CODE}", timeout=5)
        if resp.status_code == 200:
            return resp.json()
        else:
            log(f"HTTP {resp.status_code}: {resp.text}")
            return None
    except Exception as e:
        log(f"Request failed: {e}")
        return None

def auto_generate_token(schedule_id, token_type="entry"):
    """Simulate ESP32 auto-generating QR token"""
    try:
        resp = requests.post(
            f"{API_BASE}/api/qr/auto-token/{schedule_id}",
            json={"token_type": token_type},
            headers={"Content-Type": "application/json"},
            timeout=5
        )
        if resp.status_code in [200, 201]:
            return resp.json()
        else:
            log(f"Token generation failed: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        log(f"Token request failed: {e}")
        return None

def display_token(token_data):
    """Simulate ESP32 OLED display"""
    log("=" * 50)
    log("📱 QR TOKEN GENERATED")
    log("=" * 50)
    log(f"Room: {token_data.get('room_id', 'N/A')[:8]}...")
    log(f"Schedule: {token_data.get('schedule_id', 'N/A')[:8]}...")
    log(f"Type: {token_data.get('token_type', 'N/A')}")
    log(f"Token: {token_data.get('token', 'N/A')[:32]}...")
    log(f"Expires: {token_data.get('expires_at', 'N/A')}")
    log(f"Countdown: {token_data.get('expires_in', 0)}s")
    log("=" * 50)

def main():
    log("🚀 SIPGURU ESP32 Simulator Started")
    log(f"Room Code: {ROOM_CODE}")
    log(f"Poll Interval: {POLL_INTERVAL}s")
    log("-" * 50)
    
    last_schedule_id = None
    last_state = None
    
    while True:
        log("Polling room state...")
        data = get_room_state()
        
        if not data:
            log("⚠️  Failed to fetch room state, retrying...")
            time.sleep(POLL_INTERVAL)
            continue
        
        state = data.get("state", "UNKNOWN")
        current_sched = data.get("current_schedule")
        next_sched = data.get("next_schedule")
        
        log(f"State: {state} | Current: {current_sched['subject_name'] if current_sched else 'None'} | Next: {next_sched['subject_name'] if next_sched else 'None'}")
        
        # State machine logic (same as ESP32)
        if state == "PRE_CLASS" and next_sched:
            log("⏰ PRE_CLASS detected - generating ENTRY token...")
            token_data = auto_generate_token(next_sched["id"], "entry")
            if token_data:
                display_token(token_data)
                last_schedule_id = next_sched["id"]
        
        elif state == "CLASS_ACTIVE" and current_sched:
            if last_schedule_id != current_sched["id"]:
                log("✅ CLASS_ACTIVE detected - generating ENTRY token...")
                token_data = auto_generate_token(current_sched["id"], "entry")
                if token_data:
                    display_token(token_data)
                    last_schedule_id = current_sched["id"]
            else:
                log("✓ Token already generated for this class")
        
        elif state == "CLASS_ENDED":
            log("🏁 CLASS_ENDED - clearing token")
            last_schedule_id = None
        
        elif state == "TEACHER_ABSENT":
            log("⚠️  TEACHER_ABSENT - admin notified")
        
        elif state == "IDLE":
            log("💤 IDLE - waiting for next class")
        
        log("-" * 50)
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\n👋 Simulator stopped by user")
