import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import authService from '../services/auth.service';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated, setUser } = useAuthStore();

    useEffect(() => {
        if (!isAuthenticated && authService.isAuthenticated()) {
            const user = authService.getUser();
            if (user) {
                setUser(user);
            }
        }
    }, [isAuthenticated, setUser]);

    if (!isAuthenticated && !authService.isAuthenticated()) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};
