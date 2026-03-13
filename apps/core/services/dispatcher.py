"""
Notification dispatcher — Celery tasks for multi-channel delivery.

Handles asynchronous delivery of notifications through channels:
  - in_app:       already delivered synchronously during fan-out
  - email:        queued and sent via Django email backend
  - browser_push: placeholder for Web Push (future)
  - webhook:      placeholder for webhook delivery (future)
"""
from __future__ import annotations

import logging
from uuid import UUID

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def dispatch_pending_deliveries(self):
    """
    Process all pending delivery records.
    Run periodically via Celery beat (every 30 seconds or so).
    """
    from apps.core.models import DeliveryRecord

    pending = DeliveryRecord.objects.filter(
        status='pending',
    ).select_related('user_notification', 'user_notification__user')[:200]

    for record in pending:
        try:
            _deliver(record)
        except Exception as exc:
            logger.error(f"Delivery failed for {record.id}: {exc}")
            record.retry_count += 1
            if record.retry_count >= 3:
                record.status = 'failed'
                record.failure_reason = str(exc)[:500]
            else:
                record.status = 'pending'
                record.next_retry_at = timezone.now() + timezone.timedelta(
                    seconds=60 * (2 ** record.retry_count)
                )
            record.save(update_fields=['status', 'retry_count', 'failure_reason', 'next_retry_at'])


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def deliver_single(self, delivery_record_id: str):
    """Deliver a single notification record."""
    from apps.core.models import DeliveryRecord

    try:
        record = DeliveryRecord.objects.select_related(
            'user_notification', 'user_notification__user',
        ).get(id=delivery_record_id)
    except DeliveryRecord.DoesNotExist:
        logger.warning(f"DeliveryRecord {delivery_record_id} not found")
        return

    try:
        _deliver(record)
    except Exception as exc:
        record.retry_count += 1
        if record.retry_count >= 3:
            record.status = 'failed'
            record.failure_reason = str(exc)[:500]
            record.save(update_fields=['status', 'retry_count', 'failure_reason'])
        else:
            record.save(update_fields=['retry_count'])
            raise self.retry(exc=exc)


def _deliver(record):
    """Route delivery to the appropriate channel handler."""
    from apps.core.models import DeliveryRecord

    handler = CHANNEL_HANDLERS.get(record.channel)
    if not handler:
        record.status = 'skipped'
        record.failure_reason = f"No handler for channel: {record.channel}"
        record.save(update_fields=['status', 'failure_reason'])
        return

    handler(record)


def _deliver_email(record):
    """Send notification via email."""
    from django.core.mail import send_mail
    from django.conf import settings as django_settings

    un = record.user_notification
    user = un.user

    if not user.email:
        record.status = 'skipped'
        record.failure_reason = 'User has no email address'
        record.save(update_fields=['status', 'failure_reason'])
        return

    subject = un.metadata.get('email_subject', un.title)
    body = un.metadata.get('email_body', un.message)

    send_mail(
        subject=subject,
        message=body,
        from_email=getattr(django_settings, 'DEFAULT_FROM_EMAIL', 'noreply@example.com'),
        recipient_list=[user.email],
        fail_silently=False,
    )

    record.status = 'delivered'
    record.sent_at = timezone.now()
    record.delivered_at = timezone.now()
    record.save(update_fields=['status', 'sent_at', 'delivered_at'])


def _deliver_browser_push(record):
    """Placeholder for Web Push delivery."""
    logger.info(f"Browser push not implemented yet, skipping record {record.id}")
    record.status = 'skipped'
    record.failure_reason = 'Browser push not yet implemented'
    record.save(update_fields=['status', 'failure_reason'])


def _deliver_webhook(record):
    """Placeholder for webhook delivery."""
    logger.info(f"Webhook not implemented yet, skipping record {record.id}")
    record.status = 'skipped'
    record.failure_reason = 'Webhook not yet implemented'
    record.save(update_fields=['status', 'failure_reason'])


CHANNEL_HANDLERS = {
    'email': _deliver_email,
    'browser_push': _deliver_browser_push,
    'webhook': _deliver_webhook,
    # 'in_app' is handled synchronously during fan-out, no async task needed
}


# ── Digest processing ─────────────────────────────────────────────────────

@shared_task
def process_digests(mode: str = 'hourly'):
    """
    Process queued digest notifications.
    Should be called by Celery beat: hourly / daily / weekly.
    """
    from apps.core.models import DigestQueue, UserNotification
    from django.db.models import Count
    from itertools import groupby
    from operator import attrgetter

    queued = DigestQueue.objects.filter(
        digest_mode=mode,
        processed=False,
    ).select_related('user', 'user_notification').order_by('user_id')

    # Group by user
    for user_id, items in groupby(queued, key=attrgetter('user_id')):
        items_list = list(items)
        if not items_list:
            continue

        user = items_list[0].user
        notifications = [item.user_notification for item in items_list]

        # Build digest email
        _send_digest_email(user, notifications, mode)

        # Mark processed
        DigestQueue.objects.filter(
            id__in=[item.id for item in items_list]
        ).update(processed=True)

    logger.info(f"Processed {mode} digests")


def _send_digest_email(user, notifications, mode):
    """Send a digest email summarizing multiple notifications."""
    from django.core.mail import send_mail
    from django.conf import settings as django_settings

    if not user.email:
        return

    count = len(notifications)
    subject = f"You have {count} notification{'s' if count != 1 else ''} ({mode} digest)"

    lines = []
    for n in notifications[:20]:  # Cap at 20 items in digest
        lines.append(f"• {n.title}: {n.message}")
    if count > 20:
        lines.append(f"  ... and {count - 20} more")

    body = '\n'.join(lines)

    send_mail(
        subject=subject,
        message=body,
        from_email=getattr(django_settings, 'DEFAULT_FROM_EMAIL', 'noreply@example.com'),
        recipient_list=[user.email],
        fail_silently=True,
    )
