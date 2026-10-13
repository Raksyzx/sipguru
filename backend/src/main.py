"""
SIPGURU Backend
FastAPI Server with SQLite for local development

Environment:
- DEVELOPMENT=1 for local SQLite
- SUPABASE_* vars for production with Supabase
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.endpoints import auth, teacher, admin, qr, attendance, reports, telegram

app = FastAPI(
    title="SIPGURU API",
    description="3-Layer Validation Teacher Attendance System",
    version="1.0.0"
)

# CORS for local + network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

