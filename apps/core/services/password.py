"""
Password validation, complexity enforcement, and history management.
"""
import re
import hashlib
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone


# ── Complexity Rules ─────────────────────────────────────────────────────
# Min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character

PASSWORD_MIN_LENGTH = 8
PASSWORD_HISTORY_DEPTH = 5  # reject reuse of last N passwords


def validate_password_complexity(password: str) -> list[str]:
    """
    Returns a list of failure messages. Empty list means valid.
    """
    errors = []
    if len(password) < PASSWORD_MIN_LENGTH:
        errors.append(f'Password must be at least {PASSWORD_MIN_LENGTH} characters.')
    if not re.search(r'[A-Z]', password):
        errors.append('Password must contain at least one uppercase letter.')
    if not re.search(r'[a-z]', password):
        errors.append('Password must contain at least one lowercase letter.')
    if not re.search(r'\d', password):
        errors.append('Password must contain at least one digit.')
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':\"\\|,.<>\/?`~]', password):
        errors.append('Password must contain at least one special character.')
    return errors


class PasswordService:
    """Service for password-related operations."""

    @staticmethod
    def validate_new_password(password: str) -> list[str]:
        """Full complexity validation."""
        return validate_password_complexity(password)

    @staticmethod
    def check_password_history(user, raw_password: str) -> bool:
        """
        Returns True if the password was used in the last N changes.
        """
        from apps.core.models import PasswordHistory
        recent = PasswordHistory.objects.filter(
            user=user,
        ).order_by('-created_at')[:PASSWORD_HISTORY_DEPTH]

        for entry in recent:
            if check_password(raw_password, entry.password_hash):
                return True
        return False

    @staticmethod
    def record_password_change(user, raw_password: str):
        """
        Store the new password hash in history and update user timestamp.
        Call this AFTER user.set_password() + user.save().
        """
        from apps.core.models import PasswordHistory
        PasswordHistory.objects.create(
            user=user,
            password_hash=make_password(raw_password),
        )
        # Trim old entries beyond history depth
        old_ids = (
            PasswordHistory.objects.filter(user=user)
            .order_by('-created_at')
            .values_list('id', flat=True)[PASSWORD_HISTORY_DEPTH:]
        )
        if old_ids:
            PasswordHistory.objects.filter(id__in=list(old_ids)).delete()

    @staticmethod
    def set_password_with_history(user, raw_password: str):
        """
        Full password change: validate, set, record history, update timestamp.
        Returns list of errors (empty = success).
        """
        errors = validate_password_complexity(raw_password)
        if errors:
            return errors

        if PasswordService.check_password_history(user, raw_password):
            return [f'Cannot reuse any of your last {PASSWORD_HISTORY_DEPTH} passwords.']

        user.set_password(raw_password)
        user.password_changed_at = timezone.now()
        user.force_password_change = False
        user.save(update_fields=['password', 'password_changed_at', 'force_password_change', 'updated_at'])

        PasswordService.record_password_change(user, raw_password)
        return []
