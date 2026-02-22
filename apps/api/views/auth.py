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
            {'error': 'Account is inactive'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Check if tenant is active
    if user.tenant and not user.tenant.is_active:
        return Response(
            {'error': 'Organization account is inactive'},
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
