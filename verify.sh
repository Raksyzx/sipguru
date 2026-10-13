#!/bin/bash
set -euo pipefail

echo "🔍 Gate 1: Spec compliance (manual check)"
# Check against SPEC.md if exists

echo "🔍 Gate 2: Tests"
cd backend && uv run pytest -x -q && cd ..
cd frontend && npm test -- --passWithNoTests && cd ..

echo "🔍 Gate 3: Quality"
cd backend && uv run ruff check . && uv run mypy . && cd ..
cd frontend && npm run lint && cd ..

echo "🔍 Gate 4: Runtime (smoke test)"
# Start backend briefly
cd backend
uv run uvicorn app:app --port 8000 &
PID=$!
sleep 2
curl -sf http://localhost:8000/health || (kill $PID 2>/dev/null; exit 1)
kill $PID 2>/dev/null || true
cd ..

echo "🔍 Gate 5: Integration"
# DB migrations (if alembic)
cd backend && uv run alembic upgrade head && uv run alembic downgrade -1 && cd ..

echo "✅ All gates passed"
