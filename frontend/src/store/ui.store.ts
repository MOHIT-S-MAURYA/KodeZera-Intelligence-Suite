import { create } from 'zustand';
import type { ToastType } from '../components/ui/Toast';
import type { NotificationData, NotificationCategory, NotificationPreference } from '../services/notification.service';
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
    notificationsTotal: number;
    unreadCount: number;
    notificationCategory: NotificationCategory | null;
    notificationOffset: number;
    preferences: NotificationPreference[];
    preferencesLoading: boolean;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    addToast: (type: ToastType, message: string) => void;
    removeToast: (id: string) => void;
    fetchNotifications: (reset?: boolean) => Promise<void>;
    fetchUnreadCount: () => Promise<void>;
    setNotificationCategory: (category: NotificationCategory | null) => void;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    removeNotification: (id: string) => Promise<void>;
    fetchPreferences: () => Promise<void>;
    updatePreferences: (prefs: NotificationPreference[]) => Promise<void>;
}

export const useUIStore = create<UIState>((set, get) => ({
    sidebarOpen: true,
    toasts: [],
    notifications: [],
    notificationsLoading: false,
    notificationsTotal: 0,
    unreadCount: 0,
    notificationCategory: null,
    notificationOffset: 0,
    preferences: [],
    preferencesLoading: false,

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

    fetchNotifications: async (reset = true) => {
        const { notificationCategory, notificationOffset } = get();
        set({ notificationsLoading: true });
        try {
            const data = await notificationService.getAll({
                category: notificationCategory || undefined,
                limit: 50,
                offset: reset ? 0 : notificationOffset,
            });
            // Map new fields to legacy compat
            const mapped = data.results.map((n) => ({
                ...n,
                time: n.time_ago,
                unread: !n.is_read,
            }));
            if (reset) {
                set({ notifications: mapped, notificationsTotal: data.total, notificationOffset: data.results.length });
            } else {
                set((state) => ({
                    notifications: [...state.notifications, ...mapped],
                    notificationsTotal: data.total,
                    notificationOffset: state.notificationOffset + data.results.length,
                }));
            }
        } catch {
            // silently fail — don't block the rest of the UI
        } finally {
            set({ notificationsLoading: false });
        }
    },

    fetchUnreadCount: async () => {
        try {
            const count = await notificationService.getUnreadCount();
            set({ unreadCount: count });
        } catch {
            // silently fail
        }
    },

    setNotificationCategory: (category) => {
        set({ notificationCategory: category, notificationOffset: 0 });
        get().fetchNotifications(true);
    },

    markAsRead: async (id: string) => {
        // Optimistic update
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, is_read: true, unread: false } : n
            ),
            unreadCount: Math.max(0, state.unreadCount - 1),
        }));
        try {
            await notificationService.markRead(id);
        } catch {
            // Revert on failure
            get().fetchNotifications();
            get().fetchUnreadCount();
        }
    },

    markAllAsRead: async () => {
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, is_read: true, unread: false })),
            unreadCount: 0,
        }));
        try {
            await notificationService.markAllRead();
        } catch {
            get().fetchNotifications();
            get().fetchUnreadCount();
        }
    },

    removeNotification: async (id: string) => {
        const n = get().notifications.find((n) => n.id === id);
        const wasUnread = n && !n.is_read;
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
            unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        }));
        try {
            await notificationService.dismiss(id);
        } catch {
            get().fetchNotifications();
            get().fetchUnreadCount();
        }
    },

    fetchPreferences: async () => {
        set({ preferencesLoading: true });
        try {
            const prefs = await notificationService.getPreferences();
            set({ preferences: prefs });
        } catch {
            // silently fail
        } finally {
            set({ preferencesLoading: false });
        }
    },

    updatePreferences: async (prefs) => {
        try {
            const updated = await notificationService.updatePreferences(prefs);
            set({ preferences: updated });
        } catch {
            // revert
            get().fetchPreferences();
        }
    },
}));
