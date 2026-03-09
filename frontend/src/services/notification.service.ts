import api from './api';

export interface NotificationData {
    id: string;
    title: string;
    message: string;
    category: string;
    time: string;
    created_at: string;
    unread: boolean;
}

export const notificationService = {
    getAll: async (): Promise<NotificationData[]> => {
        const res = await api.get<NotificationData[]>('/notifications/');
        return res.data;
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
};
