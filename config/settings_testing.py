"""Test settings."""
from .settings_base import *  # noqa: F401,F403

DEBUG = False
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
LOG_FORMAT = 'text'
LOGGING['handlers']['console']['formatter'] = 'verbose'
