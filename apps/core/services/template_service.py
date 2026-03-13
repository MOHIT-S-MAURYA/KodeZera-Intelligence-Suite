"""
Notification template rendering service.

Renders notification templates with context variables using simple string
formatting (Python str format_map with safe fallback).
"""
from __future__ import annotations

import re
from typing import Optional

from apps.core.models import NotificationTemplate


class _SafeDict(dict):
    """Dict that returns the key placeholder for missing keys."""
    def __missing__(self, key: str) -> str:
        return f'{{{key}}}'


def _render(template_str: str, context: dict) -> str:
    """Render a template string with {{ var }} placeholders."""
    # Convert {{ var }} to {var} for format_map
    converted = re.sub(r'\{\{\s*(\w+)\s*\}\}', r'{\1}', template_str)
    return converted.format_map(_SafeDict(context))


class TemplateService:
    """Resolve and render notification templates."""

    @staticmethod
    def get_template(key: str) -> Optional[NotificationTemplate]:
        try:
            return NotificationTemplate.objects.get(key=key, is_active=True)
        except NotificationTemplate.DoesNotExist:
            return None

    @staticmethod
    def render(template: NotificationTemplate, context: dict) -> dict:
        """
        Render a template with context. Returns dict with:
        title, message, email_subject, email_body, category, priority, channels
        """
        return {
            'title': _render(template.title_template, context),
            'message': _render(template.message_template, context),
            'email_subject': _render(template.email_subject, context) if template.email_subject else '',
            'email_body': _render(template.email_body, context) if template.email_body else '',
            'category': template.category,
            'priority': template.default_priority,
            'channels': template.default_channels or ['in_app'],
        }
