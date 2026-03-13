import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Recharts from 'recharts';
import {
    FileText, Users, MessageSquare, HardDrive,
    TrendingUp, ArrowUpRight, RefreshCw, AlertCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useAuthStore } from '../store/auth.store';
import { dashboardService, type DashboardStats } from '../services/dashboard.service';
import { analyticsService, type DailySeriesPoint } from '../services/analytics.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function timeAgo(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) { const m = Math.floor(diff / 60); return `${m} minute${m !== 1 ? 's' : ''} ago`; }
    if (diff < 86400) { const h = Math.floor(diff / 3600); return `${h} hour${h !== 1 ? 's' : ''} ago`; }
    const d = Math.floor(diff / 86400);
    if (d < 30) return `${d} day${d !== 1 ? 's' : ''} ago`;
    return new Date(isoString).toLocaleDateString();
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    accentClass: string;
    iconBgClass: string;
    loading: boolean;
    delay: number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, accentClass, iconBgClass, loading, delay }) => (
    <Card hover className="relative overflow-hidden animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentClass}`} />
        <CardContent className="pl-6">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-600 mb-1">{title}</p>
                    {loading
                        ? <div className="h-9 w-24 bg-gray-200 rounded animate-pulse mb-2" />
                        : <h3 className="text-3xl font-bold text-gray-900 mb-2">{value}</h3>}
                </div>
                <div className={`w-12 h-12 rounded-lg ${iconBgClass} flex items-center justify-center`}>{icon}</div>
            </div>
        </CardContent>
    </Card>
);

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const Dashboard: React.FC = () => {
    const { user } = useAuthStore();
    const navigate = useNavigate();

    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [trendData, setTrendData] = useState<DailySeriesPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchStats = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const [statsData, trendResp] = await Promise.all([
                dashboardService.getStats(),
                analyticsService.getDashboardTrends(30),
            ]);
            setStats(statsData);
            setTrendData(trendResp.series || []);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to load dashboard data.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    const statCards = [
        {
            title: 'Documents Available',
            value: loading ? '…' : (stats?.documents_count ?? 0).toLocaleString(),
            icon: <FileText className="w-6 h-6 text-brand-600" />,
            accentClass: 'bg-gradient-to-b from-brand-500 to-brand-600',
            iconBgClass: 'bg-brand-50',
        },
        {
            title: 'Active Users',
            value: loading ? '…' : (stats?.users_count ?? 0).toLocaleString(),
            icon: <Users className="w-6 h-6 text-success-600" />,
            accentClass: 'bg-gradient-to-b from-success-500 to-success-600',
            iconBgClass: 'bg-success-50',
        },
        {
            title: 'My Queries Today',
            value: loading ? '…' : (stats?.queries_today ?? 0).toLocaleString(),
            icon: <MessageSquare className="w-6 h-6 text-info-600" />,
            accentClass: 'bg-gradient-to-b from-info-500 to-info-600',
            iconBgClass: 'bg-info-50',
        },
        {
            title: 'Storage Used',
            value: loading ? '…' : formatBytes(stats?.storage_used_bytes ?? 0),
            icon: <HardDrive className="w-6 h-6 text-warning-600" />,
            accentClass: 'bg-gradient-to-b from-warning-500 to-warning-600',
            iconBgClass: 'bg-warning-50',
        },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Welcome + Refresh */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">
                        Welcome back, {user?.first_name || user?.email}! 👋
                    </h1>
                    <p className="text-body-md text-gray-600">
                        Here's what's happening with your organisation today.
                    </p>
                </div>
                <button
                    onClick={() => fetchStats(true)}
                    disabled={loading || refreshing}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                    <button onClick={() => fetchStats()} className="ml-auto text-sm font-medium underline hover:no-underline">Retry</button>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card, index) => (
                    <StatCard key={card.title} {...card} loading={loading} delay={index * 100} />
                ))}
            </div>

            {/* Usage Trend */}
            <Card>
                <CardHeader>
                    <CardTitle>Usage Trend (Last 30 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] w-full">
                        <Recharts.ResponsiveContainer width="100%" height="100%">
                            <Recharts.AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="dashboardQueries" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
                                    </linearGradient>
                                    <linearGradient id="dashboardTokens" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.14} />
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.01} />
                                    </linearGradient>
                                </defs>
                                <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <Recharts.XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                                <Recharts.YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                                <Recharts.YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                <Recharts.Tooltip />
                                <Recharts.Legend />
                                <Recharts.Area
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="queries"
                                    name="Queries"
                                    stroke="#0284c7"
                                    fill="url(#dashboardQueries)"
                                    strokeWidth={2}
                                />
                                <Recharts.Area
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="tokens"
                                    name="Tokens"
                                    stroke="#d97706"
                                    fill="url(#dashboardTokens)"
                                    strokeWidth={2}
                                />
                            </Recharts.AreaChart>
                        </Recharts.ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Recent Activity & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <Card className="lg:col-span-2">
                    <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-4">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                                            <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : stats?.recent_activity && stats.recent_activity.length > 0 ? (
                            <div className="space-y-4">
                                {stats.recent_activity.map((activity) => (
                                    <div key={activity.id} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                            {activity.actor_initial}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-gray-900">
                                                <span className="font-medium">{activity.actor}</span>{' '}
                                                <span className="text-gray-600">{activity.action}</span>{' '}
                                                <span className="font-medium text-brand-600 truncate">{activity.resource}</span>
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">{timeAgo(activity.timestamp)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-gray-500">
                                <TrendingUp className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                <p className="text-sm">No recent activity yet.</p>
                                <p className="text-xs text-gray-400 mt-1">Activity will appear here once your team starts using the platform.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                    <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <button onClick={() => navigate('/documents')} className="w-full flex items-center justify-between p-3 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 transition-colors group">
                                <span className="font-medium">Upload Document</span>
                                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                            <button onClick={() => navigate('/chat')} className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors group">
                                <span className="font-medium">Start Chat</span>
                                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                            <button onClick={() => navigate('/users')} className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors group">
                                <span className="font-medium">Manage Users</span>
                                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                            <button onClick={() => navigate('/documents')} className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors group">
                                <span className="font-medium">View Documents</span>
                                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Org Summary */}
            {!loading && stats && (
                <Card>
                    <CardHeader><CardTitle>Organisation Summary</CardTitle></CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex items-center justify-between p-4 bg-brand-50 rounded-lg">
                                <div>
                                    <p className="text-sm text-brand-700 font-medium">Total Documents</p>
                                    <p className="text-2xl font-bold text-brand-900">{stats.total_tenant_documents.toLocaleString()}</p>
                                    <p className="text-xs text-brand-600 mt-1">{stats.documents_count.toLocaleString()} accessible to you</p>
                                </div>
                                <Badge variant="info">Live</Badge>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-success-50 rounded-lg">
                                <div>
                                    <p className="text-sm text-success-700 font-medium">Team Members</p>
                                    <p className="text-2xl font-bold text-success-900">{stats.users_count.toLocaleString()}</p>
                                    <p className="text-xs text-success-600 mt-1">active accounts</p>
                                </div>
                                <Badge variant="success">Live</Badge>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-warning-50 rounded-lg">
                                <div>
                                    <p className="text-sm text-warning-700 font-medium">Storage Used</p>
                                    <p className="text-2xl font-bold text-warning-900">{formatBytes(stats.storage_used_bytes)}</p>
                                    <p className="text-xs text-warning-600 mt-1">across all documents</p>
                                </div>
                                <Badge variant="warning">Live</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
