import api from './api';

export interface ActivityItem {
    id: string;
    actor: string;
    actor_initial: string;
    action: string;
    resource: string;
    resource_type: string;
    timestamp: string; // ISO 8601
}

export interface DashboardStats {
    documents_count: number;
    users_count: number;
    queries_today: number;
    storage_used_bytes: number;
    total_tenant_documents: number;
    recent_activity: ActivityItem[];
}

export const dashboardService = {
    getStats: async (): Promise<DashboardStats> => {
        const response = await api.get<DashboardStats>('/dashboard/');
        return response.data;
    },
};
