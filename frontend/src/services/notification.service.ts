import api from './api';

export type NotificationCategory = 'documents' | 'chat' | 'system' | 'admin' | 'security' | 'user_management';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'system';

export interface NotificationData {
    id: string;
    title: string;
    message: string;
    notification_type: NotificationType;
    category: NotificationCategory;
    priority: NotificationPriority;
    action_url: string;
    metadata: Record<string, unknown>;
    is_read: boolean;
    read_at: string | null;
    is_dismissed: boolean;
    created_at: string;
    time_ago: string;
    // Legacy compat
    time?: string;
    unread?: boolean;
}

export interface NotificationListResponse {
    results: NotificationData[];
    total: number;
    limit: number;
    offset: number;
}

export interface NotificationPreference {
    category: NotificationCategory;
    channel: 'in_app' | 'email' | 'browser_push';
    enabled: boolean;
    digest_mode: 'instant' | 'hourly' | 'daily' | 'weekly';
    mandatory?: boolean;
}

export interface AdminSendPayload {
    template_key?: string;
    title?: string;
    message?: string;
    targets: { type: 'user' | 'department' | 'role' | 'tenant'; id: string }[];
    context?: Record<string, string>;
    category?: NotificationCategory;
    priority?: NotificationPriority;
    notification_type?: NotificationType;
    action_url?: string;
}

export const notificationService = {
    getAll: async (params?: {
        category?: string;
        unread?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<NotificationListResponse> => {
        const query = new URLSearchParams();
        if (params?.category) query.set('category', params.category);
        if (params?.unread) query.set('unread', 'true');
        if (params?.limit) query.set('limit', String(params.limit));
        if (params?.offset) query.set('offset', String(params.offset));
        const qs = query.toString();
        const res = await api.get<NotificationListResponse>(`/notifications/${qs ? `?${qs}` : ''}`);
        return res.data;
    },

    getUnreadCount: async (): Promise<number> => {
        const res = await api.get<{ unread_count: number }>('/notifications/unread-count/');
        return res.data.unread_count;
    },

    markRead: async (id: string): Promise<void> => {
        await api.post(`/notifications/${id}/read/`);
    },

    markAllRead: async (): Promise<void> => {
        await api.post('/notifications/read-all/');
    },

    dismiss: async (id: string): Promise<void> => {
        await api.delete(`/notifications/${id}/`);
    },

    // Preferences
    getPreferences: async (): Promise<NotificationPreference[]> => {
        const res = await api.get<NotificationPreference[]>('/notifications/preferences/');
        return res.data;
    },

    updatePreferences: async (preferences: NotificationPreference[]): Promise<NotificationPreference[]> => {
        const res = await api.put<NotificationPreference[]>('/notifications/preferences/', { preferences });
        return res.data;
    },

    // Admin
    adminSend: async (payload: AdminSendPayload): Promise<{ status: string; notification_id: string }> => {
        const res = await api.post('/admin/notifications/send/', payload);
        return res.data;
    },

    adminGetTemplates: async () => {
        const res = await api.get('/admin/notifications/templates/');
        return res.data;
    },

    adminGetStats: async (days = 7) => {
        const res = await api.get(`/admin/notifications/stats/?days=${days}`);
        return res.data;
    },
};
