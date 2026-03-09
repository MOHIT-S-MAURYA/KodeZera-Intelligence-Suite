"""
Middleware for tenant isolation and audit logging.
"""
import threading
from django.utils.deprecation import MiddlewareMixin
from apps.core.models import AuditLog


class TenantIsolationMiddleware(MiddlewareMixin):
    """
    Middleware to enforce tenant isolation.
    Extracts tenant from authenticated user and validates tenant status.
    """
    
    def process_request(self, request):
        """Attach tenant to request if user is authenticated."""
        if hasattr(request, 'user') and request.user.is_authenticated:
            request.tenant = request.user.tenant
            
            # Block requests if tenant is inactive
            if request.tenant and not request.tenant.is_active:
                from django.http import JsonResponse
                return JsonResponse(
                    {
                        'error': 'Your organization has been deactivated by the platform owner. Please contact support.',
                        'code': 'tenant_deactivated',
                    },
                    status=403
                )
        else:
            request.tenant = None
        
        return None


class AuditLoggingMiddleware(MiddlewareMixin):
    """
    Middleware to log write operations for audit trail.

    Why JWT users were previously missed:
      Django's AuthenticationMiddleware resolves request.user from the session.
      REST Framework performs JWT authentication lazily on its own Request wrapper,
      so at the middleware layer request.user is AnonymousUser for token-only calls.
      We resolve this by falling back to DRF's JWTAuthentication when the Django
      user is anonymous, so that API write operations are correctly attributed.
    """

    WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']
    SKIP_PATHS = ['/admin/', '/static/', '/media/']

    def _resolve_user_and_tenant_id(self, request):
        """
        Return (user, tenant_id) for this request.
        Checks Django session user first, then falls back to JWT authentication
        so that token-only API clients (no session cookie) are correctly logged.
        Uses tenant_id (raw UUID) to avoid any FK traversal in a background thread.
        Returns (None, None) if the request is unauthenticated.
        """
        # Session-based auth path (admin UI, browsable API)
        user = getattr(request, 'user', None)
        if user and user.is_authenticated:
            tenant_id = getattr(user, 'tenant_id', None)
            return user, tenant_id

        # JWT auth path: DRF authenticates lazily; the Django request still holds
        # the raw Bearer token in META, so we invoke the JWT backend directly.
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            from rest_framework.request import Request as DRFRequest
            drf_req = DRFRequest(request)
            result = JWTAuthentication().authenticate(drf_req)
            if result:
                jwt_user, _ = result
                tenant_id = getattr(jwt_user, 'tenant_id', None)
                return jwt_user, tenant_id
        except Exception:
            pass

        return None, None

    def process_response(self, request, response):
        """Log write operations after successful response."""
        if request.method not in self.WRITE_METHODS:
            return response

        if any(request.path.startswith(p) for p in self.SKIP_PATHS):
            return response

        # Only log successful operations
        if response.status_code >= 400:
            return response

        user, tenant_id = self._resolve_user_and_tenant_id(request)
        if not user:
            return response

        action        = self._get_action(request.method)
        resource_type = self._extract_resource_type(request.path)

        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        ip_address = x_forwarded_for.split(',')[0] if x_forwarded_for else request.META.get('REMOTE_ADDR')

        # Capture all values needed in the background thread BEFORE thread starts
        # so we never access request/user after the response is sent.
        _tenant_id     = tenant_id
        _user_id       = user.pk
        _action        = action
        _resource_type = resource_type
        _meta          = {'path': request.path, 'method': request.method}
        _ip            = ip_address
        _ua            = request.META.get('HTTP_USER_AGENT', '')[:500]

        def _write():
            try:
                AuditLog.objects.create(
                    tenant_id=_tenant_id,
                    user_id=_user_id,
                    action=_action,
                    resource_type=_resource_type,
                    metadata=_meta,
                    ip_address=_ip,
                    user_agent=_ua,
                )
            except Exception:
                pass

        threading.Thread(target=_write, daemon=True).start()
        return response

    def _get_action(self, method):
        """Map HTTP method to audit action."""
        return {'POST': 'create', 'PUT': 'update', 'PATCH': 'update', 'DELETE': 'delete'}.get(method, 'unknown')

    def _extract_resource_type(self, path):
        """
        Extract resource type from URL path.
        /api/v1/roles/         → roles
        /api/v1/departments/   → departments
        Skips 'api' and version segments (e.g. 'v1', 'v2').
        """
        import re
        parts = [p for p in path.split('/') if p]
        for part in parts:
            # Skip 'api' prefix and version segments like v1, v2
            if part == 'api' or re.fullmatch(r'v\d+', part):
                continue
            return part
        return 'unknown'
