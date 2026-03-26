/**
 * Audit Event Service
 *
 * Wraps all REST calls to /api/audit/* (tenant admin) and
 * /api/platform/audit/* (platform owner) endpoints for the
 * Audit Logging & Compliance module.
 */

import api from './api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuditEventEntry {
    id: string;
    scope: 'tenant' | 'platform' | 'system';
    timestamp: string;
    action: AuditAction;
    resource_type: string;
    resource_id: string | null;
    user: string | null;
    user_email: string | null;
    user_name: string;
    tenant_name: string | null;
    outcome: 'success' | 'failure' | 'denied';
    status_code: number | null;
    ip_address: string | null;
    endpoint: string;
    http_method: string;
}

export interface AuditEventDetail extends AuditEventEntry {
    tenant: string | null;
    user_agent: string;
    session_id: string;
    changes: Record<string, { old: string | null; new: string | null }>;
    request_id: string;
    error_message: string;
    trigger: string;
    metadata: Record<string, unknown>;
    regulation_tags: string[];
    data_classification: string;
    retention_class: string;
    previous_hash: string;
    event_hash: string;
}

export type AuditAction =
    | 'create' | 'update' | 'delete' | 'read'
    | 'login' | 'logout'
    | 'upload' | 'download'
    | 'query'
    | 'grant_access' | 'revoke_access'
    | 'config_change' | 'export'
    | 'mfa_event' | 'password_change' | 'session_event';

export const AUDIT_ACTIONS: { value: AuditAction; label: string }[] = [
    { value: 'create', label: 'Create' },
    { value: 'update', label: 'Update' },
    { value: 'delete', label: 'Delete' },
    { value: 'read', label: 'Read' },
    { value: 'login', label: 'Login' },
    { value: 'logout', label: 'Logout' },
    { value: 'upload', label: 'Upload' },
    { value: 'download', label: 'Download' },
    { value: 'query', label: 'Query' },
    { value: 'grant_access', label: 'Grant Access' },
    { value: 'revoke_access', label: 'Revoke Access' },
    { value: 'config_change', label: 'Config Change' },
    { value: 'export', label: 'Export' },
    { value: 'mfa_event', label: 'MFA Event' },
    { value: 'password_change', label: 'Password Change' },
    { value: 'session_event', label: 'Session Event' },
];

export interface SecurityAlertEntry {
    id: string;
    tenant: string | null;
    tenant_name: string | null;
    rule_key: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
    source_events: string[];
    resolved_by: string | null;
    resolved_by_name: string | null;
    resolved_at: string | null;
    created_at: string;
}

export interface AuditEventFilters {
    action?: string;
    resource_type?: string;
    user_id?: string;
    outcome?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    limit?: number;
    offset?: number;
    tenant_id?: string;
    scope?: string;
}

interface PaginatedResponse<T> {
    count: number;
    results: T[];
}

// ── Tenant admin audit service ───────────────────────────────────────────────

export const auditEventService = {
    /** GET /audit/events/ — paginated audit events for the current tenant. */
    getEvents: async (filters?: AuditEventFilters): Promise<PaginatedResponse<AuditEventEntry>> => {
        const params: Record<string, string> = {};
        if (filters?.action) params.action = filters.action;
        if (filters?.resource_type) params.resource_type = filters.resource_type;
        if (filters?.user_id) params.user_id = filters.user_id;
        if (filters?.outcome) params.outcome = filters.outcome;
        if (filters?.date_from) params.date_from = filters.date_from;
        if (filters?.date_to) params.date_to = filters.date_to;
        if (filters?.search) params.search = filters.search;
        if (filters?.limit) params.limit = filters.limit.toString();
        if (filters?.offset) params.offset = filters.offset.toString();

        const res = await api.get<PaginatedResponse<AuditEventEntry>>('/audit/events/', { params });
        return res.data;
    },

    /** GET /audit/events/:id — full event detail. */
    getEventDetail: async (eventId: string): Promise<AuditEventDetail> => {
        const res = await api.get<AuditEventDetail>(`/audit/events/${eventId}/`);
        return res.data;
    },

    /** POST /audit/events/export/ — export as CSV or JSON. */
    exportEvents: async (format: 'csv' | 'json' = 'csv', dateFrom?: string, dateTo?: string): Promise<Blob | unknown[]> => {
        const data: Record<string, string> = { format };
        if (dateFrom) data.date_from = dateFrom;
        if (dateTo) data.date_to = dateTo;

        if (format === 'csv') {
            const res = await api.post('/audit/events/export/', data, { responseType: 'blob' });
            return res.data;
        }
        const res = await api.post('/audit/events/export/', data);
        return res.data;
    },

    /** GET /audit/events/stats/ — audit statistics. */
    getStats: async (days: number = 7): Promise<Record<string, unknown>> => {
        const res = await api.get('/audit/events/stats/', { params: { days } });
        return res.data;
    },

    /** GET /audit/security-alerts/ — security alerts for this tenant. */
    getSecurityAlerts: async (filters?: { severity?: string; status?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<SecurityAlertEntry>> => {
        const params: Record<string, string> = {};
        if (filters?.severity) params.severity = filters.severity;
        if (filters?.status) params.status = filters.status;
        if (filters?.limit) params.limit = filters.limit.toString();
        if (filters?.offset) params.offset = filters.offset.toString();

        const res = await api.get<PaginatedResponse<SecurityAlertEntry>>('/audit/security-alerts/', { params });
        return res.data;
    },

    /** PATCH /audit/security-alerts/:id/ — update alert status. */
    updateSecurityAlert: async (alertId: string, status: string, resolutionNotes?: string): Promise<SecurityAlertEntry> => {
        const res = await api.patch<SecurityAlertEntry>(`/audit/security-alerts/${alertId}/`, {
            status,
            resolution_notes: resolutionNotes || '',
        });
        return res.data;
    },

    /** GET /audit/compliance/ — compliance records. */
    getComplianceRecords: async (): Promise<unknown[]> => {
        const res = await api.get('/audit/compliance/');
        return res.data;
    },

    /** POST /audit/compliance/report/ — generate compliance report. */
    generateComplianceReport: async (): Promise<Record<string, unknown>> => {
        const res = await api.post('/audit/compliance/report/');
        return res.data;
    },
};

// ── Platform owner audit service ─────────────────────────────────────────────

export const platformAuditService = {
    /** GET /platform/audit/events/ — cross-tenant audit events. */
    getEvents: async (filters?: AuditEventFilters): Promise<PaginatedResponse<AuditEventEntry>> => {
        const params: Record<string, string> = {};
        if (filters?.action) params.action = filters.action;
        if (filters?.tenant_id) params.tenant_id = filters.tenant_id;
        if (filters?.scope) params.scope = filters.scope;
        if (filters?.outcome) params.outcome = filters.outcome;
        if (filters?.date_from) params.date_from = filters.date_from;
        if (filters?.date_to) params.date_to = filters.date_to;
        if (filters?.search) params.search = filters.search;
        if (filters?.limit) params.limit = filters.limit.toString();
        if (filters?.offset) params.offset = filters.offset.toString();

        const res = await api.get<PaginatedResponse<AuditEventEntry>>('/platform/audit/events/', { params });
        return res.data;
    },

    /** GET /platform/audit/events/:id — platform-wide event detail. */
    getEventDetail: async (eventId: string): Promise<AuditEventDetail> => {
        const res = await api.get<AuditEventDetail>(`/platform/audit/events/${eventId}/`);
        return res.data;
    },

    /** POST /platform/audit/events/verify/ — verify hash chain integrity. */
    verifyChain: async (limit: number = 1000, offset: number = 0): Promise<{ valid: boolean; checked: number; first_break_id: string | null }> => {
        const res = await api.post('/platform/audit/events/verify/', { limit, offset });
        return res.data;
    },

    /** POST /platform/audit/events/export/ — platform-wide export. */
    exportEvents: async (format: 'csv' | 'json' = 'csv', scope?: string, dateFrom?: string, dateTo?: string): Promise<Blob | unknown[]> => {
        const data: Record<string, string> = { format };
        if (scope) data.scope = scope;
        if (dateFrom) data.date_from = dateFrom;
        if (dateTo) data.date_to = dateTo;

        if (format === 'csv') {
            const res = await api.post('/platform/audit/events/export/', data, { responseType: 'blob' });
            return res.data;
        }
        const res = await api.post('/platform/audit/events/export/', data);
        return res.data;
    },

    /** GET /platform/audit/events/stats/ — platform-wide stats. */
    getStats: async (days: number = 7): Promise<Record<string, unknown>> => {
        const res = await api.get('/platform/audit/events/stats/', { params: { days } });
        return res.data;
    },

    /** GET /platform/audit/security-alerts/ — cross-tenant security alerts. */
    getSecurityAlerts: async (filters?: { tenant_id?: string; severity?: string; status?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<SecurityAlertEntry>> => {
        const params: Record<string, string> = {};
        if (filters?.tenant_id) params.tenant_id = filters.tenant_id;
        if (filters?.severity) params.severity = filters.severity;
        if (filters?.status) params.status = filters.status;
        if (filters?.limit) params.limit = filters.limit.toString();
        if (filters?.offset) params.offset = filters.offset.toString();

        const res = await api.get<PaginatedResponse<SecurityAlertEntry>>('/platform/audit/security-alerts/', { params });
        return res.data;
    },

    /** GET /platform/audit/retention-policies/ */
    getRetentionPolicies: async (): Promise<unknown[]> => {
        const res = await api.get('/platform/audit/retention-policies/');
        return res.data;
    },

    /** POST /platform/audit/retention-policies/ */
    createRetentionPolicy: async (data: Record<string, unknown>): Promise<unknown> => {
        const res = await api.post('/platform/audit/retention-policies/', data);
        return res.data;
    },

    /** PATCH /platform/audit/retention-policies/:id/ */
    updateRetentionPolicy: async (policyId: string, data: Record<string, unknown>): Promise<unknown> => {
        const res = await api.patch(`/platform/audit/retention-policies/${policyId}/`, data);
        return res.data;
    },

    /** GET /platform/audit/data-deletion-requests/ */
    getDataDeletionRequests: async (filters?: { tenant_id?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<unknown>> => {
        const params: Record<string, string> = {};
        if (filters?.tenant_id) params.tenant_id = filters.tenant_id;
        if (filters?.limit) params.limit = filters.limit.toString();
        if (filters?.offset) params.offset = filters.offset.toString();

        const res = await api.get('/platform/audit/data-deletion-requests/', { params });
        return res.data;
    },

    /** PATCH /platform/audit/data-deletion-requests/:id/ */
    updateDataDeletionRequest: async (requestId: string, status: string, deletionProof?: Record<string, unknown>): Promise<unknown> => {
        const data: Record<string, unknown> = { status };
        if (deletionProof) data.deletion_proof = deletionProof;
        const res = await api.patch(`/platform/audit/data-deletion-requests/${requestId}/`, data);
        return res.data;
    },
};
