""" FastAPI Backend run script for Windows """

import os
import sys
import subprocess

# Set environment for local SQLite mode
os.environ["DEVELOPMENT"] = "1"
os.environ["SUPABASE_URL"] = "placeholder"
os.environ["SUPABASE_ANON_KEY"] = "placeholder"
os.environ["SUPABASE_SERVICE_KEY"] = "placeholder"
os.environ["RESEND_API_KEY"] = "re_placeholder"
os.environ["JWT_SECRET"] = "your_jwt_secret_at_least_32_chars"

if __name__ == "__main__":
    # Run uvicorn
    subprocess.run([
        sys.executable, "-m", "uvicorn", "src.main:app",
        "--reload", "--host", "0.0.0.0", "--port", "8000"
    ])
