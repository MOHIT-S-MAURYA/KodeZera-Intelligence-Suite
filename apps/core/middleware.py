"""
Middleware for tenant isolation, request correlation, and audit logging.
"""
import logging
import uuid
import time

from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)


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


class CorrelationMiddleware(MiddlewareMixin):
    """
    Injects a unique request_id into every request for end-to-end tracing.

    Adds the ID to request.META['request_id'] and to the response header
    X-Request-ID.  Upstream reverse-proxies may supply an existing value
    via X-Request-ID; it will be reused when present.
    """

    def process_request(self, request):
        request_id = request.META.get('HTTP_X_REQUEST_ID')
        if not request_id:
            request_id = str(uuid.uuid4())
        request.META['request_id'] = request_id
        return None

    def process_response(self, request, response):
        request_id = getattr(request, 'META', {}).get('request_id', '')
        if request_id:
            response['X-Request-ID'] = request_id
        return response


class TimingMiddleware(MiddlewareMixin):
    """
    Measures end-to-end request latency and adds X-Response-Time header.
    """

    def process_request(self, request):
        request._start_time = time.perf_counter()
        return None

    def process_response(self, request, response):
        start = getattr(request, '_start_time', None)
        if start is not None:
            elapsed_ms = (time.perf_counter() - start) * 1000
            response['X-Response-Time'] = f"{elapsed_ms:.1f}ms"

        # Add API usage headers for authenticated tenant traffic.
        if request.path.startswith('/api/') and getattr(request, 'user', None) and request.user.is_authenticated:
            try:
                from apps.core.throttle import get_rate_limit_headers
                for key, value in get_rate_limit_headers(request).items():
                    response[key] = value
            except Exception:
                logger.debug('TimingMiddleware: failed to add rate limit headers', exc_info=True)

            try:
                tenant = getattr(request.user, 'tenant', None)
                if tenant:
                    from apps.core.services.quota import QuotaService
                    summary = QuotaService.get_usage_summary(str(tenant.id))
                    queries = summary.get('queries', {})
                    response['X-Quota-Limit'] = str(queries.get('limit', 0))
                    response['X-Quota-Used'] = str(queries.get('used', 0))
                    remaining = max(int(queries.get('limit', 0)) - int(queries.get('used', 0)), 0)
                    response['X-Quota-Remaining'] = str(remaining)
            except Exception:
                logger.debug('TimingMiddleware: failed to add quota headers', exc_info=True)
        return response


class AuditLoggingMiddleware(MiddlewareMixin):
    """
    Logs write operations to the unified AuditEvent model.

    Also writes to the legacy AuditLog model for backwards compatibility.
    Resolves JWT-only users that Django's session middleware can't see.
    Logs both successful and failed operations (>= 400 status).
    """

    AUDITED_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
    SKIP_PATHS = ['/admin/', '/static/', '/media/']

    # HTTP method → AuditEvent action
    METHOD_ACTION_MAP = {
        'POST': 'create',
        'PUT': 'update',
        'PATCH': 'update',
        'DELETE': 'delete',
    }

    def _resolve_user_and_tenant_id(self, request):
        """
        Return (user, tenant_id) for this request.
        Checks Django session user first, then falls back to JWT authentication
        so that token-only API clients (no session cookie) are correctly logged.
        """
        user = getattr(request, 'user', None)
        if user and user.is_authenticated:
            tenant_id = getattr(user, 'tenant_id', None)
            return user, tenant_id

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
        """Log write operations via AuditService and legacy AuditLog."""
        if request.method not in self.AUDITED_METHODS:
            return response

        if any(request.path.startswith(p) for p in self.SKIP_PATHS):
            return response

        user, tenant_id = self._resolve_user_and_tenant_id(request)

        action = self.METHOD_ACTION_MAP.get(request.method, 'unknown')

        # Capture values needed for logging (avoid referencing request later)
        meta_snapshot = {
            'path': request.path,
            'method': request.method,
            'request_id': request.META.get('request_id', ''),
            'session_id': (request.session.session_key or '') if hasattr(request, 'session') and request.session else '',
            'HTTP_X_FORWARDED_FOR': request.META.get('HTTP_X_FORWARDED_FOR', ''),
            'REMOTE_ADDR': request.META.get('REMOTE_ADDR', ''),
            'HTTP_USER_AGENT': request.META.get('HTTP_USER_AGENT', '')[:500],
        }
        status_code = response.status_code

        # Write to new AuditEvent model
        try:
            from apps.core.services.audit_service import AuditService
            AuditService.log_from_middleware(
                request_meta=meta_snapshot,
                user=user,
                tenant_id=tenant_id,
                action=action,
                status_code=status_code,
            )
        except Exception:
            logger.debug("AuditLoggingMiddleware: AuditEvent write failed", exc_info=True)

        # Also write to legacy AuditLog for backward compatibility (success only)
        if user and status_code < 400:
            try:
                from apps.core.models import AuditLog
                from apps.core.services.audit_service import extract_resource_info
                resource_type, _ = extract_resource_info(request.path)
                x_fwd = meta_snapshot.get('HTTP_X_FORWARDED_FOR')
                ip = x_fwd.split(',')[0].strip() if x_fwd else meta_snapshot.get('REMOTE_ADDR')
                AuditLog.objects.create(
                    tenant_id=tenant_id,
                    user_id=user.pk,
                    action=action,
                    resource_type=resource_type,
                    metadata={'path': request.path, 'method': request.method},
                    ip_address=ip,
                    user_agent=meta_snapshot.get('HTTP_USER_AGENT', ''),
                )
            except Exception:
                logger.debug("AuditLoggingMiddleware: legacy AuditLog write failed", exc_info=True)

        return response


class QuotaEnforcementMiddleware(MiddlewareMixin):
    """
    Lightweight middleware that blocks RAG queries and uploads
    when the tenant has exceeded their plan quota.

    Only runs on specific paths to avoid overhead on every request.
    """

    QUOTA_PATHS = {
        '/api/rag/query/': 'queries',
        '/api/v1/rag/query/': 'queries',
    }

    def process_request(self, request):
        if request.method not in ('POST', 'PUT', 'PATCH'):
            return None

        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return None

        # Determine which quota to check based on path
        resource = None
        for prefix, res in self.QUOTA_PATHS.items():
            if request.path.startswith(prefix):
                resource = res
                break

        if not resource:
            return None

        from apps.core.services.quota import QuotaService, QuotaExceeded
        from django.http import JsonResponse

        try:
            if resource == 'queries':
                QuotaService.check_queries(str(tenant.id))
        except QuotaExceeded as exc:
            return JsonResponse(exc.to_dict(), status=429)
