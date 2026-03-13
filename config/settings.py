"""Environment-aware settings loader.

Set APP_ENV to one of: development, staging, production, testing.
Default: development.
"""
import os

APP_ENV = os.environ.get('APP_ENV', 'development').strip().lower()

if APP_ENV == 'production':
    from .settings_production import *  # noqa: F401,F403
elif APP_ENV == 'staging':
    from .settings_staging import *  # noqa: F401,F403
elif APP_ENV == 'testing':
    from .settings_testing import *  # noqa: F401,F403
else:
    from .settings_development import *  # noqa: F401,F403
