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
    'run-health-checks': {
        'task': 'apps.core.tasks.run_health_checks',
        'schedule': 60.0,  # Every 60 seconds
    },
    'flush-metering-to-db': {
        'task': 'apps.core.tasks.flush_metering_to_db',
        'schedule': 300.0,  # Every 5 minutes
    },
    'dispatch-pending-notifications': {
        'task': 'apps.core.services.dispatcher.dispatch_pending_deliveries',
        'schedule': 30.0,  # Every 30 seconds
    },
    'process-hourly-digests': {
        'task': 'apps.core.services.dispatcher.process_digests',
        'schedule': crontab(minute=0),  # Every hour
        'args': ('hourly',),
    },
    'process-daily-digests': {
        'task': 'apps.core.services.dispatcher.process_digests',
        'schedule': crontab(minute=0, hour=8),  # Daily at 8 AM
        'args': ('daily',),
    },
    'process-weekly-digests': {
        'task': 'apps.core.services.dispatcher.process_digests',
        'schedule': crontab(minute=0, hour=8, day_of_week='monday'),  # Monday 8 AM
        'args': ('weekly',),
    },
    # ── Analytics aggregation pipeline ─────────────────────────────────────
    'analytics-flush-minute-metrics': {
        'task': 'apps.analytics.tasks.flush_minute_metrics',
        'schedule': 300.0,  # Every 5 minutes
    },
    'analytics-aggregate-hourly': {
        'task': 'apps.analytics.tasks.aggregate_hourly',
        'schedule': crontab(minute=5),  # Every hour at :05
    },
    'analytics-aggregate-monthly': {
        'task': 'apps.analytics.tasks.aggregate_monthly',
        'schedule': crontab(minute=0, hour=1, day_of_month=1),  # 1st of month 01:00
    },
    'analytics-cleanup-old-metrics': {
        'task': 'apps.analytics.tasks.cleanup_old_metrics',
        'schedule': crontab(minute=0, hour=3),  # Daily at 03:00
    },
    'analytics-evaluate-alert-rules': {
        'task': 'apps.analytics.tasks.evaluate_alert_rules',
        'schedule': crontab(minute=30),  # Every hour at :30
    },
}


@app.task(bind=True)
def debug_task(self):
    """Debug task for testing Celery."""
    print(f'Request: {self.request!r}')
