"""
Celery tasks for authentication & session housekeeping.
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
