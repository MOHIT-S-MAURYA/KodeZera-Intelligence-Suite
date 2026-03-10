"""
Authentication views — login, MFA, sessions, password reset, profile.
"""
import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.api.serializers import UserSerializer
from apps.api.serializers.auth import (
    LoginSerializer, MFAVerifySerializer, MFAConfirmSerializer,
    MFADisableSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
    ChangePasswordSerializer, SessionSerializer, MFADeviceSerializer,
)
from apps.core.services.authentication import AuthenticationService, AuthenticationError
from apps.core.services.mfa import MFAService
from apps.core.services.password import PasswordService
from apps.core.services.password_reset import PasswordResetService
from apps.core.services.session_manager import SessionManagerService

logger = logging.getLogger(__name__)


# ── Login / MFA / Tokens ────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """Login — returns tokens or MFA challenge."""
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        result = AuthenticationService.authenticate(
            email=serializer.validated_data['email'],
            password=serializer.validated_data['password'],
            request=request,
        )
        return Response(result)
    except AuthenticationError as e:
        return Response(
            {'error': e.message, 'code': e.code},
            status=e.status,
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def mfa_verify_view(request):
    """Verify MFA code during login."""
    serializer = MFAVerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        result = AuthenticationService.verify_mfa(
            mfa_session_token=serializer.validated_data['mfa_session'],
            method=serializer.validated_data['method'],
            code=serializer.validated_data['code'],
            request=request,
        )
        return Response(result)
    except AuthenticationError as e:
        return Response(
            {'error': e.message, 'code': e.code},
            status=e.status,
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def mfa_send_email_view(request):
    """Send email OTP for MFA during login (requires mfa_session)."""
    mfa_session = request.data.get('mfa_session')
    if not mfa_session:
        return Response({'error': 'mfa_session is required'}, status=status.HTTP_400_BAD_REQUEST)

    from django.core.cache import cache
    session_data = cache.get(f'mfa_session:{mfa_session}')
    if not session_data:
        return Response({'error': 'Invalid or expired MFA session'}, status=status.HTTP_401_UNAUTHORIZED)

    from apps.core.models import User
    try:
        user = User.objects.get(id=session_data['user_id'], is_active=True)
    except User.DoesNotExist:
        return Response({'error': 'Invalid session'}, status=status.HTTP_401_UNAUTHORIZED)

    MFAService.send_email_otp(user)
    return Response({'message': 'OTP sent to your email'})


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_token_view(request):
    """Refresh token — also touches session last_active_at."""
    from rest_framework_simplejwt.views import TokenRefreshView
    response = TokenRefreshView.as_view()(request._request)
    # Touch the session so it stays alive
    refresh = request.data.get('refresh')
    if refresh and response.status_code == 200:
        try:
            from rest_framework_simplejwt.tokens import UntypedToken
            jti = UntypedToken(refresh).get('jti')
            if jti:
                SessionManagerService.touch_session(jti)
        except Exception:
            pass
    return response


# ── Logout ───────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """Logout current session (blacklist current refresh token)."""
    try:
        AuthenticationService.logout(request.user, request)
        return Response({'message': 'Logged out successfully'})
    except AuthenticationError as e:
        return Response({'error': e.message}, status=e.status)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_all_view(request):
    """Logout all sessions for the current user."""
    try:
        count = AuthenticationService.logout_all(request.user, request)
        return Response({'message': f'Logged out from {count} sessions'})
    except AuthenticationError as e:
        return Response({'error': e.message}, status=e.status)


# ── Password ─────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """Change password for authenticated user. Enforces complexity + history."""
    serializer = ChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user = request.user
    if not user.check_password(serializer.validated_data['current_password']):
        return Response({'error': 'Current password is incorrect'}, status=status.HTTP_400_BAD_REQUEST)

    errors = PasswordService.set_password_with_history(
        user, serializer.validated_data['new_password'],
    )
    if errors:
        return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

    return Response({'message': 'Password changed successfully'})


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password_view(request):
    """Request a password reset OTP to be sent via email."""
    serializer = ForgotPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    PasswordResetService.request_reset(serializer.validated_data['email'])
    # Always return success to not leak user existence
    return Response({'message': 'If an account with that email exists, a reset code has been sent.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password_view(request):
    """Verify OTP and set a new password."""
    serializer = ResetPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    errors = PasswordResetService.verify_and_reset(
        email=serializer.validated_data['email'],
        otp=serializer.validated_data['otp'],
        new_password=serializer.validated_data['new_password'],
    )
    if errors:
        return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'message': 'Password has been reset successfully.'})


# ── Profile (me) ─────────────────────────────────────────────────────────────

@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def me_view(request):
    """Fetch or update own profile."""
    user = request.user
    if request.method == 'GET':
        serializer = UserSerializer(user)
        return Response(serializer.data)

    allowed_data = {
        key: value for key, value in request.data.items()
        if key in ['first_name', 'last_name', 'profile_metadata']
    }
    serializer = UserSerializer(user, data=allowed_data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ── Sessions ─────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def session_list_view(request):
    """List all active sessions for the current user."""
    sessions = SessionManagerService.get_active_sessions(request.user)
    # Identify current session
    current_jti = _get_current_jti(request)
    data = []
    for s in sessions:
        entry = SessionSerializer(s).data
        entry['is_current'] = (s.refresh_token_jti == current_jti)
        data.append(entry)
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def session_revoke_view(request, session_id):
    """Revoke a specific session."""
    try:
        SessionManagerService.revoke_session(session_id, user=request.user)
        return Response({'message': 'Session revoked'})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ── MFA management ───────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mfa_setup_view(request):
    """Start TOTP MFA setup — returns secret + QR code."""
    result = MFAService.setup_totp(request.user)
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mfa_confirm_view(request):
    """Confirm TOTP setup by verifying the first code."""
    serializer = MFAConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    ok = MFAService.confirm_totp(request.user, serializer.validated_data['code'])
    if not ok:
        return Response({'error': 'Invalid code'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'message': 'MFA enabled successfully'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mfa_devices_view(request):
    """List MFA devices for the current user."""
    devices = MFAService.list_devices(request.user)
    serializer = MFADeviceSerializer(devices, many=True)
    return Response(serializer.data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def mfa_device_delete_view(request, device_id):
    """Remove a specific MFA device."""
    ok = MFAService.remove_device(request.user, device_id)
    if not ok:
        return Response({'error': 'Device not found'}, status=status.HTTP_404_NOT_FOUND)
    return Response({'message': 'Device removed'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mfa_disable_view(request):
    """Disable MFA entirely — requires password confirmation."""
    serializer = MFADisableSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    if not request.user.check_password(serializer.validated_data['password']):
        return Response({'error': 'Incorrect password'}, status=status.HTTP_400_BAD_REQUEST)
    MFAService.disable_mfa(request.user)
    return Response({'message': 'MFA disabled'})


# ── Admin auth endpoints ─────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_force_reset_view(request, user_id):
    """Force a user to change password on next login (tenant admin only)."""
    from apps.core.models import User
    if not request.user.is_tenant_admin:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
    try:
        target = User.objects.get(id=user_id, tenant=request.user.tenant)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    target.force_password_change = True
    target.save(update_fields=['force_password_change'])
    return Response({'message': 'User will be required to change password on next login'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_unlock_view(request, user_id):
    """Unlock a locked-out user account (tenant admin only)."""
    from apps.core.services.lockout import LockoutService
    from apps.core.models import User
    if not request.user.is_tenant_admin:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
    try:
        target = User.objects.get(id=user_id, tenant=request.user.tenant)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    LockoutService.admin_unlock(target.email)
    return Response({'message': 'Account unlocked'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_user_sessions_view(request, user_id):
    """List active sessions for a user (tenant admin only)."""
    from apps.core.models import User
    if not request.user.is_tenant_admin:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
    try:
        target = User.objects.get(id=user_id, tenant=request.user.tenant)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    sessions = SessionManagerService.get_active_sessions(target)
    data = SessionSerializer(sessions, many=True).data
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_revoke_all_sessions_view(request, user_id):
    """Revoke all sessions for a user (tenant admin only)."""
    from apps.core.models import User
    if not request.user.is_tenant_admin:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
    try:
        target = User.objects.get(id=user_id, tenant=request.user.tenant)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    count = SessionManagerService.revoke_all_sessions(target)
    return Response({'message': f'Revoked {count} sessions'})


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_current_jti(request):
    """Extract JTI from the Authorization header token."""
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        auth = request.META.get('HTTP_AUTHORIZATION', '')
        if auth.startswith('Bearer '):
            token = AccessToken(auth.split(' ', 1)[1])
            return token.get('jti')
    except Exception:
        pass
    return None
