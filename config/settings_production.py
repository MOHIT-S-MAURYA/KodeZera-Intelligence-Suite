"""Production settings."""
from .settings_base import *  # noqa: F401,F403

DEBUG = False
LOG_FORMAT = config('LOG_FORMAT', default='json').lower()
LOGGING['handlers']['console']['formatter'] = 'json' if LOG_FORMAT == 'json' else 'verbose'

# Force secure defaults in production.
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
