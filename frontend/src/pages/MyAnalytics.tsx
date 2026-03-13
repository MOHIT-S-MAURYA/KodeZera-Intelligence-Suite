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
    }, [days]);

    const summary = data?.summary;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">My Analytics</h1>
                    <p className="text-gray-600 mt-1">Track your query performance and usage trends.</p>
                </div>
                <div className="flex items-center gap-2">
                    {[7, 30, 90].map((v) => (
                        <button
                            key={v}
                            onClick={() => setDays(v as 7 | 30 | 90)}
                            className={`px-3 py-1.5 rounded-md text-sm border ${days === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200'}`}
                        >
                            {v}d
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-sky-700" /></div>
                        <div>
                            <p className="text-xs text-gray-600">Total Queries</p>
                            <p className="text-xl font-bold">{summary?.total_queries?.toLocaleString() || 0}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-700" /></div>
                        <div>
                            <p className="text-xs text-gray-600">Success Rate</p>
                            <p className="text-xl font-bold">{summary?.success_rate?.toFixed(1) || '0.0'}%</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><Clock3 className="w-5 h-5 text-amber-700" /></div>
                        <div>
                            <p className="text-xs text-gray-600">Avg Latency</p>
                            <p className="text-xl font-bold">{summary?.avg_latency_ms?.toFixed(0) || 0}ms</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center"><Sigma className="w-5 h-5 text-violet-700" /></div>
                        <div>
                            <p className="text-xs text-gray-600">Total Tokens</p>
                            <p className="text-xl font-bold">{summary?.total_tokens?.toLocaleString() || 0}</p>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>My Query Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[320px]">
                            <Recharts.ResponsiveContainer width="100%" height="100%">
                                <Recharts.AreaChart data={data?.series || []}>
                                    <defs>
                                        <linearGradient id="myQueries" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0284c7" stopOpacity={0.22} />
                                            <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <Recharts.XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                                    <Recharts.YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                                    <Recharts.Tooltip />
                                    <Recharts.Area type="monotone" dataKey="queries" stroke="#0284c7" fill="url(#myQueries)" strokeWidth={2} />
                                    <Recharts.Line type="monotone" dataKey="failed" stroke="#dc2626" strokeWidth={2} dot={false} />
                                </Recharts.AreaChart>
                            </Recharts.ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Top Sessions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {(data?.top_sessions || []).length === 0 && (
                                <p className="text-sm text-gray-500">No sessions yet.</p>
                            )}
                            {(data?.top_sessions || []).map((s) => (
                                <div key={s.id} className="p-3 rounded-lg border border-gray-100 bg-gray-50">
                                    <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                                    <p className="text-xs text-gray-600 mt-1">{s.query_count} queries</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {loading && <p className="text-sm text-gray-500">Loading analytics...</p>}
        </div>
    );
};
