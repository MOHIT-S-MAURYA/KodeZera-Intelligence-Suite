"""
Celery configuration.
"""
import os
from celery import Celery
from celery.schedules import crontab

# Set default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('kodezera')

# Load config from Django settings
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from all installed apps
app.autodiscover_tasks()

# Periodic task schedule
app.conf.beat_schedule = {
    'cleanup-expired-assignments': {
        'task': 'apps.rbac.tasks.cleanup_expired_assignments',
        'schedule': crontab(minute=0, hour='*/6'),  # Every 6 hours
    },
    'cleanup-expired-sessions': {
        'task': 'apps.core.tasks.cleanup_expired_sessions',
        'schedule': crontab(minute=0, hour=3),  # Daily at 3 AM
    },
    'archive-old-login-attempts': {
        'task': 'apps.core.tasks.archive_old_login_attempts',
        'schedule': crontab(minute=0, hour=4, day_of_week='sunday'),  # Weekly Sunday 4 AM
    },
}


@app.task(bind=True)
def debug_task(self):
    """Debug task for testing Celery."""
    print(f'Request: {self.request!r}')
