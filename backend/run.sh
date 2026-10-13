# SIPGURU Backend Run Script
# Set DEVELOPMENT=1 to use SQLite for local testing

export DEVELOPMENT=1
export SUPABASE_URL=placeholder
export SUPABASE_ANON_KEY=placeholder
export SUPABASE_SERVICE_KEY=placeholder
export RESEND_API_KEY=re_placeholder
export JWT_SECRET=your_jwt_secret_at_least_32_chars

uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
