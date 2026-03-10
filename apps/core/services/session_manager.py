"""
Session management service.
Creates, tracks, and revokes per-device login sessions.
"""
import hashlib
from uuid import UUID
from django.utils import timezone
from datetime import timedelta
from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
import logging

logger = logging.getLogger(__name__)

DEFAULT_SESSION_LIFETIME = 7  # days


def _parse_device_name(user_agent: str) -> str:
    """Extract a human-readable device name from User-Agent."""
    ua = user_agent.lower()
    browser = 'Unknown Browser'
    os_name = 'Unknown OS'

    if 'chrome' in ua and 'edg' not in ua:
        browser = 'Chrome'
    elif 'firefox' in ua:
        browser = 'Firefox'
    elif 'safari' in ua and 'chrome' not in ua:
        browser = 'Safari'
    elif 'edg' in ua:
        browser = 'Edge'

    if 'windows' in ua:
        os_name = 'Windows'
    elif 'macintosh' in ua or 'mac os' in ua:
        os_name = 'macOS'
    elif 'linux' in ua:
        os_name = 'Linux'
    elif 'iphone' in ua:
        os_name = 'iPhone'
    elif 'android' in ua:
        os_name = 'Android'

    return f"{browser} on {os_name}"


def _compute_fingerprint(user_agent: str, ip_address: str) -> str:
    """SHA-256 hash of user-agent + IP prefix (first 3 octets)."""
    ip_prefix = '.'.join(ip_address.split('.')[:3]) if '.' in ip_address else ip_address
    raw = f"{user_agent}|{ip_prefix}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


class SessionManagerService:
    """Manages user sessions tied to refresh tokens."""

    @classmethod
    def create_session(cls, user, refresh_token: RefreshToken, request) -> 'UserSession':
        """
        Create a session record after successful authentication.
        Returns the created UserSession instance.
        """
        from apps.core.models import UserSession

        ua = request.META.get('HTTP_USER_AGENT', '')
        xff = request.META.get('HTTP_X_FORWARDED_FOR')
        ip = xff.split(',')[0].strip() if xff else request.META.get('REMOTE_ADDR', '0.0.0.0')

        jti = str(refresh_token.get('jti', ''))
        lifetime_days = getattr(settings, 'SESSION_LIFETIME_DAYS', DEFAULT_SESSION_LIFETIME)
        expires = timezone.now() + timedelta(days=lifetime_days)

        session = UserSession.objects.create(
            user=user,
            refresh_token_jti=jti,
            device_fingerprint=_compute_fingerprint(ua, ip),
            device_name=_parse_device_name(ua),
            ip_address=ip,
            expires_at=expires,
        )
        return session

    @classmethod
    def get_active_sessions(cls, user):
        """Return active, non-expired sessions for a user."""
        from apps.core.models import UserSession
        now = timezone.now()
        return UserSession.objects.filter(
            user=user, is_active=True, expires_at__gt=now,
        ).order_by('-last_active_at')

    @classmethod
    def revoke_session(cls, session_id: UUID, user=None):
        """
        Revoke a specific session. If user is provided, ensures ownership.
        Also blacklists the associated refresh token.
        """
        from apps.core.models import UserSession
        qs = UserSession.objects.filter(id=session_id, is_active=True)
        if user:
            qs = qs.filter(user=user)
        session = qs.first()
        if not session:
            return False

        session.is_active = False
        session.save(update_fields=['is_active'])

        cls._blacklist_jti(session.refresh_token_jti)
        return True

    @classmethod
    def revoke_all_sessions(cls, user, exclude_current_jti: str | None = None):
        """Revoke all active sessions for user, optionally keeping the current one."""
        from apps.core.models import UserSession
        qs = UserSession.objects.filter(user=user, is_active=True)
        if exclude_current_jti:
            qs = qs.exclude(refresh_token_jti=exclude_current_jti)

        sessions = list(qs)
        for session in sessions:
            cls._blacklist_jti(session.refresh_token_jti)

        qs.update(is_active=False)
        return len(sessions)

    @classmethod
    def touch_session(cls, jti: str):
        """Update last_active_at for the session (called on token refresh)."""
        from apps.core.models import UserSession
        UserSession.objects.filter(
            refresh_token_jti=jti, is_active=True,
        ).update(last_active_at=timezone.now())

    @classmethod
    def cleanup_expired(cls):
        """Delete sessions that expired more than 7 days ago."""
        from apps.core.models import UserSession
        cutoff = timezone.now() - timedelta(days=7)
        deleted, _ = UserSession.objects.filter(expires_at__lt=cutoff).delete()
        return deleted

    @staticmethod
    def _blacklist_jti(jti: str):
        """Attempt to blacklist a refresh token by JTI."""
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            token = OutstandingToken.objects.filter(jti=jti).first()
            if token:
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            logger.debug("Could not blacklist JTI %s (blacklist app may not be installed)", jti)
