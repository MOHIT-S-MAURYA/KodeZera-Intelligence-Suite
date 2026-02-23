"""
API URL configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.api.views.auth import login_view, refresh_token_view
from apps.api.views.documents import DocumentViewSet, DocumentAccessViewSet
from apps.api.views.rag import rag_query_view
from apps.api.views.admin import (
    AuditLogViewSet, DepartmentViewSet, RoleViewSet, PermissionViewSet,
    UserRoleViewSet, UserManagementViewSet,
)
from apps.api.views.platform_owner import (
    platform_overview, tenants_list, system_health, audit_logs_list,
    platform_analytics, ai_config_get, ai_config_update
)

from apps.api.views.chat import ChatSessionViewSet, ChatFolderViewSet
from apps.api.views.dashboard import dashboard_view

# Create router
router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'document-access', DocumentAccessViewSet, basename='document-access')
router.register(r'departments', DepartmentViewSet, basename='department')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'users', UserManagementViewSet, basename='user')
router.register(r'user-roles', UserRoleViewSet, basename='user-role')
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')
router.register(r'rag/sessions', ChatSessionViewSet, basename='chat-session')
router.register(r'rag/folders', ChatFolderViewSet, basename='chat-folder')

urlpatterns = [
    # Dashboard
    path('dashboard/', dashboard_view, name='dashboard'),

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
    path('platform/analytics/', platform_analytics, name='platform-analytics'),
    path('platform/ai-config/', ai_config_get, name='platform-ai-config-get'),
    path('platform/ai-config/update/', ai_config_update, name='platform-ai-config-update'),
    
    # Router URLs
    path('', include(router.urls)),
]
