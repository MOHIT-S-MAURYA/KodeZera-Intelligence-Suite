"""
Compliance, retention, and export services for audit module.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import timedelta
from typing import Optional
from uuid import UUID

from django.utils import timezone

from apps.core.models import (
    AuditEvent,
    AuditRetentionPolicy,
    ComplianceLog,
    DataDeletionLog,
)

logger = logging.getLogger(__name__)


# ── Compliance Service ─────────────────────────────────────────────────────

class ComplianceService:
    """GDPR Art 30 processing record management."""

    @classmethod
    def create_processing_record(
        cls,
        tenant_id: UUID,
        processing_purpose: str,
        data_categories: list[str],
        data_subjects: str,
        recipients: list[str],
        retention_period: str,
        legal_basis: str,
    ) -> ComplianceLog:
        return ComplianceLog.objects.create(
            tenant_id=tenant_id,
            processing_purpose=processing_purpose,
            data_categories=data_categories,
            data_subjects=data_subjects,
            recipients=recipients,
            retention_period=retention_period,
            legal_basis=legal_basis,
        )

    @classmethod
    def get_records(cls, tenant_id: UUID) -> list[ComplianceLog]:
        return list(ComplianceLog.objects.filter(tenant_id=tenant_id).order_by('-created_at'))

    @classmethod
    def generate_compliance_report(cls, tenant_id: UUID) -> dict:
        """Generate a compliance summary for a tenant."""
        records = cls.get_records(tenant_id)
        deletion_requests = DataDeletionLog.objects.filter(tenant_id=tenant_id)

        return {
            'tenant_id': str(tenant_id),
            'generated_at': timezone.now().isoformat(),
            'processing_records': len(records),
            'deletion_requests': {
                'total': deletion_requests.count(),
                'completed': deletion_requests.filter(status='completed').count(),
                'pending': deletion_requests.filter(status__in=['requested', 'in_progress']).count(),
            },
            'records': [
                {
                    'id': str(r.id),
                    'purpose': r.processing_purpose,
                    'data_categories': r.data_categories,
                    'legal_basis': r.legal_basis,
                }
                for r in records
            ],
        }


# ── Data Deletion Service ─────────────────────────────────────────────────

class DataDeletionService:
    """GDPR Art 17 right-to-erasure request management."""

    @classmethod
    def create_request(
        cls,
        tenant_id: UUID,
        requested_by_id: UUID,
        subject_user_id: UUID,
        data_scope: list[str],
        legal_basis: str,
    ) -> DataDeletionLog:
        return DataDeletionLog.objects.create(
            tenant_id=tenant_id,
            requested_by_id=requested_by_id,
            subject_user_id=subject_user_id,
            data_scope=data_scope,
            legal_basis=legal_basis,
            status='requested',
        )

    @classmethod
    def update_status(
        cls,
        request_id: UUID,
        status: str,
        deletion_proof: Optional[dict] = None,
    ) -> Optional[DataDeletionLog]:
        try:
            req = DataDeletionLog.objects.get(id=request_id)
        except DataDeletionLog.DoesNotExist:
            return None

        req.status = status
        if status == 'completed':
            req.completed_at = timezone.now()
            req.deletion_proof = deletion_proof or {}
        req.save()
        return req

    @classmethod
    def get_requests(cls, tenant_id: Optional[UUID] = None, limit: int = 50, offset: int = 0):
        qs = DataDeletionLog.objects.select_related('requested_by', 'subject_user')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        total = qs.count()
        items = list(qs.order_by('-created_at')[offset:offset + limit])
        return items, total


# ── Export Service ─────────────────────────────────────────────────────────

class ExportService:
    """Export audit events in various formats."""

    @classmethod
    def export_csv(
        cls,
        tenant_id: Optional[UUID] = None,
        scope: Optional[str] = None,
        date_from=None,
        date_to=None,
        limit: int = 10000,
    ) -> str:
        """Export audit events as CSV string."""
        from apps.core.services.audit_service import AuditService
        events, _ = AuditService.get_events(
            tenant_id=tenant_id,
            scope=scope,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
        )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            'timestamp', 'action', 'resource_type', 'resource_id',
            'user_email', 'outcome', 'ip_address', 'endpoint',
            'http_method', 'status_code',
        ])

        for event in events:
            writer.writerow([
                event.timestamp.isoformat(),
                event.action,
                event.resource_type,
                str(event.resource_id) if event.resource_id else '',
                event.user.email if event.user else '',
                event.outcome,
                event.ip_address or '',
                event.endpoint,
                event.http_method,
                event.status_code or '',
            ])

        return output.getvalue()

    @classmethod
    def export_json(
        cls,
        tenant_id: Optional[UUID] = None,
        scope: Optional[str] = None,
        date_from=None,
        date_to=None,
        limit: int = 10000,
    ) -> list[dict]:
        """Export audit events as list of dicts (for JSON response)."""
        from apps.core.services.audit_service import AuditService
        events, _ = AuditService.get_events(
            tenant_id=tenant_id,
            scope=scope,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
        )

        return [
            {
                'id': str(event.id),
                'timestamp': event.timestamp.isoformat(),
                'scope': event.scope,
                'action': event.action,
                'resource_type': event.resource_type,
                'resource_id': str(event.resource_id) if event.resource_id else None,
                'user_email': event.user.email if event.user else None,
                'outcome': event.outcome,
                'ip_address': event.ip_address,
                'endpoint': event.endpoint,
                'http_method': event.http_method,
                'status_code': event.status_code,
                'changes': event.changes,
                'metadata': event.metadata,
            }
            for event in events
        ]


# ── Retention Service ──────────────────────────────────────────────────────

class RetentionService:
    """Manage audit event archival and cleanup based on retention policies."""

    @classmethod
    def get_policies(cls, tenant_id: Optional[UUID] = None) -> list[AuditRetentionPolicy]:
        qs = AuditRetentionPolicy.objects.filter(is_active=True)
        if tenant_id:
            # Tenant-specific + global policies
            qs = qs.filter(models_Q_tenant_or_global(tenant_id))
        return list(qs)

    @classmethod
    def apply_retention(cls) -> dict:
        """
        Apply retention policies: delete events older than their retention period.
        Intended to be called from a periodic Celery task.
        """
        now = timezone.now()
        policies = AuditRetentionPolicy.objects.filter(is_active=True)
        results = {}

        for policy in policies:
            cutoff = now - timedelta(days=policy.retention_days)
            qs = AuditEvent.objects.filter(
                retention_class=policy.retention_class,
                timestamp__lt=cutoff,
            )
            if policy.tenant_id:
                qs = qs.filter(tenant_id=policy.tenant_id)

            count = qs.count()
            if count > 0:
                qs.delete()
                results[f"{policy.retention_class}:{policy.tenant_id or 'global'}"] = count
                logger.info(
                    "Retention: deleted %d events (class=%s, tenant=%s)",
                    count, policy.retention_class, policy.tenant_id or 'global',
                )

        return results


def models_Q_tenant_or_global(tenant_id):
    """Build a Q filter for tenant-specific + global (tenant=NULL) policies."""
    from django.db.models import Q
    return Q(tenant_id=tenant_id) | Q(tenant__isnull=True)
