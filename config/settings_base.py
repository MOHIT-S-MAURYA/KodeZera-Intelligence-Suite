"""
Django settings for Kodezera Intelligence Suite.
"""
import os
import json
from pathlib import Path
from datetime import timedelta
from decouple import config

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-this-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=True, cast=bool)

if not DEBUG and SECRET_KEY == 'django-insecure-change-this-in-production':
    raise RuntimeError('SECRET_KEY must be set in non-debug environments')

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_extensions',
    
    # Local apps
    'apps.core',
    'apps.rbac',
    'apps.documents',
    'apps.rag',
    'apps.analytics',
    'apps.api',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.core.middleware.CorrelationMiddleware',
    'apps.core.middleware.TimingMiddleware',
    'apps.core.middleware.TenantIsolationMiddleware',
    'apps.core.middleware.QuotaEnforcementMiddleware',
    'apps.core.middleware.AuditLoggingMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database
import dj_database_url
DATABASES = {
    'default': dj_database_url.config(
        default=config('DATABASE_URL', default='sqlite:///db.sqlite3'),
        conn_max_age=600
    )
}

# Custom User Model
AUTH_USER_MODEL = 'core.User'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Media files
MEDIA_URL = 'media/'
MEDIA_ROOT = config('MEDIA_ROOT', default=str(BASE_DIR / 'media'))
MAX_UPLOAD_SIZE = config('MAX_UPLOAD_SIZE', default=52428800, cast=int)  # 50MB

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
    # ─── Per-tenant throttling ───────────────────────────────────────────────
    # Applied globally; individual views can override with throttle_classes.
    # TenantQueryThrottle keys by tenant_id — all users in a tenant share the
    # same bucket, preventing noisy-neighbour resource exhaustion.
    'DEFAULT_THROTTLE_CLASSES': [
        'apps.core.throttle.TenantQueryThrottle',
        'apps.core.throttle.UserQueryThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'tenant_query':  config('TENANT_QUERY_RATE',  default='200/minute'),
        'tenant_upload': config('TENANT_UPLOAD_RATE', default='50/hour'),
        'user_query':    config('USER_QUERY_RATE',    default='30/minute'),
    },
}

# Plan-based throttle configuration (used by PlanAware throttles)
PLAN_THROTTLE_RATES = {
    'tenant_query': {
        'basic': config('THROTTLE_TENANT_QUERY_BASIC', default='200/minute'),
        'pro': config('THROTTLE_TENANT_QUERY_PRO', default='400/minute'),
        'enterprise': config('THROTTLE_TENANT_QUERY_ENTERPRISE', default='800/minute'),
    },
    'user_query': {
        'basic': config('THROTTLE_USER_QUERY_BASIC', default='30/minute'),
        'pro': config('THROTTLE_USER_QUERY_PRO', default='60/minute'),
        'enterprise': config('THROTTLE_USER_QUERY_ENTERPRISE', default='120/minute'),
    },
    'tenant_upload': {
        'basic': config('THROTTLE_TENANT_UPLOAD_BASIC', default='50/hour'),
        'pro': config('THROTTLE_TENANT_UPLOAD_PRO', default='100/hour'),
        'enterprise': config('THROTTLE_TENANT_UPLOAD_ENTERPRISE', default='200/hour'),
    },
}

# JWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(seconds=config('JWT_ACCESS_TOKEN_LIFETIME', default=3600, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(seconds=config('JWT_REFRESH_TOKEN_LIFETIME', default=86400, cast=int)),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': config('JWT_SECRET_KEY', default=SECRET_KEY),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

# CORS Settings
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://localhost:5173,http://localhost:5174'
).split(',')
CORS_ALLOW_CREDENTIALS = True

# Redis Configuration
REDIS_URL = config('REDIS_URL', default='redis://localhost:6379/0')

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': REDIS_URL,
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        },
        'KEY_PREFIX': 'kodezera',
        'TIMEOUT': 3600,  # 1 hour default
    }
}

# Celery Configuration
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/1')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://localhost:6379/2')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes
# Route CPU-heavy embedding tasks to a dedicated queue so they don't
# block real-time chat-query tasks on the default queue.
CELERY_TASK_ROUTES = {
    'apps.documents.tasks.process_document_task': {'queue': 'embedding'},
    'apps.rag.tasks.*':                       {'queue': 'embedding'},
}
CELERY_TASK_DEFAULT_QUEUE = 'default'
CELERY_TASK_QUEUES_MAX_PRIORITY = 10

# Qdrant Configuration
# Set QDRANT_LOCAL_PATH for a persistent local store (no server needed).
# Leave empty to use QDRANT_URL (remote server) or fall back to in-memory.
QDRANT_URL = config('QDRANT_URL', default='http://localhost:6333')
QDRANT_API_KEY = config('QDRANT_API_KEY', default='')
QDRANT_LOCAL_PATH = config('QDRANT_LOCAL_PATH', default=str(BASE_DIR / 'qdrant_data'))
QDRANT_COLLECTION_NAME = config('QDRANT_COLLECTION_NAME', default='kodezera_documents')

# Embedding Configuration
# Provider: sentence_transformers (default, local, no key), openai, huggingface, dev
# VECTOR_DIMENSION must match the model output dimension:
#   all-MiniLM-L6-v2 (sentence_transformers) → 384
#   text-embedding-3-small (openai)           → 1536
EMBEDDING_PROVIDER = config('EMBEDDING_PROVIDER', default='sentence_transformers')
EMBEDDING_MODEL = config('EMBEDDING_MODEL', default='all-MiniLM-L6-v2')
VECTOR_DIMENSION = config('VECTOR_DIMENSION', default=384, cast=int)

# OpenAI / LLM Configuration
OPENAI_API_KEY = config('OPENAI_API_KEY', default='')
LLM_MODEL = config('LLM_MODEL', default='gpt-4-turbo-preview')

# RAG Configuration
RAG_CHUNK_SIZE = 500  # tokens
RAG_CHUNK_OVERLAP = 50  # tokens
RAG_TOP_K = 5  # number of chunks to retrieve
RAG_CONTEXT_MAX_TOKENS = 2000

# Rate Limiting
RATELIMIT_ENABLE = config('RATELIMIT_ENABLE', default=True, cast=bool)
RAG_QUERY_RATE_LIMIT = config('RAG_QUERY_RATE_LIMIT', default='10/m')
DOCUMENT_UPLOAD_RATE_LIMIT = config('DOCUMENT_UPLOAD_RATE_LIMIT', default='20/h')

# Allowed document file types (extension → expected MIME)
ALLOWED_FILE_TYPES = {
    '.pdf':  'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc':  'application/msword',
    '.txt':  'text/plain',
    '.csv':  'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.md':   'text/markdown',
}

# Tenant Quota Enforcement
# Max AI queries a single tenant can make per calendar day.
# Platform owners are exempt. Set to 0 to disable.
TENANT_DAILY_QUERY_LIMIT = config('TENANT_DAILY_QUERY_LIMIT', default=500, cast=int)

# Frontend URL (used in emails)
FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:5173')

# Email — in dev print to console; set SMTP vars in .env for prod
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='noreply@kodezera.com')

# Logging
_LOG_LEVEL = 'DEBUG' if DEBUG else 'INFO'
LOG_FORMAT = config('LOG_FORMAT', default='text').lower()


class JsonFormatter:
    """Minimal JSON log formatter for structured log aggregation."""

    def format(self, record):
        payload = {
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'line': record.lineno,
            'time': self.formatTime(record),
        }
        if record.exc_info:
            payload['exc_info'] = self.formatException(record.exc_info)
        return json.dumps(payload)

    # Keep parity with logging.Formatter API without importing subclass.
    def formatTime(self, record):
        import datetime
        return datetime.datetime.utcfromtimestamp(record.created).isoformat() + 'Z'

    def formatException(self, exc_info):
        import traceback
        return ''.join(traceback.format_exception(*exc_info)).strip()


LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{levelname}] {asctime} {name} {module}:{lineno} — {message}',
            'style': '{',
        },
        'simple': {
            'format': '[{levelname}] {message}',
            'style': '{',
        },
        'json': {
            '()': 'config.settings_base.JsonFormatter',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'json' if LOG_FORMAT == 'json' else 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': _LOG_LEVEL,
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING' if not DEBUG else 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': _LOG_LEVEL,
            'propagate': False,
        },
        'celery': {
            'handlers': ['console'],
            'level': _LOG_LEVEL,
            'propagate': False,
        },
    },
}

# Security Settings
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# Optional Sentry integration
SENTRY_DSN = config('SENTRY_DSN', default='')
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            integrations=[DjangoIntegration()],
            traces_sample_rate=config('SENTRY_TRACES_SAMPLE_RATE', default=0.0, cast=float),
            send_default_pii=False,
            environment=config('SENTRY_ENVIRONMENT', default='development'),
        )
    except Exception as sentry_exc:
        import logging
        logging.getLogger(__name__).warning('Sentry initialization failed: %s', sentry_exc)
