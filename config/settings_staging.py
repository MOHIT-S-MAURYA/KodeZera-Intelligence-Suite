"""Staging settings."""
from .settings_base import *  # noqa: F401,F403

DEBUG = config('DEBUG', default=False, cast=bool)
LOG_FORMAT = config('LOG_FORMAT', default='json').lower()

LOGGING['handlers']['console']['formatter'] = 'json' if LOG_FORMAT == 'json' else 'verbose'
