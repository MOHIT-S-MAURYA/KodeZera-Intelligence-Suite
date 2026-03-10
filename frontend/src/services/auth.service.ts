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
        mfa_enabled?: boolean;
        force_password_change?: boolean;
        tenant?: {
            id: string;
            name: string;
        } | null;
    };
}

export interface MFAChallengeResponse {
    mfa_required: true;
    mfa_session: string;
    methods: string[];
}

export interface RefreshResponse {
    access: string;
}

export interface SessionInfo {
    id: string;
    device_name: string;
    ip_address: string;
    location: string;
    is_active: boolean;
    last_active_at: string;
    created_at: string;
    is_current: boolean;
}

export interface MFADevice {
    id: string;
    device_type: string;
    name: string;
    is_primary: boolean;
    last_used_at: string | null;
    created_at: string;
}

export interface MFASetupResponse {
    device_id: string;
    secret: string;
    provisioning_uri: string;
    qr_code: string;
}

class AuthService {
    async login(credentials: LoginCredentials): Promise<LoginResponse | MFAChallengeResponse> {
        const response = await api.post<LoginResponse | MFAChallengeResponse>('/auth/login/', credentials);
        const data = response.data;

        // If MFA is required, don't store tokens yet
        if ('mfa_required' in data && data.mfa_required) {
            return data;
        }

        const loginData = data as LoginResponse;
        localStorage.setItem('accessToken', loginData.access);
        localStorage.setItem('refreshToken', loginData.refresh);
        localStorage.setItem('user', JSON.stringify(loginData.user));
        return loginData;
    }

    async verifyMFA(mfaSession: string, method: string, code: string): Promise<LoginResponse> {
        const response = await api.post<LoginResponse>('/auth/mfa/verify/', {
            mfa_session: mfaSession,
            method,
            code,
        });
        localStorage.setItem('accessToken', response.data.access);
        localStorage.setItem('refreshToken', response.data.refresh);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        return response.data;
    }

    async sendMFAEmail(mfaSession: string): Promise<void> {
        await api.post('/auth/mfa/send-email/', { mfa_session: mfaSession });
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

    async logout(): Promise<void> {
        try {
            await api.post('/auth/logout/');
        } catch {
            // Even if server logout fails, clear local tokens
        }
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
    }

    async logoutAll(): Promise<void> {
        await api.post('/auth/logout-all/');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
    }

    async forgotPassword(email: string): Promise<void> {
        await api.post('/auth/forgot-password/', { email });
    }

    async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
        await api.post('/auth/reset-password/', {
            email,
            otp,
            new_password: newPassword,
        });
    }

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        await api.post('/auth/change-password/', {
            current_password: currentPassword,
            new_password: newPassword,
        });
    }

    // Session management
    async getSessions(): Promise<SessionInfo[]> {
        const response = await api.get<SessionInfo[]>('/auth/sessions/');
        return response.data;
    }

    async revokeSession(sessionId: string): Promise<void> {
        await api.post(`/auth/sessions/${sessionId}/revoke/`);
    }

    // MFA management
    async setupMFA(): Promise<MFASetupResponse> {
        const response = await api.post<MFASetupResponse>('/auth/mfa/setup/');
        return response.data;
    }

    async confirmMFA(code: string): Promise<void> {
        await api.post('/auth/mfa/confirm/', { code });
    }

    async getMFADevices(): Promise<MFADevice[]> {
        const response = await api.get<MFADevice[]>('/auth/mfa/devices/');
        return response.data;
    }

    async removeMFADevice(deviceId: string): Promise<void> {
        await api.delete(`/auth/mfa/devices/${deviceId}/`);
    }

    async disableMFA(password: string): Promise<void> {
        await api.post('/auth/mfa/disable/', { password });
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
