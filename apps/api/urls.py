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
from apps.api.views.documents import (
    DocumentViewSet, DocumentAccessViewSet, DocumentFolderViewSet, DocumentTagViewSet,
)
from apps.api.views.rag import rag_query_view, rag_action_decision_view
from apps.api.views.admin import (
    AuditLogViewSet, DepartmentViewSet, RoleViewSet, PermissionViewSet,
    UserRoleViewSet, UserManagementViewSet,
)
from apps.api.views.org import OrgUnitViewSet
from apps.api.views.platform_owner import (
    platform_overview, tenants_list, tenant_detail, system_health, audit_logs_list,
    platform_analytics, ai_config_get, ai_config_update, available_models,
    tenant_config, tenant_usage, tenant_invoices,
    subscription_plans_list, subscription_plan_detail, tenant_subscriptions_list,
    feature_flags_list, feature_flag_detail, feature_flag_tenants, feature_flag_tenant_override,
    health_history, billing_events_list,
    tenant_settings, tenant_features, tenant_usage_self,
)

from apps.api.views.chat import ChatSessionViewSet, ChatFolderViewSet
from apps.api.views.dashboard import dashboard_view
from apps.api.views.support import SupportTicketViewSet
from apps.api.views.notifications import (
    notification_list, notification_mark_read, notification_mark_all_read, notification_dismiss,
    notification_unread_count, notification_preferences,
    admin_send_notification, admin_notification_templates, admin_delivery_stats,
)
from apps.api.views.audit import (
    # Tenant admin
    audit_events_list, audit_event_detail, audit_events_export,
    audit_security_alerts, audit_security_alert_update,
    audit_compliance_records, audit_compliance_report, audit_stats,
    # Platform owner
    platform_audit_events, platform_audit_event_detail, platform_audit_verify_chain,
    platform_audit_export, platform_security_alerts,
    platform_retention_policies, platform_retention_policy_update,
    platform_data_deletion_requests, platform_data_deletion_update,
    platform_audit_stats,
)
from apps.analytics.views.analytics import (
    dashboard_trends, my_analytics, department_analytics,
    tenant_analytics, platform_analytics_enhanced, platform_quality_analytics,
    platform_forecast, alert_rules_list, alert_rule_detail,
    metric_alerts_list, metric_alert_action,
    platform_alert_rules, platform_metric_alerts,
)

# Create router
router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'document-access', DocumentAccessViewSet,
                basename='document-access')
router.register(r'document-folders', DocumentFolderViewSet,
                basename='document-folder')
router.register(r'document-tags', DocumentTagViewSet, basename='document-tag')
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
    path('dashboard/trends/', dashboard_trends, name='dashboard-trends'),
    path('dashboard/my-analytics/', my_analytics, name='dashboard-my-analytics'),
    path('dashboard/department/<uuid:dept_id>/',
         department_analytics, name='dashboard-department-analytics'),

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
    path('auth/mfa/devices/<uuid:device_id>/',
         mfa_device_delete_view, name='mfa-device-delete'),
    path('auth/mfa/disable/', mfa_disable_view, name='mfa-disable'),

    # Sessions
    path('auth/sessions/', session_list_view, name='session-list'),
    path('auth/sessions/<uuid:session_id>/revoke/',
         session_revoke_view, name='session-revoke'),

    # Admin auth management
    path('admin/users/<uuid:user_id>/force-reset/',
         admin_force_reset_view, name='admin-force-reset'),
    path('admin/users/<uuid:user_id>/unlock/',
         admin_unlock_view, name='admin-unlock'),
    path('admin/users/<uuid:user_id>/sessions/',
         admin_user_sessions_view, name='admin-user-sessions'),
    path('admin/users/<uuid:user_id>/revoke-all/',
         admin_revoke_all_sessions_view, name='admin-revoke-all-sessions'),

    # RAG
    path('rag/query/', rag_query_view, name='rag-query'),
    path('rag/action-decision/', rag_action_decision_view,
         name='rag-action-decision'),

    # Notifications
    path('notifications/', notification_list, name='notification-list'),
    path('notifications/unread-count/', notification_unread_count,
         name='notification-unread-count'),
    path('notifications/read-all/', notification_mark_all_read,
         name='notification-read-all'),
    path('notifications/preferences/', notification_preferences,
         name='notification-preferences'),
    path('notifications/<uuid:notification_id>/read/',
         notification_mark_read, name='notification-read'),
    path('notifications/<uuid:notification_id>/',
         notification_dismiss, name='notification-dismiss'),

    # Admin notification management
    path('admin/notifications/send/', admin_send_notification,
         name='admin-notification-send'),
    path('admin/notifications/templates/', admin_notification_templates,
         name='admin-notification-templates'),
    path('admin/notifications/stats/',
         admin_delivery_stats, name='admin-delivery-stats'),

    # Platform Owner (superuser only)
    path('platform/overview/', platform_overview, name='platform-overview'),
    path('platform/tenants/', tenants_list, name='platform-tenants'),
    path('platform/tenants/<uuid:tenant_id>/',
         tenant_detail, name='platform-tenant-detail'),
    path('platform/system-health/', system_health,
         name='platform-system-health'),
    path('platform/audit-logs/', audit_logs_list, name='platform-audit-logs'),
    path('platform/analytics/', platform_analytics, name='platform-analytics'),
    path('platform/ai-config/', ai_config_get, name='platform-ai-config-get'),
    path('platform/ai-config/update/', ai_config_update,
         name='platform-ai-config-update'),
    path('platform/ai-config/available-models/',
         available_models, name='platform-ai-available-models'),

    # Platform — Tenant config, usage, invoices
    path('platform/tenants/<uuid:tenant_id>/config/',
         tenant_config, name='platform-tenant-config'),
    path('platform/tenants/<uuid:tenant_id>/usage/',
         tenant_usage, name='platform-tenant-usage'),
    path('platform/tenants/<uuid:tenant_id>/invoices/',
         tenant_invoices, name='platform-tenant-invoices'),

    # Platform — Subscription plans
    path('platform/subscriptions/plans/', subscription_plans_list,
         name='platform-subscription-plans'),
    path('platform/subscriptions/plans/<uuid:plan_id>/',
         subscription_plan_detail, name='platform-subscription-plan-detail'),
    path('platform/subscriptions/', tenant_subscriptions_list,
         name='platform-subscriptions'),

    # Platform — Feature flags
    path('platform/feature-flags/', feature_flags_list,
         name='platform-feature-flags'),
    path('platform/feature-flags/<str:key>/', feature_flag_detail,
         name='platform-feature-flag-detail'),
    path('platform/feature-flags/<str:key>/tenants/',
         feature_flag_tenants, name='platform-feature-flag-tenants'),
    path('platform/feature-flags/<str:key>/tenants/<uuid:tenant_id>/',
         feature_flag_tenant_override, name='platform-feature-flag-tenant-override'),

    # Platform — Health history & Billing events
    path('platform/health/history/', health_history,
         name='platform-health-history'),
    path('platform/billing/events/', billing_events_list,
         name='platform-billing-events'),

    # Tenant self-service
    path('tenant/settings/', tenant_settings, name='tenant-settings'),
    path('tenant/features/', tenant_features, name='tenant-features'),
    path('tenant/usage/', tenant_usage_self, name='tenant-usage'),

    # ── Audit Logging & Compliance (tenant admin) ──────────────────────
    path('audit/events/', audit_events_list, name='audit-events-list'),
    path('audit/events/export/', audit_events_export, name='audit-events-export'),
    path('audit/events/stats/', audit_stats, name='audit-stats'),
    path('audit/events/<uuid:event_id>/',
         audit_event_detail, name='audit-event-detail'),
    path('audit/security-alerts/', audit_security_alerts,
         name='audit-security-alerts'),
    path('audit/security-alerts/<uuid:alert_id>/',
         audit_security_alert_update, name='audit-security-alert-update'),
    path('audit/compliance/', audit_compliance_records,
         name='audit-compliance-records'),
    path('audit/compliance/report/', audit_compliance_report,
         name='audit-compliance-report'),

    # ── Audit Logging & Compliance (platform owner) ────────────────────
    path('platform/audit/events/', platform_audit_events,
         name='platform-audit-events'),
    path('platform/audit/events/verify/',
         platform_audit_verify_chain, name='platform-audit-verify'),
    path('platform/audit/events/export/',
         platform_audit_export, name='platform-audit-export'),
    path('platform/audit/events/stats/',
         platform_audit_stats, name='platform-audit-stats'),
    path('platform/audit/events/<uuid:event_id>/',
         platform_audit_event_detail, name='platform-audit-event-detail'),
    path('platform/audit/security-alerts/',
         platform_security_alerts, name='platform-security-alerts'),
    path('platform/audit/retention-policies/',
         platform_retention_policies, name='platform-retention-policies'),
    path('platform/audit/retention-policies/<uuid:policy_id>/',
         platform_retention_policy_update, name='platform-retention-policy-update'),
    path('platform/audit/data-deletion-requests/',
         platform_data_deletion_requests, name='platform-data-deletion-requests'),
    path('platform/audit/data-deletion-requests/<uuid:request_id>/',
         platform_data_deletion_update, name='platform-data-deletion-update'),

    # ── Analytics & Reporting ─────────────────────────────────────────────
    path('analytics/tenant/', tenant_analytics, name='analytics-tenant'),
    path('analytics/alerts/rules/', alert_rules_list,
         name='analytics-alert-rules'),
    path('analytics/alerts/rules/<uuid:rule_id>/',
         alert_rule_detail, name='analytics-alert-rule-detail'),
    path('analytics/alerts/', metric_alerts_list, name='analytics-alerts'),
    path('analytics/alerts/<uuid:alert_id>/<str:action>/',
         metric_alert_action, name='analytics-alert-action'),

    # Platform analytics (enhanced)
    path('platform/analytics/enhanced/', platform_analytics_enhanced,
         name='platform-analytics-enhanced'),
    path('platform/analytics/quality/', platform_quality_analytics,
         name='platform-analytics-quality'),
    path('platform/analytics/forecast/', platform_forecast,
         name='platform-analytics-forecast'),
    path('platform/analytics/alerts/rules/', platform_alert_rules,
         name='platform-analytics-alert-rules'),
    path('platform/analytics/alerts/', platform_metric_alerts,
         name='platform-analytics-alerts'),

    # Router URLs
    path('', include(router.urls)),
]
