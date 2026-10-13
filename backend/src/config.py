import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Supabase (production only)
    SUPABASE_URL: str = "placeholder"
    SUPABASE_ANON_KEY: str = "placeholder"
    SUPABASE_SERVICE_KEY: str = "placeholder"
    
    # Resend (production only)
    RESEND_API_KEY: str = "placeholder"
    
    # JWT
    JWT_SECRET: str = "your_jwt_secret_at_least_32_chars_change_me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24
    
    # App
    APP_NAME: str = "SIPGURU"
    APP_URL: str = "http://localhost:3000"
    
    # Validation
    GEOFENCE_RADIUS_M: int = 150
    LATE_TOLERANCE_MINUTES: int = 15
    QR_EXPIRY_SECONDS: int = 30
    
    # CORS
    ALLOWED_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:3002",
        "http://100.98.171.97:3000",
        "http://100.98.171.97:3002",
        "http://192.168.100.110:3000",
        "http://192.168.100.110:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3002",
        "http://localhost:8000",
        "https://sipguru.vercel.app"
    ]
    
    # Mode
    DEVELOPMENT: bool = False
    
    class Config:
        env_file = ".env"

settings = Settings()
