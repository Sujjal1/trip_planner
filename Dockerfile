FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# This is a public, domain-restricted Maps Embed key, never a server key.
ARG VITE_GOOGLE_MAPS_API_KEY
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/data/codrive.sqlite3 COOKIE_SECURE=true DEMO_MODE=false
WORKDIR /app
COPY backend/requirements.lock ./backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock \
    && useradd --uid 10001 --create-home codrive \
    && mkdir /data && chown codrive:codrive /data
COPY backend/main.py ./backend/main.py
COPY --from=frontend /build/dist ./frontend/dist
USER codrive
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
