import { create } from 'zustand';
import type { LoginResponse } from '../services/auth.service';

interface AuthState {
    user: LoginResponse['user'] | null;
    isAuthenticated: boolean;
    isPlatformOwner: boolean;
    mfaSession: string | null;
    mfaMethods: string[];
    setUser: (user: LoginResponse['user'] | null) => void;
    setMfaChallenge: (session: string, methods: string[]) => void;
    clearMfaChallenge: () => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isPlatformOwner: false,
    mfaSession: null,
    mfaMethods: [],
    setUser: (user) => set({
        user,
        isAuthenticated: !!user,
        isPlatformOwner: !!user?.isPlatformOwner,
        mfaSession: null,
        mfaMethods: [],
    }),
    setMfaChallenge: (session, methods) => set({
        mfaSession: session,
        mfaMethods: methods,
    }),
    clearMfaChallenge: () => set({
        mfaSession: null,
        mfaMethods: [],
    }),
    logout: () => set({ user: null, isAuthenticated: false, isPlatformOwner: false, mfaSession: null, mfaMethods: [] }),
}));
