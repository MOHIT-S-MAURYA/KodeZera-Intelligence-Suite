import api from './api';

export interface DailySeriesPoint {
    date: string;
    full_date: string;
    queries: number;
    failed: number;
    latency: number;
    tokens: number;
    users: number;
}

export interface AnalyticsSummary {
    total_queries: number;
    failed_queries?: number;
    success_rate?: number;
    avg_latency_ms: number;
    total_tokens: number;
    avg_relevance?: number;
}

export interface DashboardTrendsResponse {
    series: DailySeriesPoint[];
    summary: AnalyticsSummary;
}

export interface TopSessionItem {
    id: string;
    title: string;
    query_count: number;
    created_at: string;
}

export interface MyAnalyticsResponse {
    series: DailySeriesPoint[];
    summary: AnalyticsSummary;
    top_sessions: TopSessionItem[];
}

export interface PlatformAnalyticsResponse {
    series: DailySeriesPoint[];
    summary: {
        total_queries: number;
        total_failed: number;
        success_rate: number;
        total_tokens: number;
        avg_latency_ms: number;
    };
    tenant_breakdown: Array<{
        tenant_id: string;
        tenant_name: string;
        queries: number;
        users: number;
        tokens: number;
        storage_bytes: number;
    }>;
}

export interface QualityAnalyticsResponse {
    total_queries: number;
    failed_queries: number;
    success_rate: number;
    avg_latency_ms: number;
    avg_relevance_score: number | null;
    avg_chunks_retrieved: number;
    satisfaction_rate: number | null;
    feedback_positive: number;
    feedback_negative: number;
}

export interface ForecastResponse {
    forecast: Array<{
        date: string;
        full_date: string;
        queries: number;
        tokens: number;
        projected: boolean;
    }>;
    avg_daily_queries: number;
    avg_daily_tokens: number;
}

export const analyticsService = {
    getDashboardTrends: async (days = 30): Promise<DashboardTrendsResponse> => {
        const response = await api.get<DashboardTrendsResponse>(`/dashboard/trends/?days=${days}`);
        return response.data;
    },

    getMyAnalytics: async (days = 30): Promise<MyAnalyticsResponse> => {
        const response = await api.get<MyAnalyticsResponse>(`/dashboard/my-analytics/?days=${days}`);
        return response.data;
    },

    getPlatformAnalytics: async (params: {
        tenant_id?: string;
        days?: number;
        start_date?: string;
        end_date?: string;
    }): Promise<PlatformAnalyticsResponse> => {
        const qp = new URLSearchParams();
        if (params.tenant_id) qp.append('tenant_id', params.tenant_id);
        if (params.days) qp.append('days', String(params.days));
        if (params.start_date) qp.append('start_date', params.start_date);
        if (params.end_date) qp.append('end_date', params.end_date);
        const response = await api.get<PlatformAnalyticsResponse>(`/platform/analytics/enhanced/?${qp.toString()}`);
        return response.data;
    },

    getPlatformQuality: async (tenantId = 'all', days = 30): Promise<QualityAnalyticsResponse> => {
        const qp = new URLSearchParams();
        if (tenantId && tenantId !== 'all') qp.append('tenant_id', tenantId);
        qp.append('days', String(days));
        const response = await api.get<QualityAnalyticsResponse>(`/platform/analytics/quality/?${qp.toString()}`);
        return response.data;
    },

    getPlatformForecast: async (days = 30): Promise<ForecastResponse> => {
        const response = await api.get<ForecastResponse>(`/platform/analytics/forecast/?days=${days}`);
        return response.data;
    },
};
