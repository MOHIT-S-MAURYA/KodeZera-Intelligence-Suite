/**
 * Role Service
 * Wraps all REST calls to /api/v1/roles/.
 *
 * Why this file exists:
 *   Centralises API interaction so Roles.tsx stays a pure UI concern.
 *   Mirrors the same pattern used by department.service.ts.
 *
 * Security notes:
 *   - All requests sent with the JWT stored in the axios instance (api.ts).
 *   - Backend enforces IsTenantAdmin; frontend is defence-in-depth only.
 *   - No tenant field is ever sent — the backend injects it from the token.
 */

import api from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Matches the API response shape from RoleSerializer. */
export interface RoleRecord {
    id:               string;       // UUID
    name:             string;
    description:      string;
    parent:           string | null; // UUID of parent role, or null
    parent_name:      string | null;
    user_count:       number;
    permission_count: number;
    created_at:       string;       // ISO-8601
}

export interface CreateRolePayload {
    name:         string;
    description?: string;
    parent?:      string | null;   // UUID
}

export interface UpdateRolePayload {
    name?:        string;
    description?: string;
    parent?:      string | null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

type ListEnvelope = { results: RoleRecord[] } | RoleRecord[];

function extractList(data: ListEnvelope): RoleRecord[] {
    if (Array.isArray(data)) return data;
    return (data as { results: RoleRecord[] }).results ?? [];
}

// ── Service object ─────────────────────────────────────────────────────────────

export const roleService = {
    /** GET /roles/ — all roles in the current user's tenant */
    getAll: async (): Promise<RoleRecord[]> => {
        const res = await api.get<ListEnvelope>('/roles/');
        return extractList(res.data);
    },

    /** POST /roles/ — create a new role */
    create: async (payload: CreateRolePayload): Promise<RoleRecord> => {
        const res = await api.post<RoleRecord>('/roles/', payload);
        return res.data;
    },

    /** PATCH /roles/{id}/ — partial update */
    update: async (id: string, payload: UpdateRolePayload): Promise<RoleRecord> => {
        const res = await api.patch<RoleRecord>(`/roles/${id}/`, payload);
        return res.data;
    },

    /** DELETE /roles/{id}/
     *  Returns void on 204.
     *  Throws AxiosError with response.data.error if backend returns 409
     *  (role has users assigned). */
    remove: async (id: string): Promise<void> => {
        await api.delete(`/roles/${id}/`);
    },
};
