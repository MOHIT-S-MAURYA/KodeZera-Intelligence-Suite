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
    storage_used_bytes: number;
    queries_today: number;
    // Returned only on creation
    admin_credentials?: {
        username: string;
        email: string;
        temporary_password: string;
    };
    email_sent?: boolean;
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
    details: Record<string, unknown>;
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

// ─── Tenant Config ───────────────────────────────────────────────────────────

export interface TenantConfig {
    id: string;
    tenant: string;
    // Security
    password_min_length: number;
    password_complexity: string;
    mfa_enforcement: 'none' | 'optional' | 'required';
    session_timeout_min: number;
    max_login_attempts: number;
    // Branding
    logo_url: string;
    primary_color: string;
    custom_domain: string;
    // AI
    ai_provider_override: Record<string, unknown>;
    max_tokens_per_request: number;
    rag_top_k: number;
    // Data
    retention_days: number;
    updated_at: string;
}

// ─── Usage Summary ───────────────────────────────────────────────────────────

export interface QuotaItem {
    used: number;
    limit: number;
    percentage: number;
}

export interface UsageSummary {
    tenant_id: string;
    plan: string;
    queries: QuotaItem;
    tokens: QuotaItem;
    storage: QuotaItem & { used_gb: number; limit_gb: number };
    users: QuotaItem;
}

// ─── Subscription Plans ──────────────────────────────────────────────────────

export interface SubscriptionPlan {
    id: string;
    name: string;
    plan_type: string;
    price_monthly: string;
    max_users: number;
    max_documents: number;
    max_storage_gb: number;
    max_queries_per_month: number;
    max_tokens_per_month: number;
    features: Record<string, unknown>;
    is_active: boolean;
    subscriber_count: number;
    created_at: string;
}

export interface TenantSubscription {
    id: string;
    tenant: string;
    tenant_name: string;
    plan: string;
    plan_name: string;
    plan_type: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    created_at: string;
}

// ─── Feature Flags ───────────────────────────────────────────────────────────

export interface FeatureFlag {
    id: string;
    key: string;
    name: string;
    description: string;
    default_enabled: boolean;
    is_active: boolean;
    plan_gates: Record<string, boolean>;
    override_count: number;
    created_at: string;
}

export interface TenantFeatureFlag {
    id: string;
    tenant: string;
    tenant_name: string;
    feature: string;
    feature_key: string;
    enabled: boolean;
    reason: string;
    created_at: string;
}

// ─── Health History ──────────────────────────────────────────────────────────

export interface HealthHistoryEntry {
    component: string;
    status: string;
    latency_ms: number;
    details: Record<string, unknown>;
    checked_at: string;
}

export interface ComponentHealth {
    uptime_percentage: number;
    latest: {
        status: string;
        latency_ms: number;
        checked_at: string;
    } | null;
}

export interface HealthHistoryResponse {
    hours: number;
    components: Record<string, ComponentHealth>;
}

// ─── Billing ─────────────────────────────────────────────────────────────────

export interface BillingEvent {
    id: string;
    tenant: string;
    tenant_name: string;
    event_type: string;
    amount: string;
    currency: string;
    stripe_event_id: string;
    details: Record<string, unknown>;
    created_at: string;
}

export interface Invoice {
    id: string;
    tenant: string;
    tenant_name: string;
    invoice_number: string;
    period_start: string;
    period_end: string;
    subtotal: string;
    tax: string;
    total: string;
    status: string;
    line_items: Record<string, unknown>[];
    pdf_url: string;
    paid_at: string | null;
    created_at: string;
}

export interface PaginatedResponse<T> {
    results: T[];
    total: number;
    page: number;
    page_size: number;
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
     * Create a new tenant (auto-creates admin user and sends credentials email)
     */
    async createTenant(data: { name: string; slug: string; admin_email: string }): Promise<TenantListItem> {
        const response = await api.post<TenantListItem>('/platform/tenants/', data);
        return response.data;
    }

    /**
     * Update a tenant (e.g. toggle is_active)
     */
    async updateTenant(tenantId: string, data: Partial<TenantListItem>): Promise<TenantListItem> {
        const response = await api.patch<TenantListItem>(`/platform/tenants/${tenantId}/`, data);
        return response.data;
    }

    /**
     * Delete a tenant permanently
     */
    async deleteTenant(tenantId: string): Promise<void> {
        await api.delete(`/platform/tenants/${tenantId}/`);
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

    // ─── Tenant Config ───────────────────────────────────────────────────────

    async getTenantConfig(tenantId: string): Promise<TenantConfig> {
        const response = await api.get<TenantConfig>(`/platform/tenants/${tenantId}/config/`);
        return response.data;
    }

    async updateTenantConfig(tenantId: string, data: Partial<TenantConfig>): Promise<TenantConfig> {
        const response = await api.put<TenantConfig>(`/platform/tenants/${tenantId}/config/`, data);
        return response.data;
    }

    async getTenantUsage(tenantId: string): Promise<UsageSummary> {
        const response = await api.get<UsageSummary>(`/platform/tenants/${tenantId}/usage/`);
        return response.data;
    }

    async getTenantInvoices(tenantId: string, params?: { status?: string; page?: number }): Promise<PaginatedResponse<Invoice>> {
        const qp = new URLSearchParams();
        if (params?.status) qp.append('status', params.status);
        if (params?.page) qp.append('page', params.page.toString());
        const response = await api.get<PaginatedResponse<Invoice>>(`/platform/tenants/${tenantId}/invoices/?${qp.toString()}`);
        return response.data;
    }

    // ─── Subscription Plans ──────────────────────────────────────────────────

    async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
        const response = await api.get<SubscriptionPlan[]>('/platform/subscriptions/plans/');
        return response.data;
    }

    async createSubscriptionPlan(data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
        const response = await api.post<SubscriptionPlan>('/platform/subscriptions/plans/', data);
        return response.data;
    }

    async updateSubscriptionPlan(planId: string, data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
        const response = await api.patch<SubscriptionPlan>(`/platform/subscriptions/plans/${planId}/`, data);
        return response.data;
    }

    async deleteSubscriptionPlan(planId: string): Promise<void> {
        await api.delete(`/platform/subscriptions/plans/${planId}/`);
    }

    async getSubscriptionPlan(planId: string): Promise<SubscriptionPlan> {
        const response = await api.get<SubscriptionPlan>(`/platform/subscriptions/plans/${planId}/`);
        return response.data;
    }

    async getTenantSubscriptions(filters?: { status?: string; plan?: string }): Promise<TenantSubscription[]> {
        const params = new URLSearchParams();
        if (filters?.status) params.append('status', filters.status);
        if (filters?.plan) params.append('plan', filters.plan);
        const response = await api.get<TenantSubscription[]>(`/platform/subscriptions/?${params.toString()}`);
        return response.data;
    }

    // ─── Feature Flags ───────────────────────────────────────────────────────

    async getFeatureFlags(): Promise<FeatureFlag[]> {
        const response = await api.get<FeatureFlag[]>('/platform/feature-flags/');
        return response.data;
    }

    async createFeatureFlag(data: Partial<FeatureFlag>): Promise<FeatureFlag> {
        const response = await api.post<FeatureFlag>('/platform/feature-flags/', data);
        return response.data;
    }

    async getFeatureFlag(key: string): Promise<FeatureFlag> {
        const response = await api.get<FeatureFlag>(`/platform/feature-flags/${key}/`);
        return response.data;
    }

    async updateFeatureFlag(key: string, data: Partial<FeatureFlag>): Promise<FeatureFlag> {
        const response = await api.patch<FeatureFlag>(`/platform/feature-flags/${key}/`, data);
        return response.data;
    }

    async deleteFeatureFlag(key: string): Promise<void> {
        await api.delete(`/platform/feature-flags/${key}/`);
    }

    async getFeatureFlagTenants(key: string): Promise<TenantFeatureFlag[]> {
        const response = await api.get<TenantFeatureFlag[]>(`/platform/feature-flags/${key}/tenants/`);
        return response.data;
    }

    async setFeatureFlagOverride(key: string, tenantId: string, enabled: boolean, reason?: string): Promise<void> {
        await api.post(`/platform/feature-flags/${key}/tenants/`, {
            tenant_id: tenantId,
            enabled,
            reason: reason || '',
        });
    }

    async removeFeatureFlagOverride(key: string, tenantId: string): Promise<void> {
        await api.delete(`/platform/feature-flags/${key}/tenants/${tenantId}/`);
    }

    // ─── Health History ──────────────────────────────────────────────────────

    async getHealthHistory(params?: { component?: string; hours?: number; limit?: number }): Promise<HealthHistoryResponse> {
        const qp = new URLSearchParams();
        if (params?.component) qp.append('component', params.component);
        if (params?.hours) qp.append('hours', params.hours.toString());
        if (params?.limit) qp.append('limit', params.limit.toString());
        const response = await api.get<HealthHistoryResponse>(`/platform/health/history/?${qp.toString()}`);
        return response.data;
    }

    // ─── Billing Events ──────────────────────────────────────────────────────

    async getBillingEvents(params?: { tenant_id?: string; event_type?: string; page?: number }): Promise<PaginatedResponse<BillingEvent>> {
        const qp = new URLSearchParams();
        if (params?.tenant_id) qp.append('tenant_id', params.tenant_id);
        if (params?.event_type) qp.append('event_type', params.event_type);
        if (params?.page) qp.append('page', params.page.toString());
        const response = await api.get<PaginatedResponse<BillingEvent>>(`/platform/billing/events/?${qp.toString()}`);
        return response.data;
    }

    // ─── Tenant Self-Service ─────────────────────────────────────────────────

    async getMyTenantSettings(): Promise<TenantConfig> {
        const response = await api.get<TenantConfig>('/tenant/settings/');
        return response.data;
    }

    async updateMyTenantSettings(data: Partial<TenantConfig>): Promise<TenantConfig> {
        const response = await api.put<TenantConfig>('/tenant/settings/', data);
        return response.data;
    }

    async getMyTenantFeatures(): Promise<{ features: Record<string, boolean> }> {
        const response = await api.get<{ features: Record<string, boolean> }>('/tenant/features/');
        return response.data;
    }

    async getMyTenantUsage(): Promise<UsageSummary> {
        const response = await api.get<UsageSummary>('/tenant/usage/');
        return response.data;
    }
}

export const platformOwnerService = new PlatformOwnerService();
export default platformOwnerService;
