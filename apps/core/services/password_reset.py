"""
Forgot / Reset password service.

Generates a 6-digit OTP, stores the hash in PasswordResetToken,
sends via NotificationService, verifies OTP and resets password.
"""
import hashlib
import secrets
from datetime import timedelta

from django.utils import timezone

from apps.core.models import PasswordResetToken, User
from apps.core.services.password import PasswordService


OTP_EXPIRY_MINUTES = 10
MAX_ACTIVE_TOKENS = 3  # per user, to rate-limit


class PasswordResetError(Exception):
    def __init__(self, message, code='reset_error'):
        self.message = message
        self.code = code
        super().__init__(message)


class PasswordResetService:

    @staticmethod
    def request_reset(email: str) -> None:
        """
        Generate OTP → store hashed → send email.
        Always returns None (don't reveal whether user exists).
        """
        try:
            user = User.objects.get(email__iexact=email, is_active=True)
        except User.DoesNotExist:
            return  # silent – don't leak user existence

        # Rate-limit: max 3 active tokens per user
        active = PasswordResetToken.objects.filter(
            user=user, is_used=False, expires_at__gt=timezone.now()
        ).count()
        if active >= MAX_ACTIVE_TOKENS:
            return  # silently refuse

        otp = f"{secrets.randbelow(10**6):06d}"
        otp_hash = hashlib.sha256(otp.encode()).hexdigest()

        PasswordResetToken.objects.create(
            user=user,
            otp_hash=otp_hash,
            expires_at=timezone.now() + timedelta(minutes=OTP_EXPIRY_MINUTES),
        )

        # Send email via notification service (best-effort)
        try:
            from apps.core.services.notifications import NotificationService
            NotificationService.send_notification(
                user=user,
                notification_type='password_reset',
                title='Password Reset Code',
                message=f'Your password reset code is: {otp}. It expires in {OTP_EXPIRY_MINUTES} minutes.',
                channels=['email'],
            )
        except Exception:
            pass  # log in production

    @staticmethod
    def verify_and_reset(email: str, otp: str, new_password: str) -> list[str]:
        """
        Verify OTP and set new password.
        Returns list of errors (empty == success).
        """
        try:
            user = User.objects.get(email__iexact=email, is_active=True)
        except User.DoesNotExist:
            return ['Invalid email or OTP.']

        otp_hash = hashlib.sha256(otp.encode()).hexdigest()
        token = (
            PasswordResetToken.objects
            .filter(user=user, otp_hash=otp_hash, is_used=False)
            .order_by('-created_at')
            .first()
        )

        if not token or token.is_expired:
            return ['Invalid or expired OTP.']

        # Set password with history check
        errors = PasswordService.set_password_with_history(user, new_password)
        if errors:
            return errors

        # Mark token used and invalidate all other tokens for this user
        PasswordResetToken.objects.filter(user=user, is_used=False).update(is_used=True)
        return []
