# ─── Stage 1: Build frontend ─────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline

COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Python dependencies ───────────────────────────────────────────
FROM python:3.11-slim AS python-deps

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# ─── Stage 3: Production image ───────────────────────────────────────────────
FROM python:3.11-slim AS production

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings

# Runtime system dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libmagic1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

WORKDIR /app

# Copy installed Python packages from deps stage
COPY --from=python-deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-deps /usr/local/bin/gunicorn /usr/local/bin/gunicorn
COPY --from=python-deps /usr/local/bin/celery   /usr/local/bin/celery

# Copy application code
COPY --chown=appuser:appgroup . .

# Copy built frontend into Django staticfiles directory
COPY --from=frontend-builder --chown=appuser:appgroup /frontend/dist ./frontend/dist

# Create required directories with correct ownership
RUN mkdir -p /app/media /app/staticfiles /app/logs && \
    chown -R appuser:appgroup /app/media /app/staticfiles /app/logs

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Switch to non-root user
USER appuser

EXPOSE 8000

# Health check — hits the Django health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--config", "gunicorn.conf.py"]
