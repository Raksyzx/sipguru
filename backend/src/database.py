"""Database dependency - auto-selects correct DB client based on DEVELOPMENT mode"""
from src.config import settings

if settings.DEVELOPMENT:
    from src.local_db import LocalDBClient
    def get_db():
        return LocalDBClient()
else:
    from src.supabase import SupabaseClient
    def get_db():
        return SupabaseClient()