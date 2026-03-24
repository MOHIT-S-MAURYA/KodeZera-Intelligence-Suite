import React, { useEffect, useMemo, useState } from 'react';
import * as Recharts from 'recharts';
import { BarChart3, Clock, Database, Users, Target, TrendingUp } from 'lucide-react';

import { Card } from '../../components/ui/Card';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import platformOwnerService from '../../services/platformOwner.service';
import { analyticsService, type PlatformAnalyticsResponse, type QualityAnalyticsResponse, type ForecastResponse } from '../../services/analytics.service';
import { useUIStore } from '../../store/ui.store';

type RangeType = '7d' | '30d' | '90d' | 'custom';
type ChartTab = 'queries' | 'latency' | 'users' | 'tokens' | 'quality' | 'forecast';

const tooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div className="bg-surface border border-border rounded-lg shadow-xl p-3">
            <p className="text-sm font-semibold text-text-main mb-2">{label}</p>
            {payload.map((entry: any, idx: number) => (
                <div key={idx} className="text-xs text-text-muted flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span>{entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
                </div>
            ))}
        </div>
    );
};

export const PlatformAnalytics: React.FC = () => {
    const { addToast } = useUIStore();

    const [range, setRange] = useState<RangeType>('30d');
    const [tab, setTab] = useState<ChartTab>('queries');
    const [selectedTenant, setSelectedTenant] = useState<string>('all');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
    const [analytics, setAnalytics] = useState<PlatformAnalyticsResponse | null>(null);
    const [quality, setQuality] = useState<QualityAnalyticsResponse | null>(null);
    const [forecast, setForecast] = useState<ForecastResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const loadTenants = async () => {
            try {
                const resp = await platformOwnerService.getTenants();
                setTenants(resp.tenants.map(t => ({ id: t.id, name: t.name })));
            } catch {
                addToast('error', 'Failed to load tenant list');
            }
        };
        loadTenants();
    }, []);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const params: { tenant_id?: string; days?: number; start_date?: string; end_date?: string } = {};
                if (selectedTenant !== 'all') params.tenant_id = selectedTenant;
                if (range === 'custom') {
                    if (!startDate || !endDate) {
                        setLoading(false);
                        return;
                    }
                    params.start_date = startDate;
                    params.end_date = endDate;
                } else {
                    params.days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
                }

                const [analyticsResp, qualityResp, forecastResp] = await Promise.all([
                    analyticsService.getPlatformAnalytics(params),
                    analyticsService.getPlatformQuality(selectedTenant, params.days || 30),
                    analyticsService.getPlatformForecast(params.days || 30),
                ]);

                setAnalytics(analyticsResp);
                setQuality(qualityResp);
                setForecast(forecastResp);
            } catch {
                addToast('error', 'Failed to load platform analytics');
            } finally {
                setLoading(false);
            }
        };

        const t = setTimeout(load, 200);
        return () => clearTimeout(t);
    }, [selectedTenant, range, startDate, endDate]);

    const series = analytics?.series || [];

    const chartEl = useMemo(() => {
        if (tab === 'queries') {
            return (
                <Recharts.AreaChart data={series}>
                    <defs>
                        <linearGradient id="q" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.16} />
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <Recharts.XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.Tooltip content={tooltip} />
                    <Recharts.Area type="monotone" dataKey="queries" name="Queries" stroke="#2563eb" fill="url(#q)" strokeWidth={2} />
                </Recharts.AreaChart>
            );
        }
        if (tab === 'latency') {
            return (
                <Recharts.LineChart data={series}>
                    <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <Recharts.XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.Tooltip content={tooltip} />
                    <Recharts.Line type="monotone" dataKey="latency" name="Latency (ms)" stroke="#16a34a" strokeWidth={2} dot={false} />
                </Recharts.LineChart>
            );
        }
        if (tab === 'users') {
            return (
                <Recharts.BarChart data={series}>
                    <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <Recharts.XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.Tooltip content={tooltip} />
                    <Recharts.Bar dataKey="users" name="Active Users" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </Recharts.BarChart>
            );
        }
        if (tab === 'tokens') {
            return (
                <Recharts.AreaChart data={series}>
                    <defs>
                        <linearGradient id="tok" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ea580c" stopOpacity={0.16} />
                            <stop offset="95%" stopColor="#ea580c" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <Recharts.XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.Tooltip content={tooltip} />
                    <Recharts.Area type="monotone" dataKey="tokens" name="Tokens" stroke="#ea580c" fill="url(#tok)" strokeWidth={2} />
                </Recharts.AreaChart>
            );
        }
        if (tab === 'quality') {
            const qualityRows = [
                { label: 'Success Rate', value: quality?.success_rate || 0 },
                { label: 'Satisfaction', value: quality?.satisfaction_rate || 0 },
            ];
            return (
                <Recharts.BarChart data={qualityRows}>
                    <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <Recharts.XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Recharts.Tooltip content={tooltip} />
                    <Recharts.Bar dataKey="value" name="%" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </Recharts.BarChart>
            );
        }
        return (
            <Recharts.LineChart data={forecast?.forecast || []}>
                <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                <Recharts.XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <Recharts.YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <Recharts.Tooltip content={tooltip} />
                <Recharts.Line type="monotone" dataKey="queries" name="Projected Queries" stroke="#be123c" strokeWidth={2} dot={false} />
            </Recharts.LineChart>
        );
    }, [tab, series, quality, forecast]);

    const summary = analytics?.summary;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-bold text-text-main">Platform Analytics</h1>
                        <p className="text-text-muted mt-1">Dashboard, quality, forecast, and tenant breakdown.</p>
                    </div>
                    <div className="w-full md:w-72">
                        <SearchableSelect
                            options={[{ label: 'All Tenants', value: 'all' }, ...tenants.map((t) => ({ label: t.name, value: t.id }))]}
                            value={selectedTenant}
                            onChange={(v) => setSelectedTenant(v)}
                            placeholder="Select tenant"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {(['7d', '30d', '90d', 'custom'] as RangeType[]).map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-3 py-1.5 rounded-md text-sm border ${range === r ? 'bg-brand text-white border-brand' : 'bg-surface text-text-main border-border hover:bg-surface-hover focus:ring-accent-cyan'}`}
                        >
                            {r === 'custom' ? 'Custom' : r.replace('d', ' days')}
                        </button>
                    ))}
                </div>

                {range === 'custom' && (
                    <div className="flex flex-wrap gap-2 items-center">
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border border-border rounded-md text-sm bg-surface text-text-main focus:ring-accent-cyan" />
                        <span className="text-sm text-text-muted">to</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border border-border rounded-md text-sm bg-surface text-text-main focus:ring-accent-cyan" />
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-blue-500" /></div><div><p className="text-xs text-text-muted">Total Queries</p><p className="text-xl font-bold text-text-main">{summary?.total_queries?.toLocaleString() || 0}</p></div></div></Card>
                <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center"><Target className="w-5 h-5 text-green-500" /></div><div><p className="text-xs text-text-muted">Success Rate</p><p className="text-xl font-bold text-text-main">{summary?.success_rate?.toFixed(1) || '0.0'}%</p></div></div></Card>
                <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-500" /></div><div><p className="text-xs text-text-muted">Avg Latency</p><p className="text-xl font-bold text-text-main">{summary?.avg_latency_ms?.toFixed(0) || 0}ms</p></div></div></Card>
                <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center"><Database className="w-5 h-5 text-orange-500" /></div><div><p className="text-xs text-text-muted">Tokens Used</p><p className="text-xl font-bold text-text-main">{summary?.total_tokens?.toLocaleString() || 0}</p></div></div></Card>
                <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center"><Users className="w-5 h-5 text-purple-500" /></div><div><p className="text-xs text-text-muted">Relevance</p><p className="text-xl font-bold text-text-main">{quality?.avg_relevance_score?.toFixed(2) || '0.00'}</p></div></div></Card>
            </div>

            <Card className="p-5">
                <div className="flex flex-wrap gap-2 mb-4">
                    {([
                        ['queries', 'Queries'],
                        ['latency', 'Latency'],
                        ['users', 'Users'],
                        ['tokens', 'Tokens'],
                        ['quality', 'Quality'],
                        ['forecast', 'Forecast'],
                    ] as Array<[ChartTab, string]>).map(([k, label]) => (
                        <button
                            key={k}
                            onClick={() => setTab(k)}
                            className={`px-3 py-1.5 text-sm rounded-md border ${tab === k ? 'bg-brand text-white border-brand' : 'bg-surface text-text-main border-border hover:bg-surface-hover focus:ring-accent-cyan'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="h-[360px] w-full">
                    <Recharts.ResponsiveContainer width="100%" height="100%">
                        {chartEl}
                    </Recharts.ResponsiveContainer>
                </div>
                {tab === 'forecast' && (
                    <p className="text-xs text-text-muted mt-3">Forecast uses moving average projection over the selected period.</p>
                )}
            </Card>

            <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-text-main">Tenant Breakdown</h3>
                    <TrendingUp className="w-5 h-5 text-text-muted" />
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-text-muted border-b border-border">
                                <th className="py-2 pr-4">Tenant</th>
                                <th className="py-2 pr-4">Queries</th>
                                <th className="py-2 pr-4">Users</th>
                                <th className="py-2 pr-4">Tokens</th>
                                <th className="py-2 pr-4">Storage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(analytics?.tenant_breakdown || []).map((row) => (
                                <tr key={row.tenant_id} className="border-b border-border hover:bg-surface-hover">
                                    <td className="py-2 pr-4 font-medium text-text-main">{row.tenant_name}</td>
                                    <td className="py-2 pr-4 text-text-main">{row.queries.toLocaleString()}</td>
                                    <td className="py-2 pr-4 text-text-main">{row.users.toLocaleString()}</td>
                                    <td className="py-2 pr-4 text-text-main">{row.tokens.toLocaleString()}</td>
                                    <td className="py-2 pr-4 text-text-main">{(row.storage_bytes / (1024 ** 3)).toFixed(2)} GB</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {(!analytics?.tenant_breakdown || analytics.tenant_breakdown.length === 0) && (
                        <p className="text-sm text-text-muted py-6">No tenant breakdown available for current filter.</p>
                    )}
                </div>
            </Card>

            {loading && <p className="text-sm text-text-muted">Loading analytics...</p>}
        </div>
    );
};
