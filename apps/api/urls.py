"""
API URL configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.api.views.auth import (
    login_view, refresh_token_view, me_view, change_password_view,
    mfa_verify_view, mfa_send_email_view, logout_view, logout_all_view,
    forgot_password_view, reset_password_view, session_list_view,
    session_revoke_view, mfa_setup_view, mfa_confirm_view,
    mfa_devices_view, mfa_device_delete_view, mfa_disable_view,
    admin_force_reset_view, admin_unlock_view, admin_user_sessions_view,
    admin_revoke_all_sessions_view,
)
from apps.api.views.documents import DocumentViewSet, DocumentAccessViewSet
from apps.api.views.rag import rag_query_view
from apps.api.views.admin import (
    AuditLogViewSet, DepartmentViewSet, RoleViewSet, PermissionViewSet,
    UserRoleViewSet, UserManagementViewSet,
)
from apps.api.views.org import OrgUnitViewSet
from apps.api.views.platform_owner import (
    platform_overview, tenants_list, tenant_detail, system_health, audit_logs_list,
    platform_analytics, ai_config_get, ai_config_update, available_models
)

from apps.api.views.chat import ChatSessionViewSet, ChatFolderViewSet
from apps.api.views.dashboard import dashboard_view
from apps.api.views.support import SupportTicketViewSet
from apps.api.views.notifications import (
    notification_list, notification_mark_read, notification_mark_all_read, notification_dismiss,
)

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
router.register(r'support', SupportTicketViewSet, basename='support')
router.register(r'org-units', OrgUnitViewSet, basename='org-unit')

urlpatterns = [
    # Dashboard
    path('dashboard/', dashboard_view, name='dashboard'),

    # Authentication
    path('auth/login/', login_view, name='login'),
    path('auth/refresh/', refresh_token_view, name='refresh'),
    path('auth/logout/', logout_view, name='logout'),
    path('auth/logout-all/', logout_all_view, name='logout-all'),
    path('auth/me/', me_view, name='me'),
    path('auth/change-password/', change_password_view, name='change-password'),
    path('auth/forgot-password/', forgot_password_view, name='forgot-password'),
    path('auth/reset-password/', reset_password_view, name='reset-password'),

    # MFA
    path('auth/mfa/verify/', mfa_verify_view, name='mfa-verify'),
    path('auth/mfa/send-email/', mfa_send_email_view, name='mfa-send-email'),
    path('auth/mfa/setup/', mfa_setup_view, name='mfa-setup'),
    path('auth/mfa/confirm/', mfa_confirm_view, name='mfa-confirm'),
    path('auth/mfa/devices/', mfa_devices_view, name='mfa-devices'),
    path('auth/mfa/devices/<uuid:device_id>/', mfa_device_delete_view, name='mfa-device-delete'),
    path('auth/mfa/disable/', mfa_disable_view, name='mfa-disable'),

    # Sessions
    path('auth/sessions/', session_list_view, name='session-list'),
    path('auth/sessions/<uuid:session_id>/revoke/', session_revoke_view, name='session-revoke'),

    # Admin auth management
    path('admin/users/<uuid:user_id>/force-reset/', admin_force_reset_view, name='admin-force-reset'),
    path('admin/users/<uuid:user_id>/unlock/', admin_unlock_view, name='admin-unlock'),
    path('admin/users/<uuid:user_id>/sessions/', admin_user_sessions_view, name='admin-user-sessions'),
    path('admin/users/<uuid:user_id>/revoke-all/', admin_revoke_all_sessions_view, name='admin-revoke-all-sessions'),
    
    # RAG
    path('rag/query/', rag_query_view, name='rag-query'),

    # Notifications
    path('notifications/', notification_list, name='notification-list'),
    path('notifications/read-all/', notification_mark_all_read, name='notification-read-all'),
    path('notifications/<uuid:notification_id>/read/', notification_mark_read, name='notification-read'),
    path('notifications/<uuid:notification_id>/', notification_dismiss, name='notification-dismiss'),
    
    # Platform Owner (superuser only)
    path('platform/overview/', platform_overview, name='platform-overview'),
    path('platform/tenants/', tenants_list, name='platform-tenants'),
    path('platform/tenants/<uuid:tenant_id>/', tenant_detail, name='platform-tenant-detail'),
    path('platform/system-health/', system_health, name='platform-system-health'),
    path('platform/audit-logs/', audit_logs_list, name='platform-audit-logs'),
    path('platform/analytics/', platform_analytics, name='platform-analytics'),
    path('platform/ai-config/', ai_config_get, name='platform-ai-config-get'),
    path('platform/ai-config/update/', ai_config_update, name='platform-ai-config-update'),
    path('platform/ai-config/available-models/', available_models, name='platform-ai-available-models'),
    
    # Router URLs
    path('', include(router.urls)),
]
