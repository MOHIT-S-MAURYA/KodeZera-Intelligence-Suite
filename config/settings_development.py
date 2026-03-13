"""Development settings."""
from .settings_base import *  # noqa: F401,F403

DEBUG = True
LOG_FORMAT = config('LOG_FORMAT', default='text').lower()
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

LOGGING['handlers']['console']['formatter'] = 'json' if LOG_FORMAT == 'json' else 'verbose'
