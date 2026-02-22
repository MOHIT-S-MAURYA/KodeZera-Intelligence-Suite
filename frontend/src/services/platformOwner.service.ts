import api from './api';

// Types
export interface PlatformOverview {
    tenants: {
        total: number;
        active: number;
        suspended: number;
    };
    users: {
        total: number;
    };
    usage_today: {
        queries: number;
        failed_queries: number;
        avg_response_time_ms: number;
        tokens_used: number;
    };
    documents: {
        total_indexed: number;
    };
    storage: {
        total_bytes: number;
        total_gb: number;
    };
    sessions: {
        active: number;
    };
    system: {
        embedding_queue_length: number;
        active_workers: number;
    };
}

export interface TenantListItem {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    created_at: string;
    users_count: number;
    documents_count: number;
    plan: string;
    subscription_status: string;
    storage_used_bytes: number;
    queries_today: number;
}

export interface TenantsListResponse {
    count: number;
    tenants: TenantListItem[];
}

export interface SystemHealthComponent {
    status: string;
    uptime_percentage: number;
    latency_ms?: number;
    error_rate?: number;
    connections?: number;
    query_time_ms?: number;
    collections?: number;
    vectors_count?: number;
    memory_used_mb?: number;
    hit_rate?: number;
    active_workers?: number;
    failed_tasks?: number;
    queue_length?: number;
    rate_limit_remaining?: number;
}

export interface SystemHealth {
    api_server: SystemHealthComponent;
    database: SystemHealthComponent;
    vector_db: SystemHealthComponent;
    redis: SystemHealthComponent;
    celery_workers: SystemHealthComponent;
    llm_provider: SystemHealthComponent;
}

export interface AuditLog {
    id: string;
    action: string;
    performed_by: string;
    tenant_affected: string | null;
    details: Record<string, any>;
    timestamp: string;
    ip_address: string | null;
}

export interface AuditLogsResponse {
    count: number;
    logs: AuditLog[];
}

export interface AuditLogsFilters {
    action?: string;
    tenant_id?: string;
    days?: number;
    limit?: number;
    offset?: number;
}

export interface AnalyticsDataPoint {
    date: string;
    full_date: string;
    queries: number;
    failed: number;
    latency: number;
    tokens: number;
    users: number;
}

export interface AnalyticsFilter {
    tenant_id?: string;
    days?: number;
    start_date?: string;
    end_date?: string;
}

class PlatformOwnerService {
    /**
     * Get platform-wide overview statistics
     */
    async getOverview(): Promise<PlatformOverview> {
        const response = await api.get<PlatformOverview>('/platform/overview/');
        return response.data;
    }

    /**
     * Get list of all tenants with metadata
     */
    async getTenants(): Promise<TenantsListResponse> {
        const response = await api.get<TenantsListResponse>('/platform/tenants/');
        return response.data;
    }

    /**
     * Get system health status
     */
    async getSystemHealth(): Promise<SystemHealth> {
        const response = await api.get<SystemHealth>('/platform/system-health/');
        return response.data;
    }

    /**
     * Get system audit logs
     */
    async getAuditLogs(filters?: AuditLogsFilters): Promise<AuditLogsResponse> {
        const params = new URLSearchParams();

        if (filters?.action) {
            params.append('action', filters.action);
        }
        if (filters?.tenant_id) {
            params.append('tenant_id', filters.tenant_id);
        }
        if (filters?.days) {
            params.append('days', filters.days.toString());
        }
        if (filters?.limit) {
            params.append('limit', filters.limit.toString());
        }
        if (filters?.offset) {
            params.append('offset', filters.offset.toString());
        }

        const response = await api.get<AuditLogsResponse>(
            `/platform/audit-logs/?${params.toString()}`
        );
        return response.data;
    }

    /**
     * Get analytics data
     */
    async getAnalytics(filters: AnalyticsFilter): Promise<AnalyticsDataPoint[]> {
        const params = new URLSearchParams();
        if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
        if (filters.days) params.append('days', filters.days.toString());
        if (filters.start_date) params.append('start_date', filters.start_date);
        if (filters.end_date) params.append('end_date', filters.end_date);

        const response = await api.get<AnalyticsDataPoint[]>(`/platform/analytics/?${params.toString()}`);
        return response.data;
    }
}

export const platformOwnerService = new PlatformOwnerService();
export default platformOwnerService;
