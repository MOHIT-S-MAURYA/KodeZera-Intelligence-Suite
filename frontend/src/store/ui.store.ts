import { create } from 'zustand';
import type { ToastType } from '../components/ui/Toast';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

interface UIState {
    sidebarOpen: boolean;
    toasts: Toast[];
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    addToast: (type: ToastType, message: string) => void;
    removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
    sidebarOpen: true,
    toasts: [],

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
}));
