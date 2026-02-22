import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import authService from '../services/auth.service';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

// Auth is resolved synchronously from localStorage — no async effect needed.
// This eliminates the full-page spinner flash that occurred on every navigation
// when useEffect (async by nature) ran after the first render.
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated, setUser } = useAuthStore();

    // Hydrate store from localStorage on first check (idempotent)
    if (!isAuthenticated && authService.isAuthenticated()) {
        const user = authService.getUser();
        if (user) setUser(user);
    }

    if (!isAuthenticated && !authService.isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};
