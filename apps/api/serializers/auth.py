"""
Serializers for authentication, sessions, MFA, and password management.
"""
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class MFAVerifySerializer(serializers.Serializer):
    mfa_session = serializers.CharField()
    method = serializers.ChoiceField(choices=['totp', 'email'])
    code = serializers.CharField(max_length=10)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=10)
    new_password = serializers.CharField(min_length=8, write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=8, write_only=True)


class SessionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    device_name = serializers.CharField()
    ip_address = serializers.CharField()
    location = serializers.CharField()
    is_active = serializers.BooleanField()
    last_active_at = serializers.DateTimeField()
    created_at = serializers.DateTimeField()
    is_current = serializers.BooleanField(default=False)


class MFASetupSerializer(serializers.Serializer):
    """Response serializer for TOTP setup."""
    device_id = serializers.UUIDField()
    secret = serializers.CharField()
    provisioning_uri = serializers.CharField()
    qr_code = serializers.CharField()


class MFAConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)


class MFADisableSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)


class MFADeviceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    device_type = serializers.CharField()
    name = serializers.CharField()
    is_primary = serializers.BooleanField()
    last_used_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()


class LoginAttemptSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    ip_address = serializers.CharField()
    success = serializers.BooleanField()
    failure_reason = serializers.CharField()
    mfa_method = serializers.CharField()
    created_at = serializers.DateTimeField()


class TenantSSOConfigSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    provider_type = serializers.ChoiceField(choices=['saml', 'oidc'])
    entity_id = serializers.URLField(required=False, allow_blank=True)
    login_url = serializers.URLField(required=False, allow_blank=True)
    certificate = serializers.CharField(required=False, allow_blank=True)
    role_mapping = serializers.DictField(required=False)
    auto_provision = serializers.BooleanField(default=True)
    is_active = serializers.BooleanField(default=True)
