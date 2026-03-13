"""
Celery tasks for authentication & session housekeeping,
scheduled health checks, and metering flush.
"""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def cleanup_expired_sessions():
    """Delete sessions that expired more than 7 days ago."""
    from apps.core.services.session_manager import SessionManagerService
    deleted = SessionManagerService.cleanup_expired()
    logger.info('Cleaned up %d expired sessions', deleted)
    return deleted


@shared_task
def archive_old_login_attempts():
    """Delete login attempt records older than 90 days."""
    from apps.core.models import LoginAttempt
    cutoff = timezone.now() - timedelta(days=90)
    count, _ = LoginAttempt.objects.filter(created_at__lt=cutoff).delete()
    logger.info('Archived %d old login attempts', count)
    return count


@shared_task
def run_health_checks():
    """Run all system health checks and persist results."""
    from apps.core.services.health import HealthService
    logs = HealthService.run_all_checks()
    logger.info('Health checks completed: %d components checked', len(logs))
    return len(logs)


@shared_task
def flush_metering_to_db():
    """
    Flush Redis metering counters into the UsageMetrics DB table.
    Runs periodically via Celery beat (every 5 minutes).
    """
    from datetime import date
    from apps.core.models import Tenant, UsageMetrics
    from apps.core.services.metering import MeteringService
    from apps.documents.models import Document

    today = date.today()
    tenants = Tenant.objects.filter(is_active=True)
    flushed = 0

    for tenant in tenants:
        tid = str(tenant.id)
        queries = MeteringService.get_queries(tid)
        failed = MeteringService.get_failed_queries(tid)
        tokens = MeteringService.get_tokens(tid)
        storage = MeteringService.get_storage_bytes(tid)
        doc_count = Document.objects.filter(tenant=tenant, is_deleted=False).count()
        user_count = tenant.users.filter(is_active=True).count()

        obj, created = UsageMetrics.objects.get_or_create(
            tenant=tenant, date=today,
        )
        obj.queries_count = queries
        obj.failed_queries_count = failed
        obj.tokens_used = tokens
        obj.storage_used_bytes = storage
        obj.documents_count = doc_count
        obj.active_users_count = user_count
        obj.save()
        flushed += 1

    logger.info('Metering flushed for %d tenants', flushed)
    return flushed
