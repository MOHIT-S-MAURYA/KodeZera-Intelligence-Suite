"""
Core authentication service.
Orchestrates login flow: credentials → lockout check → password verify →
MFA challenge (if enabled) → session creation → token issuance.
"""
import secrets
from django.core.cache import cache
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.models import User, LoginAttempt
from apps.core.services.lockout import LockoutService
from apps.core.services.session_manager import SessionManagerService
import logging

logger = logging.getLogger(__name__)

MFA_SESSION_TTL = 300  # 5 minutes
MFA_SESSION_PREFIX = 'mfa_session'


class AuthenticationError(Exception):
    """Raised for auth failures — carries code + message for the API layer."""
    def __init__(self, message: str, code: str = 'auth_error', status: int = 401):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


class AuthenticationService:
    """Stateless authentication service — all methods are classmethods."""

    @classmethod
    def authenticate(cls, email: str, password: str, request=None):
        """
        Full login flow.

        Returns either:
          - Token dict  { 'access', 'refresh', 'user', 'session_id' }
          - MFA dict    { 'mfa_required': True, 'mfa_session': ..., 'methods': [...] }

        Raises AuthenticationError on failure.
        """
        ip = cls._get_ip(request)
        ua = request.META.get('HTTP_USER_AGENT', '') if request else ''

        # 1. Lockout check
        locked, remaining = LockoutService.is_locked(email)
        if locked:
            cls._log_attempt(email, ip, ua, False, 'account_locked')
            raise AuthenticationError(
                f'Account is temporarily locked. Try again in {remaining} seconds.',
                code='account_locked',
                status=403,
            )

        # 2. User lookup
        try:
            user = User.objects.select_related('tenant').get(email=email)
        except User.DoesNotExist:
            LockoutService.record_failed_attempt(email)
            cls._log_attempt(email, ip, ua, False, 'invalid_credentials')
            raise AuthenticationError('Invalid credentials', code='invalid_credentials')

        # 3. Password check
        if not user.check_password(password):
            LockoutService.record_failed_attempt(email)
            cls._log_attempt(email, ip, ua, False, 'invalid_password')
            raise AuthenticationError('Invalid credentials', code='invalid_credentials')

        # 4. Account / tenant status
        if not user.is_active:
            cls._log_attempt(email, ip, ua, False, 'account_deactivated')
            raise AuthenticationError(
                'Your account has been deactivated. Please contact your administrator.',
                code='account_deactivated',
                status=403,
            )

        if user.tenant and not user.tenant.is_active:
            cls._log_attempt(email, ip, ua, False, 'tenant_deactivated')
            raise AuthenticationError(
                'Your organization has been deactivated by the platform owner. Please contact support.',
                code='tenant_deactivated',
                status=403,
            )

        # 5. MFA challenge
        if user.mfa_enabled:
            mfa_session = cls._create_mfa_session(user)
            methods = cls._get_mfa_methods(user)
            cls._log_attempt(email, ip, ua, True, '', mfa_method='pending')
            return {
                'mfa_required': True,
                'mfa_session': mfa_session,
                'methods': methods,
            }

        # 6. Issue tokens + session (no MFA)
        LockoutService.record_success(email)
        return cls._issue_tokens(user, request, ip, ua)

    @classmethod
    def verify_mfa(cls, mfa_session_token: str, method: str, code: str, request=None):
        """
        Verify an MFA code and complete login.
        Returns token dict on success.
        """
        ip = cls._get_ip(request)
        ua = request.META.get('HTTP_USER_AGENT', '') if request else ''

        cache_key = f"{MFA_SESSION_PREFIX}:{mfa_session_token}"
        session_data = cache.get(cache_key)
        if not session_data:
            raise AuthenticationError('MFA session expired or invalid.', code='mfa_expired')

        user_id = session_data.get('user_id')
        email = session_data.get('email', '')
        attempts = session_data.get('attempts', 0)

        if attempts >= 5:
            cache.delete(cache_key)
            raise AuthenticationError('Too many MFA attempts. Please login again.', code='mfa_max_attempts')

        try:
            user = User.objects.select_related('tenant').get(id=user_id)
        except User.DoesNotExist:
            raise AuthenticationError('Invalid MFA session.', code='mfa_error')

        # Verify the code
        verified = cls._verify_mfa_code(user, method, code)
        if not verified:
            session_data['attempts'] = attempts + 1
            cache.set(cache_key, session_data, MFA_SESSION_TTL)
            cls._log_attempt(email, ip, ua, False, 'mfa_failed', mfa_method=method)
            raise AuthenticationError('Invalid verification code.', code='mfa_invalid')

        # MFA passed — clean up and issue tokens
        cache.delete(cache_key)
        LockoutService.record_success(email)
        cls._log_attempt(email, ip, ua, True, '', mfa_method=method)
        return cls._issue_tokens(user, request, ip, ua)

    @classmethod
    def logout(cls, user, request=None):
        """Revoke the current session."""
        jti = cls._get_current_jti(request)
        if jti:
            from apps.core.models import UserSession
            session = UserSession.objects.filter(refresh_token_jti=jti, user=user).first()
            if session:
                SessionManagerService.revoke_session(session.id)

    @classmethod
    def logout_all(cls, user, request=None):
        """Revoke all sessions, optionally keeping the current one."""
        current_jti = cls._get_current_jti(request)
        return SessionManagerService.revoke_all_sessions(user, exclude_current_jti=current_jti)

    # ── Internal helpers ─────────────────────────────────────────────────

    @classmethod
    def _issue_tokens(cls, user, request, ip: str, ua: str) -> dict:
        """Generate JWT pair, create session, log success."""
        refresh = RefreshToken.for_user(user)
        session = SessionManagerService.create_session(user, refresh, request) if request else None

        cls._log_attempt(user.email, ip, ua, True, '')

        return {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'session_id': str(session.id) if session else None,
            'user': {
                'id': str(user.id),
                'email': user.email,
                'username': user.username,
                'full_name': user.full_name,
                'is_tenant_admin': user.is_tenant_admin,
                'isPlatformOwner': user.is_superuser and user.tenant is None,
                'mfa_enabled': user.mfa_enabled,
                'force_password_change': user.force_password_change,
                'tenant': {
                    'id': str(user.tenant.id),
                    'name': user.tenant.name,
                } if user.tenant else None,
            },
        }

    @classmethod
    def _create_mfa_session(cls, user) -> str:
        """Store a short-lived MFA session in Redis and return the token."""
        token = secrets.token_urlsafe(32)
        cache.set(f"{MFA_SESSION_PREFIX}:{token}", {
            'user_id': str(user.id),
            'email': user.email,
            'attempts': 0,
        }, MFA_SESSION_TTL)
        return token

    @classmethod
    def _get_mfa_methods(cls, user) -> list[str]:
        """Return list of MFA methods the user has set up."""
        from apps.core.models import MFADevice
        return list(
            MFADevice.objects.filter(user=user, is_verified=True)
            .values_list('device_type', flat=True)
            .distinct()
        )

    @classmethod
    def _verify_mfa_code(cls, user, method: str, code: str) -> bool:
        """Verify an MFA code for the given method."""
        from apps.core.models import MFADevice
        if method == 'totp':
            device = MFADevice.objects.filter(
                user=user, device_type='totp', is_verified=True,
            ).first()
            if not device or not device.secret:
                return False
            try:
                import pyotp
                totp = pyotp.TOTP(device.secret)
                valid = totp.verify(code, valid_window=1)
                if valid:
                    device.last_used_at = timezone.now()
                    device.save(update_fields=['last_used_at'])
                return valid
            except Exception:
                return False
        elif method == 'email':
            # Email OTP verification via Redis
            cache_key = f"mfa_email_otp:{user.id}"
            stored = cache.get(cache_key)
            if stored and stored == code:
                cache.delete(cache_key)
                return True
            return False
        return False

    @staticmethod
    def _log_attempt(email, ip, ua, success, reason, mfa_method=''):
        LoginAttempt.objects.create(
            email=email,
            ip_address=ip or '0.0.0.0',
            user_agent=ua[:500],
            success=success,
            failure_reason=reason,
            mfa_method=mfa_method,
        )

    @staticmethod
    def _get_ip(request) -> str:
        if not request:
            return '0.0.0.0'
        xff = request.META.get('HTTP_X_FORWARDED_FOR')
        return xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR', '0.0.0.0')

    @staticmethod
    def _get_current_jti(request) -> str | None:
        """Extract JTI from the current refresh token in request body."""
        if not request:
            return None
        refresh_str = request.data.get('refresh')
        if not refresh_str:
            return None
        try:
            from rest_framework_simplejwt.tokens import UntypedToken
            token = UntypedToken(refresh_str)
            return str(token.get('jti', ''))
        except Exception:
            return None
