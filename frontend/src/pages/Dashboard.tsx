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
    <Card hover variant="default" className="relative overflow-hidden animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentClass} opacity-80`} />
        <CardContent className="pl-6 h-full flex flex-col justify-center">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-[32px] font-bold text-text-main mb-1 tracking-tight leading-none">
                        {loading ? <div className="h-9 w-24 bg-background-secondary rounded animate-pulse" /> : value}
                    </h3>
                    <p className="text-sm font-medium text-text-muted">{title}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl border ${iconBgClass} flex items-center justify-center shadow-sm`}>{icon}</div>
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
            icon: <FileText className="w-6 h-6 text-accent-cyan" />,
            accentClass: 'bg-accent-cyan',
            iconBgClass: 'bg-accent-cyan/10 border-accent-cyan/20',
        },
        {
            title: 'Active Users',
            value: loading ? '…' : (stats?.users_count ?? 0).toLocaleString(),
            icon: <Users className="w-6 h-6 text-accent-green" />,
            accentClass: 'bg-accent-green',
            iconBgClass: 'bg-accent-green/10 border-accent-green/20',
        },
        {
            title: 'My Queries Today',
            value: loading ? '…' : (stats?.queries_today ?? 0).toLocaleString(),
            icon: <MessageSquare className="w-6 h-6 text-accent-blue" />,
            accentClass: 'bg-accent-blue',
            iconBgClass: 'bg-accent-blue/10 border-accent-blue/20',
        },
        {
            title: 'Storage Used',
            value: loading ? '…' : formatBytes(stats?.storage_used_bytes ?? 0),
            icon: <HardDrive className="w-6 h-6 text-accent-orange" />,
            accentClass: 'bg-accent-orange',
            iconBgClass: 'bg-accent-orange/10 border-accent-orange/20',
        },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Welcome + Refresh */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-text-main mb-1.5 flex items-center">
                        Welcome back, {user?.first_name || user?.email}! 
                        <span className="ml-2 animate-[wave_2s_ease-in-out_infinite] origin-[70%_70%] inline-block">👋</span>
                    </h1>
                    <p className="text-sm font-medium text-text-muted">
                        Here's your organisation's intelligence overview for today.
                    </p>
                </div>
                <button
                    onClick={() => fetchStats(true)}
                    disabled={loading || refreshing}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-main bg-surface border border-border rounded-xl hover:bg-surface-hover hover:border-border-light hover-lift transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-accent-cyan' : ''}`} />
                    Refresh Stats
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-accent-red/10 border border-accent-red/20 rounded-xl text-accent-red animate-scale-in">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm font-medium">{error}</span>
                    <button onClick={() => fetchStats()} className="ml-auto text-sm font-bold underline hover:no-underline hover:text-red-400">Retry request</button>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6">
                {statCards.map((card, index) => (
                    <StatCard key={card.title} {...card} loading={loading} delay={index * 100} />
                ))}
            </div>

            {/* Usage Trend */}
            <Card variant="default">
                <CardHeader>
                    <CardTitle>Usage Trend <span className="text-text-muted font-medium text-sm ml-2">(Last 30 Days)</span></CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[320px] w-full mt-4">
                        <Recharts.ResponsiveContainer width="100%" height="100%">
                            <Recharts.AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="dashboardQueries" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.01} />
                                    </linearGradient>
                                    <linearGradient id="dashboardTokens" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                                    </linearGradient>
                                </defs>
                                <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <Recharts.XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} dx={10} dy={10} />
                                <Recharts.YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                <Recharts.YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                <Recharts.Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: 'var(--bg-surface)', 
                                        borderColor: 'var(--border-color)',
                                        color: 'var(--text-main)',
                                        borderRadius: '0.75rem',
                                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                                    }} 
                                    itemStyle={{ color: 'var(--text-main)', fontWeight: 600 }}
                                />
                                <Recharts.Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                <Recharts.Area
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="queries"
                                    name="AI Queries"
                                    stroke="#06b6d4" /* cyan-500 */
                                    fill="url(#dashboardQueries)"
                                    strokeWidth={3}
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#06b6d4' }}
                                />
                                <Recharts.Area
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="tokens"
                                    name="Tokens Processed"
                                    stroke="#3b82f6" /* blue-500 */
                                    fill="url(#dashboardTokens)"
                                    strokeWidth={3}
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#3b82f6' }}
                                />
                            </Recharts.AreaChart>
                        </Recharts.ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Recent Activity & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <Card className="lg:col-span-2 shadow-sm">
                    <CardHeader><CardTitle>Recent Activity Stream</CardTitle></CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-4 pt-2">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="flex items-start gap-4 pb-4 border-b border-border last:border-0">
                                        <div className="w-10 h-10 rounded-lg bg-background-secondary animate-pulse flex-shrink-0" />
                                        <div className="flex-1 space-y-2.5 pt-1">
                                            <div className="h-4 bg-background-secondary rounded animate-pulse w-3/4" />
                                            <div className="h-3 bg-background-secondary rounded animate-pulse w-1/3 opacity-50" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : stats?.recent_activity && stats.recent_activity.length > 0 ? (
                            <div className="space-y-1 pt-2">
                                {stats.recent_activity.map((activity) => (
                                    <div key={activity.id} className="group flex items-start gap-4 p-3 rounded-xl hover:bg-surface-hover transition-colors border-b border-border last:border-0 last:pb-3">
                                        <div className="w-10 h-10 rounded-lg bg-accent-cyan text-white shadow-sm flex items-center justify-center text-sm font-bold flex-shrink-0">
                                            {activity.actor_initial}
                                        </div>
                                        <div className="flex-1 min-w-0 pt-0.5">
                                            <p className="text-sm text-text-main leading-tight">
                                                <span className="font-semibold text-text-main group-hover:text-accent-cyan transition-colors">{activity.actor}</span>{' '}
                                                <span className="text-text-muted">{activity.action}</span>{' '}
                                                <span className="font-medium text-accent-blue truncate block sm:inline mt-1 sm:mt-0">{activity.resource}</span>
                                            </p>
                                            <p className="text-xs text-text-muted mt-1.5 opacity-80">{timeAgo(activity.timestamp)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-text-muted opacity-30" />
                                <p className="text-sm font-semibold text-text-main">No recent activity yet.</p>
                                <p className="text-xs text-text-muted mt-1">Activity will appear here once your team starts using the platform.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="shadow-sm">
                    <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
                    <CardContent className="pt-2">
                        <div className="space-y-3">
                            <button onClick={() => navigate('/documents')} className="w-full flex items-center justify-between p-3.5 rounded-xl bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/20 text-accent-cyan transition-all group hover-lift shadow-sm">
                                <span className="font-semibold tracking-wide text-sm">Upload Document</span>
                                <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                            <button onClick={() => navigate('/chat')} className="w-full flex items-center justify-between p-3.5 rounded-xl bg-surface-hover hover:bg-surface border border-border text-text-main transition-all group hover-lift shadow-sm">
                                <span className="font-semibold tracking-wide text-sm">Start AI Chat</span>
                                <ArrowUpRight className="w-4 h-4 text-text-muted group-hover:text-accent-cyan transition-colors" />
                            </button>
                            <button onClick={() => navigate('/users')} className="w-full flex items-center justify-between p-3.5 rounded-xl bg-surface-hover hover:bg-surface border border-border text-text-main transition-all group hover-lift shadow-sm">
                                <span className="font-semibold tracking-wide text-sm">Manage Users</span>
                                <ArrowUpRight className="w-4 h-4 text-text-muted group-hover:text-accent-cyan transition-colors" />
                            </button>
                            <button onClick={() => navigate('/my-analytics')} className="w-full flex items-center justify-between p-3.5 rounded-xl bg-surface-hover hover:bg-surface border border-border text-text-main transition-all group hover-lift shadow-sm">
                                <span className="font-semibold tracking-wide text-sm">View Analytics</span>
                                <ArrowUpRight className="w-4 h-4 text-text-muted group-hover:text-accent-cyan transition-colors" />
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Org Summary */}
            {!loading && stats && (
                <Card variant="default" className="mb-6">
                    <CardHeader><CardTitle>Organisation Summary</CardTitle></CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div className="flex items-start justify-between p-5 bg-accent-cyan/5 border border-accent-cyan/20 rounded-2xl shadow-sm">
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-accent-cyan font-bold mb-1">Total Documents</p>
                                    <p className="text-3xl font-bold text-text-main">{stats.total_tenant_documents.toLocaleString()}</p>
                                    <p className="text-xs font-semibold text-text-muted mt-2">{stats.documents_count.toLocaleString()} accessible to you</p>
                                </div>
                                <Badge variant="brand" size="sm">Live</Badge>
                            </div>
                            <div className="flex items-start justify-between p-5 bg-accent-green/5 border border-accent-green/20 rounded-2xl shadow-sm">
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-accent-green font-bold mb-1">Team Members</p>
                                    <p className="text-3xl font-bold text-text-main">{stats.users_count.toLocaleString()}</p>
                                    <p className="text-xs font-semibold text-text-muted mt-2">active accounts</p>
                                </div>
                                <Badge variant="success" size="sm">Live</Badge>
                            </div>
                            <div className="flex items-start justify-between p-5 bg-accent-orange/5 border border-accent-orange/20 rounded-2xl shadow-sm">
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-accent-orange font-bold mb-1">Storage Used</p>
                                    <p className="text-3xl font-bold text-text-main">{formatBytes(stats.storage_used_bytes)}</p>
                                    <p className="text-xs font-semibold text-text-muted mt-2">across all documents</p>
                                </div>
                                <Badge variant="warning" size="sm">Live</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
