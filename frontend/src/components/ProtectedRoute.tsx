import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import authService from '../services/auth.service';
import { PageLoader } from './ui/Spinner';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated, setUser } = useAuthStore();
    const [loading, setLoading] = React.useState(true);

    useEffect(() => {
        // Check if user is authenticated on mount
        if (authService.isAuthenticated()) {
            const user = authService.getUser();
            setUser(user);
        }
        setLoading(false);
    }, [setUser]);

    if (loading) {
        return <PageLoader />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};
