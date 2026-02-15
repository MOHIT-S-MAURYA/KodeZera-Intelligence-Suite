import { create } from 'zustand';
import type { LoginResponse } from '../services/auth.service';

interface AuthState {
    user: LoginResponse['user'] | null;
    isAuthenticated: boolean;
    isPlatformOwner: boolean;
    setUser: (user: LoginResponse['user'] | null) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isPlatformOwner: false,
    setUser: (user) => set({
        user,
        isAuthenticated: !!user,
        isPlatformOwner: !!user?.isPlatformOwner
    }),
    logout: () => set({ user: null, isAuthenticated: false, isPlatformOwner: false }),
}));
