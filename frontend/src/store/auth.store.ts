import { create } from 'zustand';
import type { LoginResponse } from '../services/auth.service';

interface AuthState {
    user: LoginResponse['user'] | null;
    isAuthenticated: boolean;
    setUser: (user: LoginResponse['user'] | null) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    setUser: (user) => set({ user, isAuthenticated: !!user }),
    logout: () => set({ user: null, isAuthenticated: false }),
}));
