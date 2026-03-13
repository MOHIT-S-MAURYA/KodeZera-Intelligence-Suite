"""
SHA-256 hash chain service for audit event tamper detection.

Each audit event stores the hash of the previous event, forming a chain.
If any event is modified or deleted, the chain breaks and is detectable.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Optional

from django.db import connection

logger = logging.getLogger(__name__)


class HashChainService:
    """Manages the SHA-256 hash chain across audit events."""

    @classmethod
    def compute_hash(
        cls,
        action: str,
        user_id: str,
        tenant_id: str,
        resource_type: str,
        resource_id: str,
        timestamp_str: str,
        changes: dict,
    ) -> tuple[str, str]:
        """
        Compute previous_hash + event_hash for a new audit event.

        Returns (previous_hash, event_hash).
        """
        from apps.core.models import AuditEvent

        # Get the most recent event's hash to form the chain link
        last_event = (
            AuditEvent.objects.order_by('-timestamp').values_list('event_hash', flat=True).first()
        )
        previous_hash = last_event or '0' * 64  # Genesis block

        # Build canonical payload
        payload = json.dumps(
            {
                'previous_hash': previous_hash,
                'action': action,
                'user_id': user_id,
                'tenant_id': tenant_id,
                'resource_type': resource_type,
                'resource_id': resource_id,
                'timestamp': timestamp_str,
                'changes': changes,
            },
            sort_keys=True,
            default=str,
        )

        event_hash = hashlib.sha256(payload.encode('utf-8')).hexdigest()
        return previous_hash, event_hash

    @classmethod
    def verify_chain(cls, limit: int = 1000, offset: int = 0) -> dict:
        """
        Verify the integrity of the audit hash chain.

        Returns {valid: bool, checked: int, first_break_id: UUID|None}.
        """
        from apps.core.models import AuditEvent

        events = list(
            AuditEvent.objects
            .order_by('timestamp')
            .values(
                'id', 'previous_hash', 'event_hash',
                'action', 'user_id', 'tenant_id',
                'resource_type', 'resource_id',
                'timestamp', 'changes',
            )[offset:offset + limit]
        )

        if not events:
            return {'valid': True, 'checked': 0, 'first_break_id': None}

        expected_previous = '0' * 64  # Genesis
        first_break_id = None
        checked = 0

        for event in events:
            checked += 1

            # Verify the previous_hash matches what we expect
            if event['previous_hash'] != expected_previous:
                first_break_id = event['id']
                break

            # Recompute event_hash and verify
            payload = json.dumps(
                {
                    'previous_hash': event['previous_hash'],
                    'action': event['action'],
                    'user_id': str(event['user_id']) if event['user_id'] else '',
                    'tenant_id': str(event['tenant_id']) if event['tenant_id'] else '',
                    'resource_type': event['resource_type'],
                    'resource_id': str(event['resource_id']) if event['resource_id'] else '',
                    'timestamp': event['timestamp'].isoformat() if hasattr(event['timestamp'], 'isoformat') else str(event['timestamp']),
                    'changes': event['changes'] or {},
                },
                sort_keys=True,
                default=str,
            )
            recomputed = hashlib.sha256(payload.encode('utf-8')).hexdigest()

            if recomputed != event['event_hash']:
                first_break_id = event['id']
                break

            expected_previous = event['event_hash']

        return {
            'valid': first_break_id is None,
            'checked': checked,
            'first_break_id': str(first_break_id) if first_break_id else None,
        }
