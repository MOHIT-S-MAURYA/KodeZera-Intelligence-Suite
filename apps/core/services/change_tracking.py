"""
Change tracking mixin — captures field-level before / after diffs on save().

Usage:
    class MyModel(AuditedModelMixin, models.Model):
        name = models.CharField(max_length=255)
        ...

    obj = MyModel.objects.get(pk=pk)
    obj.name = 'new name'
    obj.save(audit_user=request.user, audit_tenant_id=request.tenant.id)
"""
from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from django.db import models
from django.forms.models import model_to_dict

logger = logging.getLogger(__name__)


class AuditedModelMixin(models.Model):
    """
    Mixin that tracks field-level changes and auto-logs an AuditEvent on save().
    """

    # Fields to exclude from change tracking
    AUDIT_EXCLUDE_FIELDS = {'created_at', 'updated_at', 'modified_at', 'last_login'}

    class Meta:
        abstract = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Snapshot the initial field values after load
        self._audit_original: dict = self._snapshot() if self.pk else {}

    def _snapshot(self) -> dict:
        """Capture current field values for later comparison."""
        data = {}
        for field in self._meta.concrete_fields:
            if field.name in self.AUDIT_EXCLUDE_FIELDS:
                continue
            data[field.name] = getattr(self, field.attname)
        return data

    def get_changes(self) -> dict:
        """
        Returns a dict of changed fields: {field: {old: ..., new: ...}}.
        """
        if not self._audit_original:
            return {}

        current = self._snapshot()
        changes = {}
        for key, new_val in current.items():
            old_val = self._audit_original.get(key)
            if old_val != new_val:
                changes[key] = {
                    'old': str(old_val) if old_val is not None else None,
                    'new': str(new_val) if new_val is not None else None,
                }
        return changes

    def save(self, *args, audit_user=None, audit_tenant_id=None, audit_action=None, **kwargs):
        """
        Override save() to capture changes and log an AuditEvent.
        Pass audit_user and audit_tenant_id to enable automatic audit logging.
        """
        is_new = self.pk is None
        changes = {} if is_new else self.get_changes()

        super().save(*args, **kwargs)

        # Re-snapshot after save
        self._audit_original = self._snapshot()

        # Only log if audit context is provided
        if audit_user or audit_tenant_id:
            action = audit_action or ('create' if is_new else 'update')
            self._log_audit(action, changes, audit_user, audit_tenant_id)

    def delete(self, *args, audit_user=None, audit_tenant_id=None, **kwargs):
        """Override delete to log an AuditEvent."""
        if audit_user or audit_tenant_id:
            self._log_audit('delete', {}, audit_user, audit_tenant_id)
        return super().delete(*args, **kwargs)

    def _log_audit(
        self,
        action: str,
        changes: dict,
        user: Optional[object] = None,
        tenant_id: Optional[UUID] = None,
    ):
        """Create an AuditEvent for this model change."""
        try:
            from apps.core.services.audit_service import AuditService
            resource_type = self._meta.model_name
            AuditService.log(
                action=action,
                resource_type=resource_type,
                tenant_id=tenant_id,
                user=user,
                resource_id=self.pk,
                changes=changes,
                trigger='manual',
            )
        except Exception:
            logger.debug("AuditedModelMixin failed to log event", exc_info=True)
