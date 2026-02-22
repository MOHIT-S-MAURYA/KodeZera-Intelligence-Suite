import api from './api';

export interface UserRecord {
    id: string;
    full_name: string;
    first_name: string;
    last_name: string;
    email: string;
    department: string | null;       // UUID
    department_name: string | null;
    primary_role_id: string | null;  // UUID
    primary_role_name: string | null;
    is_active: boolean;
    is_tenant_admin: boolean;
    created_at: string;
}

export interface CreateUserPayload {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    department?: string | null;
    role_id?: string | null;
    is_tenant_admin?: boolean;
}

export interface UpdateUserPayload {
    first_name?: string;
    last_name?: string;
    department?: string | null;
    role_id?: string | null;
    is_active?: boolean;
    is_tenant_admin?: boolean;
    password?: string;
}

export const userService = {
    getAll: async (): Promise<UserRecord[]> => {
        const res = await api.get<{ results: UserRecord[] } | UserRecord[]>('/users/');
        return (res.data as { results: UserRecord[] }).results ?? (res.data as UserRecord[]);
    },

    create: async (payload: CreateUserPayload): Promise<UserRecord> => {
        const res = await api.post<UserRecord>('/users/', payload);
        return res.data;
    },

    update: async (id: string, payload: UpdateUserPayload): Promise<UserRecord> => {
        const res = await api.patch<UserRecord>(`/users/${id}/`, payload);
        return res.data;
    },

    remove: async (id: string): Promise<void> => {
        await api.delete(`/users/${id}/`);
    },

    toggleStatus: async (id: string): Promise<UserRecord> => {
        const res = await api.post<UserRecord>(`/users/${id}/toggle-status/`);
        return res.data;
    },
};
