"""
SIPGURU Backend
FastAPI Server with SQLite for local development

Environment:
- DEVELOPMENT=1 for local SQLite
- SUPABASE_* vars for production with Supabase
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from src.config import settings
from src.endpoints import auth, teacher, admin, qr, attendance, reports, telegram, devices

app = FastAPI(
    title="SIPGURU API",
    description="3-Layer Validation Teacher Attendance System",
    version="1.0.0",
)

# CORS for local + network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files (for production)
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # If it's an API route, let it 404 to be handled by routers
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        # Serve index.html for all other routes (SPA)
        index_file = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        from fastapi import HTTPException
        raise HTTPException(status_code=404)

@app.get("/")
async def root():
    from src.config import is_development
    db_type = "SQLite" if is_development() else "Supabase"
    return {"message": "SIPGURU API is running", "version": "1.0.0", "database": db_type}

@app.get("/health")
async def health():
    return {"status": "healthy"}

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(teacher.router, prefix="/api/teacher", tags=["Teacher"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(qr.router, prefix="/api/qr", tags=["QR Token"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["Attendance"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(telegram.router, prefix="/api/telegram", tags=["Telegram Notifications"])
app.include_router(devices.router, prefix="/api/devices", tags=["ESP32 Devices"])

