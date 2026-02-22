import { create } from 'zustand';
import type { ToastType } from '../components/ui/Toast';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

export interface Notification {
    id: number;
    title: string;
    message: string;
    time: string;
    unread: boolean;
}

interface UIState {
    sidebarOpen: boolean;
    toasts: Toast[];
    notifications: Notification[];
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    addToast: (type: ToastType, message: string) => void;
    removeToast: (id: string) => void;
    addNotification: (notification: Omit<Notification, 'id' | 'unread'>) => void;
    markAsRead: (id: number) => void;
    markAllAsRead: () => void;
    removeNotification: (id: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
    sidebarOpen: true,
    toasts: [],
    // Initialize with mock data
    notifications: [
        { id: 1, title: 'New Tenant Registered', message: 'Acme Corp has completed registration.', time: '5m ago', unread: true },
        { id: 2, title: 'System Alert', message: 'High CPU usage detected on worker-01.', time: '1h ago', unread: true },
        { id: 3, title: 'Support Ticket Updated', message: 'Ticket #T-1002 has a new reply.', time: '2h ago', unread: false },
        { id: 4, title: 'Database Backup', message: 'Daily backup completed successfully.', time: '5h ago', unread: false },
    ],

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

    addNotification: (notification) => {
        set((state) => ({
            notifications: [
                {
                    id: Date.now(),
                    ...notification,
                    unread: true,
                },
                ...state.notifications,
            ],
        }));
    },

    markAsRead: (id) => {
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, unread: false } : n
            ),
        }));
    },

    markAllAsRead: () => {
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, unread: false })),
        }));
    },

    removeNotification: (id) => {
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
        }));
    },
}));
