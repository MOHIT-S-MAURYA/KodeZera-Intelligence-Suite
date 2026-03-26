import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Building2, Users, Activity, Database, Shield, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../store/auth.store';
import platformOwnerService from '../services/platformOwner.service';
import type { PlatformOverview, TenantsListResponse, SystemHealth } from '../services/platformOwner.service';

export const PlatformDashboard: React.FC = () => {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [overview, setOverview] = useState<PlatformOverview | null>(null);
    const [tenants, setTenants] = useState<TenantsListResponse | null>(null);
    const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [overviewData, tenantsData, healthData] = await Promise.all([
                    platformOwnerService.getOverview(),
                    platformOwnerService.getTenants(),
                    platformOwnerService.getSystemHealth(),
                ]);

                setOverview(overviewData);
                setTenants(tenantsData);
                setSystemHealth(healthData);
                setError(null);
            } catch (err) {
                const e = err as { response?: { data?: { detail?: string } } };
                console.error('Failed to fetch platform data:', err);
                setError(e.response?.data?.detail || 'Failed to load platform data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
            </div>
        );
    }

    if (error) {
        return (
            <Card variant="elevated" className="p-6">
                <div className="flex items-center gap-3 text-error-600">
                    <AlertCircle className="w-6 h-6" />
                    <p>{error}</p>
                </div>
            </Card>
        );
    }

    const stats = [
        {
            label: 'Total Tenants',
            value: overview?.tenants.total.toString() || '0',
            icon: Building2,
            color: 'text-blue-600',
            bgColor: 'bg-blue-100'
        },
        {
            label: 'Total Users',
            value: overview?.users.total.toLocaleString() || '0',
            icon: Users,
            color: 'text-green-600',
            bgColor: 'bg-green-100'
        },
        {
            label: 'Active Sessions',
            value: overview?.sessions.active.toString() || '0',
            icon: Activity,
            color: 'text-purple-600',
            bgColor: 'bg-purple-100'
        },
        {
            label: 'Storage Used',
            value: `${overview?.storage.total_gb || 0} GB`,
            icon: Database,
            color: 'text-orange-600',
            bgColor: 'bg-orange-100'
        },
    ];

    const healthComponents = [
        { name: 'API Server', data: systemHealth?.api_server, key: 'api_server' },
        { name: 'Database', data: systemHealth?.database, key: 'database' },
        { name: 'Redis Cache', data: systemHealth?.redis, key: 'redis' },
        { name: 'Qdrant Vector DB', data: systemHealth?.vector_db, key: 'vector_db' },
        { name: 'Celery Workers', data: systemHealth?.celery_workers, key: 'celery_workers' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center">
                            <Crown className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-display-sm text-gray-900">Platform Dashboard</h1>
                            <p className="text-body-sm text-gray-600">
                                Welcome back, {user?.first_name || 'Platform Owner'}
                            </p>
                        </div>
                    </div>
                </div>
                <Button variant="primary" onClick={() => navigate('/platform/tenants')}>
                    <Building2 className="w-5 h-5 mr-2" />
                    Create Tenant
                </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, index) => (
                    <Card
                        key={stat.label}
                        variant="elevated"
                        className="animate-scale-in"
                        style={{ animationDelay: `${index * 100}ms` }}
                    >
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                </div>
                                <TrendingUp className="w-5 h-5 text-green-500" />
                            </div>
                            <p className="text-title-lg text-gray-900 mb-1">{stat.value}</p>
                            <p className="text-body-sm text-gray-600">{stat.label}</p>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Additional Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card variant="elevated">
                    <div className="p-6">
                        <h3 className="text-title-sm text-gray-900 mb-4">Usage Today</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Queries</span>
                                <span className="text-body-sm font-medium text-gray-900">
                                    {overview?.usage_today.queries.toLocaleString() || 0}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Failed Queries</span>
                                <span className="text-body-sm font-medium text-error-600">
                                    {overview?.usage_today.failed_queries.toLocaleString() || 0}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Avg Response Time</span>
                                <span className="text-body-sm font-medium text-gray-900">
                                    {overview?.usage_today.avg_response_time_ms.toFixed(0) || 0}ms
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Tokens Used</span>
                                <span className="text-body-sm font-medium text-gray-900">
                                    {overview?.usage_today.tokens_used.toLocaleString() || 0}
                                </span>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card variant="elevated">
                    <div className="p-6">
                        <h3 className="text-title-sm text-gray-900 mb-4">Tenant Status</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Active</span>
                                <Badge variant="success">{overview?.tenants.active || 0}</Badge>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Suspended</span>
                                <Badge variant="warning">{overview?.tenants.suspended || 0}</Badge>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Total</span>
                                <Badge variant="info">{overview?.tenants.total || 0}</Badge>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card variant="elevated">
                    <div className="p-6">
                        <h3 className="text-title-sm text-gray-900 mb-4">System Status</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Documents Indexed</span>
                                <span className="text-body-sm font-medium text-gray-900">
                                    {overview?.documents.total_indexed.toLocaleString() || 0}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Embedding Queue</span>
                                <span className="text-body-sm font-medium text-gray-900">
                                    {overview?.system.embedding_queue_length || 0}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-body-sm text-gray-600">Active Workers</span>
                                <span className="text-body-sm font-medium text-gray-900">
                                    {overview?.system.active_workers || 0}
                                </span>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Tenants List */}
                <Card variant="elevated" className="lg:col-span-2">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-brand-600" />
                                <h3 className="text-title-md text-gray-900">Tenants</h3>
                            </div>
                            <Badge variant="info">{tenants?.count || 0} total</Badge>
                        </div>
                        <div className="space-y-3">
                            {tenants?.tenants.slice(0, 5).map((tenant) => (
                                <div
                                    key={tenant.id}
                                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white font-semibold">
                                            {tenant.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{tenant.name}</p>
                                            <p className="text-sm text-gray-500">
                                                {tenant.users_count} users • {tenant.documents_count} docs
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant={tenant.is_active ? 'success' : 'default'}>
                                            {tenant.is_active ? 'active' : 'inactive'}
                                        </Badge>
                                        <Button variant="ghost" size="sm">Manage</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>

                {/* System Health */}
                <Card variant="elevated">
                    <div className="p-6">
                        <div className="flex items-center gap-2 mb-6">
                            <Shield className="w-5 h-5 text-green-600" />
                            <h3 className="text-title-md text-gray-900">System Health</h3>
                        </div>
                        <div className="space-y-4">
                            {healthComponents.map((item) => (
                                <div key={item.key} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                                        {item.data?.status === 'healthy' ? (
                                            <Badge variant="success">Healthy</Badge>
                                        ) : (
                                            <Badge variant="warning">Warning</Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${item.data?.status === 'healthy' ? 'bg-green-500' : 'bg-yellow-500'
                                                    }`}
                                                style={{ width: `${item.data?.uptime_percentage || 0}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-600">
                                            {item.data?.uptime_percentage.toFixed(1) || 0}%
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Platform Info */}
            <Card variant="glass">
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <AlertCircle className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 mb-1">Platform Owner Access</h4>
                            <p className="text-sm text-gray-600">
                                You have full administrative access to the Kodezera Intelligence Suite platform.
                                You can manage all tenants, monitor system health, and configure platform-wide settings.
                                <strong className="block mt-2 text-brand-600">
                                    Privacy Note: You can only view tenant metadata, not their private data or documents.
                                </strong>
                            </p>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};
