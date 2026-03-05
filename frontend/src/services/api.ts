import axios, { AxiosError } from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useUIStore } from '../store/ui.store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Create axios instance
const api: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,      // 15 s hard ceiling — prevents silent hangs
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('accessToken');
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for error handling and token refresh
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });

    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // If 401 and not already retried, try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise(function (resolve, reject) {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        if (originalRequest.headers) {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                        }
                        return api(originalRequest);
                    })
                    .catch((err) => {
                        return Promise.reject(err);
                    });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const refreshToken = localStorage.getItem('refreshToken');
                if (refreshToken) {
                    const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, {
                        refresh: refreshToken,
                    });

                    const { access } = response.data;
                    localStorage.setItem('accessToken', access);

                    if (originalRequest.headers) {
                        originalRequest.headers.Authorization = `Bearer ${access}`;
                    }

                    processQueue(null, access);
                    return api(originalRequest);
                } else {
                    // No refresh token, logout
                    throw new Error('No refresh token available');
                }
            } catch (refreshError) {
                processQueue(refreshError, null);
                // Refresh failed, logout user
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        // Global 403 handler — permission denied feedback
        if (error.response?.status === 403) {
            useUIStore.getState().addToast(
                'error',
                "You don't have permission to perform this action. Contact your administrator."
            );
        }

        return Promise.reject(error);
    }
);

export default api;
