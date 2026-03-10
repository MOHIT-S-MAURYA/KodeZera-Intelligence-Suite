"""
MFA service — TOTP setup/verify and email OTP generation.
"""
import secrets
import base64
import io
from django.core.cache import cache
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

EMAIL_OTP_TTL = 300  # 5 minutes
EMAIL_OTP_LENGTH = 6


class MFAService:
    """Service for managing multi-factor authentication devices and verification."""

    @classmethod
    def setup_totp(cls, user) -> dict:
        """
        Start TOTP setup. Returns provisioning URI and base32 secret.
        The device is created as unverified until confirm_totp() is called.
        """
        from apps.core.models import MFADevice
        try:
            import pyotp
        except ImportError:
            raise RuntimeError('pyotp is required for TOTP support. Install it with: pip install pyotp')

        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=user.email,
            issuer_name='Kodezera',
        )

        # Create unverified device
        device, _ = MFADevice.objects.update_or_create(
            user=user,
            device_type='totp',
            is_verified=False,
            defaults={
                'name': 'Authenticator App',
                'secret': secret,
            },
        )

        # Generate QR code as base64 data URL
        qr_data_url = cls._generate_qr_base64(provisioning_uri)

        return {
            'device_id': str(device.id),
            'secret': secret,
            'provisioning_uri': provisioning_uri,
            'qr_code': qr_data_url,
        }

    @classmethod
    def confirm_totp(cls, user, code: str) -> bool:
        """
        Verify the initial TOTP code to confirm device setup.
        Returns True if verified, False if invalid code.
        """
        from apps.core.models import MFADevice
        try:
            import pyotp
        except ImportError:
            return False

        device = MFADevice.objects.filter(
            user=user, device_type='totp', is_verified=False,
        ).first()
        if not device or not device.secret:
            return False

        totp = pyotp.TOTP(device.secret)
        if not totp.verify(code, valid_window=1):
            return False

        device.is_verified = True
        device.is_primary = True
        device.last_used_at = timezone.now()
        device.save(update_fields=['is_verified', 'is_primary', 'last_used_at'])

        # Enable MFA on user
        user.mfa_enabled = True
        user.save(update_fields=['mfa_enabled', 'updated_at'])
        return True

    @classmethod
    def send_email_otp(cls, user) -> bool:
        """
        Generate a 6-digit OTP and send it to the user's email.
        The OTP is stored in Redis.
        """
        otp = ''.join([str(secrets.randbelow(10)) for _ in range(EMAIL_OTP_LENGTH)])
        cache_key = f"mfa_email_otp:{user.id}"
        cache.set(cache_key, otp, EMAIL_OTP_TTL)

        # Send via notification service
        try:
            from apps.core.services.notifications import NotificationService
            NotificationService.notify_user(
                tenant_id=user.tenant_id,
                user_id=user.id,
                title='Your verification code',
                message=f'Your verification code is: {otp}. It expires in 5 minutes.',
                category='security',
            )
            logger.info("Email OTP sent to user %s", user.email)
            return True
        except Exception:
            logger.error("Failed to send email OTP to %s", user.email, exc_info=True)
            return False

    @classmethod
    def list_devices(cls, user) -> list[dict]:
        """List verified MFA devices for user."""
        from apps.core.models import MFADevice
        devices = MFADevice.objects.filter(user=user, is_verified=True)
        return [
            {
                'id': str(d.id),
                'device_type': d.device_type,
                'name': d.name,
                'is_primary': d.is_primary,
                'last_used_at': d.last_used_at.isoformat() if d.last_used_at else None,
                'created_at': d.created_at.isoformat(),
            }
            for d in devices
        ]

    @classmethod
    def remove_device(cls, user, device_id: str) -> bool:
        """Remove an MFA device. Disables MFA if no devices remain."""
        from apps.core.models import MFADevice
        deleted, _ = MFADevice.objects.filter(user=user, id=device_id).delete()
        if deleted:
            remaining = MFADevice.objects.filter(user=user, is_verified=True).count()
            if remaining == 0:
                user.mfa_enabled = False
                user.save(update_fields=['mfa_enabled', 'updated_at'])
        return deleted > 0

    @classmethod
    def disable_mfa(cls, user):
        """Disable MFA entirely — removes all devices."""
        from apps.core.models import MFADevice
        MFADevice.objects.filter(user=user).delete()
        user.mfa_enabled = False
        user.save(update_fields=['mfa_enabled', 'updated_at'])

    @staticmethod
    def _generate_qr_base64(data: str) -> str:
        """Generate a QR code as a base64 data URL. Returns empty string if qrcode not installed."""
        try:
            import qrcode
            img = qrcode.make(data)
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            buffer.seek(0)
            encoded = base64.b64encode(buffer.getvalue()).decode()
            return f"data:image/png;base64,{encoded}"
        except ImportError:
            logger.debug("qrcode package not installed — QR code generation skipped")
            return ''
