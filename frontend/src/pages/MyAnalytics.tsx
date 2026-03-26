import React, { useEffect, useState } from 'react';
import * as Recharts from 'recharts';
import { BarChart3, Clock3, CheckCircle2, Sigma } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { analyticsService, type MyAnalyticsResponse } from '../services/analytics.service';
import { useUIStore } from '../store/ui.store';

export const MyAnalytics: React.FC = () => {
    const { addToast } = useUIStore();
    const [days, setDays] = useState<7 | 30 | 90>(30);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<MyAnalyticsResponse | null>(null);

    useEffect(() => {
        const run = async () => {
            setLoading(true);
            try {
                const resp = await analyticsService.getMyAnalytics(days);
                setData(resp);
            } catch {
                addToast('error', 'Failed to load personal analytics');
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [days, addToast]);

    const summary = data?.summary;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-text-main">My Analytics</h1>
                    <p className="text-text-muted mt-1">Track your query performance and usage trends.</p>
                </div>
                <div className="flex items-center gap-2">
                    {[7, 30, 90].map((v) => (
                        <button
                            key={v}
                            onClick={() => setDays(v as 7 | 30 | 90)}
                            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${days === v ? 'bg-accent-cyan text-white border-accent-cyan' : 'bg-surface text-text-muted border-border hover:bg-surface-hover hover:text-text-main'}`}
                        >
                            {v}d
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card variant="default">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center shadow-sm"><BarChart3 className="w-5 h-5 text-accent-blue" /></div>
                        <div>
                            <p className="text-xs text-text-muted">Total Queries</p>
                            <p className="text-xl font-bold text-text-main">{summary?.total_queries?.toLocaleString() || 0}</p>
                        </div>
                    </div>
                </Card>
                <Card variant="default">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent-green/10 border border-accent-green/20 flex items-center justify-center shadow-sm"><CheckCircle2 className="w-5 h-5 text-accent-green" /></div>
                        <div>
                            <p className="text-xs text-text-muted">Success Rate</p>
                            <p className="text-xl font-bold text-text-main">{summary?.success_rate?.toFixed(1) || '0.0'}%</p>
                        </div>
                    </div>
                </Card>
                <Card variant="default">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent-orange/10 border border-accent-orange/20 flex items-center justify-center shadow-sm"><Clock3 className="w-5 h-5 text-accent-orange" /></div>
                        <div>
                            <p className="text-xs text-text-muted">Avg Latency</p>
                            <p className="text-xl font-bold text-text-main">{summary?.avg_latency_ms?.toFixed(0) || 0}ms</p>
                        </div>
                    </div>
                </Card>
                <Card variant="default">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center shadow-sm"><Sigma className="w-5 h-5 text-accent-purple" /></div>
                        <div>
                            <p className="text-xs text-text-muted">Total Tokens</p>
                            <p className="text-xl font-bold text-text-main">{summary?.total_tokens?.toLocaleString() || 0}</p>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card variant="default" className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>My Query Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[320px]">
                            <Recharts.ResponsiveContainer width="100%" height="100%">
                                <Recharts.AreaChart data={data?.series || []}>
                                    <defs>
                                        <linearGradient id="myQueries" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.22} />
                                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                    <Recharts.XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                                    <Recharts.YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                                    <Recharts.Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', color: 'var(--text-main)', borderRadius: '12px' }} />
                                    <Recharts.Area type="monotone" dataKey="queries" stroke="#06b6d4" fill="url(#myQueries)" strokeWidth={2} />
                                    <Recharts.Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} />
                                </Recharts.AreaChart>
                            </Recharts.ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card variant="default">
                    <CardHeader>
                        <CardTitle>Top Sessions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3 pt-2">
                            {(data?.top_sessions || []).length === 0 && (
                                <p className="text-sm text-text-muted">No sessions yet.</p>
                            )}
                            {(data?.top_sessions || []).map((s) => (
                                <div key={s.id} className="p-3 rounded-xl border border-border bg-background-secondary">
                                    <p className="text-sm font-semibold text-text-main truncate">{s.title}</p>
                                    <p className="text-xs text-text-muted mt-1">{s.query_count} queries</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {loading && <p className="text-sm text-text-muted animate-pulse">Loading analytics...</p>}
        </div>
    );
};
