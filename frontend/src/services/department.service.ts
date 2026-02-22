/**
 * Department Service
 * Wraps all REST calls to /api/v1/departments/.
 *
 * Why this file exists:
 *   Centralises API interaction so Departments.tsx stays a pure UI concern.
 *   Mirrors the same pattern used by user.service.ts.
 *
 * Security notes:
 *   - All requests sent with the JWT stored in the axios instance (api.ts).
 *   - Backend enforces IsTenantAdmin; frontend is defence-in-depth only.
 *   - No tenant field is ever sent — the backend injects it from the token.
 */

import api from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Matches the API response shape from DepartmentSerializer. */
export interface DepartmentRecord {
    id:             string;       // UUID
    name:           string;
    description:    string;
    parent:         string | null; // UUID of parent dept, or null
    parent_name:    string | null;
    user_count:     number;
    children_count: number;
    created_at:     string;       // ISO-8601
}

export interface CreateDepartmentPayload {
    name:        string;
    description?: string;
    parent?:     string | null;   // UUID
}

export interface UpdateDepartmentPayload {
    name?:        string;
    description?: string;
    parent?:      string | null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

type ListEnvelope = { results: DepartmentRecord[] } | DepartmentRecord[];

function extractList(data: ListEnvelope): DepartmentRecord[] {
    // DRF paginated: { count, results: [...] }  OR  plain array (if pagination disabled)
    if (Array.isArray(data)) return data;
    return (data as { results: DepartmentRecord[] }).results ?? [];
}

// ── Service object ─────────────────────────────────────────────────────────────

export const departmentService = {
    /** GET /departments/ — all departments in the current user's tenant */
    getAll: async (): Promise<DepartmentRecord[]> => {
        const res = await api.get<ListEnvelope>('/departments/');
        return extractList(res.data);
    },

    /** POST /departments/ — create a new department */
    create: async (payload: CreateDepartmentPayload): Promise<DepartmentRecord> => {
        const res = await api.post<DepartmentRecord>('/departments/', payload);
        return res.data;
    },

    /** PATCH /departments/{id}/ — partial update */
    update: async (id: string, payload: UpdateDepartmentPayload): Promise<DepartmentRecord> => {
        const res = await api.patch<DepartmentRecord>(`/departments/${id}/`, payload);
        return res.data;
    },

    /** DELETE /departments/{id}/
     *  Returns void on 204.
     *  Throws AxiosError with response.data.error if backend returns 409
     *  (department has users or children). */
    remove: async (id: string): Promise<void> => {
        await api.delete(`/departments/${id}/`);
    },
};
