import api from './api';

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface LoginResponse {
    access: string;
    refresh: string;
    user: {
        id: string;
        email: string;
        username: string;
        first_name: string;
        last_name: string;
        full_name: string;
        is_tenant_admin: boolean;
        is_superuser?: boolean;
        is_staff?: boolean;
        isPlatformOwner?: boolean;
        tenant?: {
            id: string;
            name: string;
        } | null;
    };
}

export interface RefreshResponse {
    access: string;
}

class AuthService {
    async login(credentials: LoginCredentials): Promise<LoginResponse> {
        const response = await api.post<LoginResponse>('/auth/login/', credentials);

        // Store tokens
        localStorage.setItem('accessToken', response.data.access);
        localStorage.setItem('refreshToken', response.data.refresh);
        localStorage.setItem('user', JSON.stringify(response.data.user));

        return response.data;
    }

    async refreshToken(): Promise<RefreshResponse> {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await api.post<RefreshResponse>('/auth/refresh/', {
            refresh: refreshToken,
        });

        localStorage.setItem('accessToken', response.data.access);
        return response.data;
    }

    logout(): void {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
    }

    getAccessToken(): string | null {
        return localStorage.getItem('accessToken');
    }

    getUser(): LoginResponse['user'] | null {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    }

    isAuthenticated(): boolean {
        return !!this.getAccessToken();
    }
}

export default new AuthService();
