/**
 * AuditLog Service
 * Wraps all REST calls to /api/v1/audit-logs/.
 *
 * Why this file exists:
 *   Centralises API interaction so AuditLogs.tsx stays a pure UI concern.
 *
 * Security notes:
 *   - All requests sent with the JWT stored in the axios instance (api.ts).
 *   - Backend enforces IsTenantAdmin; logs are strictly scoped to the caller's tenant.
 *   - Read-only: logs are immutable audit records; no create/update/delete from UI.
 */

import api from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Matches the API response shape from AuditLogSerializer. */
export interface AuditLogEntry {
    id:            string;       // UUID
    user:          string | null; // User UUID, or null for system events
    user_email:    string | null;
    user_name:     string;       // defaults to 'System' when no user
    action:        AuditAction;
    resource_type: string;
    resource_id:   string | null;
    metadata:      Record<string, unknown>;
    ip_address:    string | null;
    created_at:    string;       // ISO-8601
}

export type AuditAction =
    | 'create' | 'update' | 'delete' | 'read'
    | 'login'  | 'logout'
    | 'upload' | 'download'
    | 'query'
    | 'grant_access' | 'revoke_access';

export const AUDIT_ACTIONS: { value: AuditAction; label: string }[] = [
    { value: 'create',       label: 'Create'        },
    { value: 'update',       label: 'Update'        },
    { value: 'delete',       label: 'Delete'        },
    { value: 'read',         label: 'Read'          },
    { value: 'login',        label: 'Login'         },
    { value: 'logout',       label: 'Logout'        },
    { value: 'upload',       label: 'Upload'        },
    { value: 'download',     label: 'Download'      },
    { value: 'query',        label: 'Query'         },
    { value: 'grant_access', label: 'Grant Access'  },
    { value: 'revoke_access','label': 'Revoke Access' },
];

export interface AuditLogFilters {
    action?:        AuditAction | '';
    resource_type?: string;
    user_id?:       string;
    date_from?:     string;   // YYYY-MM-DD
    date_to?:       string;   // YYYY-MM-DD
}

// ── API helpers ───────────────────────────────────────────────────────────────

type ListEnvelope = { results: AuditLogEntry[]; count: number } | AuditLogEntry[];

function extractList(data: ListEnvelope): AuditLogEntry[] {
    if (Array.isArray(data)) return data;
    return (data as { results: AuditLogEntry[] }).results ?? [];
}

// ── Service object ─────────────────────────────────────────────────────────────

export const auditLogService = {
    /**
     * GET /audit-logs/ — paginated audit log entries for the current tenant.
     * Accepts optional server-side filters sent as query params.
     */
    getAll: async (filters?: AuditLogFilters): Promise<AuditLogEntry[]> => {
        const params: Record<string, string> = {};
        if (filters?.action)        params['action']        = filters.action;
        if (filters?.resource_type) params['resource_type'] = filters.resource_type;
        if (filters?.user_id)       params['user_id']       = filters.user_id;
        if (filters?.date_from)     params['date_from']     = filters.date_from;
        if (filters?.date_to)       params['date_to']       = filters.date_to;

        const res = await api.get<ListEnvelope>('/audit-logs/', { params });
        return extractList(res.data);
    },
};
