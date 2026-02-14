"""
Middleware for tenant isolation and audit logging.
"""
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
                    {'error': 'Tenant is inactive'},
                    status=403
                )
        else:
            request.tenant = None
        
        return None


class AuditLoggingMiddleware(MiddlewareMixin):
    """
    Middleware to log write operations for audit trail.
    """
    
    WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']
    SKIP_PATHS = ['/admin/', '/static/', '/media/']
    
    def process_response(self, request, response):
        """Log write operations after successful response."""
        # Skip if not a write method
        if request.method not in self.WRITE_METHODS:
            return response
        
        # Skip certain paths
        if any(request.path.startswith(path) for path in self.SKIP_PATHS):
            return response
        
        # Skip if not authenticated
        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return response
        
        # Only log successful operations
        if response.status_code >= 400:
            return response
        
        # Extract metadata
        action = self._get_action(request.method)
        resource_type = self._extract_resource_type(request.path)
        
        # Get client IP
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(',')[0]
        else:
            ip_address = request.META.get('REMOTE_ADDR')
        
        # Create audit log asynchronously (in production, use Celery)
        try:
            AuditLog.objects.create(
                tenant=request.tenant,
                user=request.user,
                action=action,
                resource_type=resource_type,
                metadata={
                    'path': request.path,
                    'method': request.method,
                },
                ip_address=ip_address,
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:500]
            )
        except Exception:
            # Don't fail the request if audit logging fails
            pass
        
        return response
    
    def _get_action(self, method):
        """Map HTTP method to audit action."""
        mapping = {
            'POST': 'create',
            'PUT': 'update',
            'PATCH': 'update',
            'DELETE': 'delete',
        }
        return mapping.get(method, 'unknown')
    
    def _extract_resource_type(self, path):
        """Extract resource type from URL path."""
        parts = [p for p in path.split('/') if p]
        if len(parts) >= 2:
            return parts[1]  # e.g., /api/documents/ -> documents
        return 'unknown'
