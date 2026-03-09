import { create } from 'zustand';
import type { ToastType } from '../components/ui/Toast';
import type { NotificationData } from '../services/notification.service';
import { notificationService } from '../services/notification.service';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

export type { NotificationData as Notification };

interface UIState {
    sidebarOpen: boolean;
    toasts: Toast[];
    notifications: NotificationData[];
    notificationsLoading: boolean;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    addToast: (type: ToastType, message: string) => void;
    removeToast: (id: string) => void;
    fetchNotifications: () => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    removeNotification: (id: string) => Promise<void>;
}

export const useUIStore = create<UIState>((set, get) => ({
    sidebarOpen: true,
    toasts: [],
    notifications: [],
    notificationsLoading: false,

    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

    setSidebarOpen: (open) => set({ sidebarOpen: open }),

    addToast: (type, message) => {
        const id = Math.random().toString(36).substring(7);
        set((state) => ({
            toasts: [...state.toasts, { id, type, message }],
        }));
    },

    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((toast) => toast.id !== id),
        }));
    },

    fetchNotifications: async () => {
        set({ notificationsLoading: true });
        try {
            const data = await notificationService.getAll();
            set({ notifications: data });
        } catch {
            // silently fail — don't block the rest of the UI
        } finally {
            set({ notificationsLoading: false });
        }
    },

    markAsRead: async (id: string) => {
        // Optimistic update
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, unread: false } : n
            ),
        }));
        try {
            await notificationService.markRead(id);
        } catch {
            // Revert on failure
            get().fetchNotifications();
        }
    },

    markAllAsRead: async () => {
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, unread: false })),
        }));
        try {
            await notificationService.markAllRead();
        } catch {
            get().fetchNotifications();
        }
    },

    removeNotification: async (id: string) => {
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
        }));
        try {
            await notificationService.dismiss(id);
        } catch {
            get().fetchNotifications();
        }
    },
}));
