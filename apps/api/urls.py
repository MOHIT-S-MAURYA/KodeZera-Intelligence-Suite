"""
API URL configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.api.views.auth import login_view, refresh_token_view
from apps.api.views.documents import DocumentViewSet, DocumentAccessViewSet
from apps.api.views.rag import rag_query_view
from apps.api.views.admin import (
    DepartmentViewSet, RoleViewSet, PermissionViewSet, UserRoleViewSet
)
from apps.api.views.platform_owner import (
    platform_overview, tenants_list, system_health, audit_logs_list
)

# Create router
router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'document-access', DocumentAccessViewSet, basename='document-access')
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'user-roles', UserRoleViewSet, basename='user-role')

urlpatterns = [
    # Authentication
    path('auth/login/', login_view, name='login'),
    path('auth/refresh/', refresh_token_view, name='refresh'),
    
    # RAG
    path('rag/query/', rag_query_view, name='rag-query'),
    
    # Platform Owner (superuser only)
    path('platform/overview/', platform_overview, name='platform-overview'),
    path('platform/tenants/', tenants_list, name='platform-tenants'),
    path('platform/system-health/', system_health, name='platform-system-health'),
    path('platform/audit-logs/', audit_logs_list, name='platform-audit-logs'),
    
    # Router URLs
    path('', include(router.urls)),
]
