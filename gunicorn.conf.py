# Gunicorn production configuration
# Reference: https://docs.gunicorn.org/en/stable/configure.html

import multiprocessing
import os

# ─── Binding ────────────────────────────────────────────────────────────────
bind = "0.0.0.0:8000"

# ─── Workers ────────────────────────────────────────────────────────────────
# Formula: (2 × CPU cores) + 1  — safe default for I/O-bound Django apps
workers = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))

# Each worker handles N concurrent requests via threads (avoids GIL for I/O)
threads = int(os.getenv("GUNICORN_THREADS", 2))

# Worker type: sync is safest for Django; use gevent if you add async views
worker_class = os.getenv("GUNICORN_WORKER_CLASS", "sync")

# ─── Timeouts ────────────────────────────────────────────────────────────────
# RAG queries can take a while (embedding + LLM call), so be generous
timeout = int(os.getenv("GUNICORN_TIMEOUT", 120))
graceful_timeout = 30
keepalive = 5

# ─── Logging ────────────────────────────────────────────────────────────────
accesslog = "-"          # stdout → captured by Docker / systemd
errorlog  = "-"          # stderr
loglevel  = os.getenv("GUNICORN_LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sμs'

# ─── Process naming ──────────────────────────────────────────────────────────
proc_name = "kodezera"
default_proc_name = "kodezera"

# ─── Security ────────────────────────────────────────────────────────────────
# Limit request line + headers to prevent trivial DoS
limit_request_line    = 4096
limit_request_fields  = 100
limit_request_field_size = 8190

# ─── Worker recycling ────────────────────────────────────────────────────────
# Recycle workers after N requests to guard against memory leaks
max_requests          = int(os.getenv("GUNICORN_MAX_REQUESTS", 1000))
max_requests_jitter   = 50   # Random spread to avoid thundering herd
