"""
Authentication views.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from apps.core.models import User


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Login endpoint.
    Returns JWT access and refresh tokens.
    """
    email = request.data.get('email')
    password = request.data.get('password')
    
    if not email or not password:
        return Response(
            {'error': 'Email and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Single query fetches user + tenant in one JOIN — avoids a second DB hit
    # for the tenant.is_active check below.
    try:
        user = User.objects.select_related('tenant').get(email=email)
    except User.DoesNotExist:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    if not user.check_password(password):
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    # Check if user is active
    if not user.is_active:
        return Response(
            {
                'error': 'Your account has been deactivated. Please contact your administrator.',
                'code': 'account_deactivated',
            },
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Check if tenant is active
    if user.tenant and not user.tenant.is_active:
        return Response(
            {
                'error': 'Your organization has been deactivated by the platform owner. Please contact support.',
                'code': 'tenant_deactivated',
            },
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Generate tokens
    refresh = RefreshToken.for_user(user)
    
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': str(user.id),
            'email': user.email,
            'username': user.username,
            'full_name': user.full_name,
            'is_tenant_admin': user.is_tenant_admin,
            'isPlatformOwner': user.is_superuser and user.tenant is None,
            'tenant': {
                'id': str(user.tenant.id),
                'name': user.tenant.name,
            } if user.tenant else None
        }
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_token_view(request):
    """
    Refresh token endpoint.
    Uses DRF Simple JWT's built-in refresh.
    """
    from rest_framework_simplejwt.views import TokenRefreshView
    view = TokenRefreshView.as_view()
    return view(request._request)


from rest_framework.permissions import IsAuthenticated
from apps.api.serializers import UserSerializer

@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def me_view(request):
    """
    Endpoint for users to fetch or update their own profile.
    Supports updating first_name, last_name, and profile_metadata.
    """
    user = request.user
    if request.method == 'GET':
        serializer = UserSerializer(user)
        return Response(serializer.data)
    
    # PUT or PATCH
    # Only allow safe fields to be updated by the user themselves
    allowed_data = {
        key: value for key, value in request.data.items()
        if key in ['first_name', 'last_name', 'profile_metadata']
    }
    
    serializer = UserSerializer(user, data=allowed_data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """
    Allows an authenticated user to change their own password.
    Requires the current password for verification.
    """
    user = request.user
    current_password = request.data.get('current_password', '').strip()
    new_password = request.data.get('new_password', '').strip()

    if not current_password or not new_password:
        return Response(
            {'error': 'current_password and new_password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not user.check_password(current_password):
        return Response(
            {'error': 'Current password is incorrect'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if current_password == new_password:
        return Response(
            {'error': 'New password must be different from your current password'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if len(new_password) < 8:
        return Response(
            {'error': 'New password must be at least 8 characters'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user.set_password(new_password)
    user.save()
    return Response({'message': 'Password changed successfully'})
