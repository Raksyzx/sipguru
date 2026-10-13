# Backend Dockerfile for SIPGURU
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for cache)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Expose port
EXPOSE 8000

# Run server
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]