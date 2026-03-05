import React, { useState, useEffect } from 'react';
import * as Recharts from 'recharts';
import { BarChart3, Users, Clock, Database } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import platformOwnerService, { type AnalyticsDataPoint, type TenantListItem } from '../../services/platformOwner.service';
import { useUIStore } from '../../store/ui.store';



interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
                <p className="font-semibold text-gray-900 mb-1">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-gray-600 capitalize">
                            {entry.name}:
                        </span>
                        <span className="font-medium text-gray-900">
                            {entry.name === 'tokens'
                                ? (entry.value as number).toLocaleString()
                                : entry.name === 'latency'
                                    ? `${entry.value}ms`
                                    : entry.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export const PlatformAnalytics: React.FC = () => {
    const { addToast } = useUIStore();
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'custom'>('7d');
    const [selectedTenant, setSelectedTenant] = useState<string>('all');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [data, setData] = useState<AnalyticsDataPoint[]>([]);
    const [tenants, setTenants] = useState<TenantListItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch Tenants
    useEffect(() => {
        const fetchTenants = async () => {
            try {
                const response = await platformOwnerService.getTenants();
                setTenants(response.tenants);
            } catch (error) {
                addToast('error', 'Failed to load tenants.');
            }
        };
        fetchTenants();
    }, []);

    // Fetch Analytics
    useEffect(() => {
        const fetchAnalytics = async () => {
            setLoading(true);
            try {
                const filters: any = {
                    tenant_id: selectedTenant,
                };

                if (timeRange === 'custom') {
                    if (startDate && endDate) {
                        filters.start_date = startDate;
                        filters.end_date = endDate;
                    }
                } else {
                    filters.days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
                }

                // Initial load with custom range might be empty if dates not set
                if (timeRange === 'custom' && (!startDate || !endDate)) {
                    setLoading(false);
                    return;
                }

                const response = await platformOwnerService.getAnalytics(filters);
                setData(response);
            } catch (error) {
                addToast('error', 'Failed to load analytics data. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        // Debounce for custom dates
        const timer = setTimeout(() => {
            fetchAnalytics();
        }, 300);

        return () => clearTimeout(timer);
    }, [timeRange, selectedTenant, startDate, endDate]);


    // Calculate totals for summary cards
    const totalQueries = data.reduce((acc, curr) => acc + curr.queries, 0);
    const avgLatency = data.length > 0 ? Math.round(data.reduce((acc, curr) => acc + curr.latency, 0) / data.length) : 0;
    const activeUsers = data.length > 0 ? data[data.length - 1].users : 0; // Last day's active users
    const totalTokens = data.reduce((acc, curr) => acc + curr.tokens, 0);

    if (loading && data.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header & Controls */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Usage Analytics</h1>
                        <p className="text-gray-600 mt-1">Platform-wide usage metrics and trends</p>
                        {selectedTenant !== 'all' && (
                            <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-800">
                                Tenant ID: {selectedTenant}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Tenant Selector */}
                        <div className="w-64">
                            <SearchableSelect
                                options={[
                                    { label: 'All Tenants', value: 'all' },
                                    ...tenants.map(t => ({ label: t.name, value: t.id }))
                                ]}
                                value={selectedTenant}
                                onChange={(value) => setSelectedTenant(value)}
                                placeholder="Select Tenant..."
                            />
                        </div>

                        <div className="flex items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                            <button
                                onClick={() => setTimeRange('7d')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${timeRange === '7d'
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                7 Days
                            </button>
                            <button
                                onClick={() => setTimeRange('30d')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${timeRange === '30d'
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                30 Days
                            </button>
                            <button
                                onClick={() => setTimeRange('90d')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${timeRange === '90d'
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                90 Days
                            </button>
                            <button
                                onClick={() => setTimeRange('custom')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${timeRange === 'custom'
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                Custom
                            </button>
                        </div>
                    </div>
                </div>

                {/* Custom Date Range Inputs */}
                {timeRange === 'custom' && (
                    <div className="flex items-center gap-2 justify-end animate-in fade-in slide-in-from-top-1 duration-200">
                        <span className="text-sm text-gray-600">From:</span>
                        <input
                            type="date"
                            value={startDate}
                            max={endDate || new Date().toISOString().split('T')[0]} // Can't be after end date or today
                            onChange={(e) => setStartDate(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-brand-500 focus:border-brand-500"
                        />
                        <span className="text-sm text-gray-600">To:</span>
                        <input
                            type="date"
                            value={endDate}
                            min={startDate} // Can't be before start date
                            max={new Date().toISOString().split('T')[0]} // Can't be in the future
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-brand-500 focus:border-brand-500"
                        />
                    </div>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Total Queries</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {totalQueries.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                            <Clock className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Avg Latency</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {avgLatency}ms
                            </p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                            <Users className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Active Users</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {activeUsers.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                            <Database className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Tokens Used</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {(totalTokens / 1000000).toFixed(1)}M
                            </p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Query Volume Chart */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Inference Volume</h3>
                    <div className="h-[300px] w-full">
                        <Recharts.ResponsiveContainer width="100%" height="100%">
                            <Recharts.AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <Recharts.XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Recharts.YAxis
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}`}
                                />
                                <Recharts.Tooltip content={<CustomTooltip />} />
                                <Recharts.Area
                                    type="monotone"
                                    dataKey="queries"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorQueries)"
                                />
                            </Recharts.AreaChart>
                        </Recharts.ResponsiveContainer>
                    </div>
                </Card>

                {/* API Latency Chart */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">API Latency</h3>
                    <div className="h-[300px] w-full">
                        <Recharts.ResponsiveContainer width="100%" height="100%">
                            <Recharts.LineChart data={data}>
                                <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <Recharts.XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Recharts.YAxis
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}ms`}
                                />
                                <Recharts.Tooltip content={<CustomTooltip />} />
                                <Recharts.Line
                                    type="monotone"
                                    dataKey="latency"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </Recharts.LineChart>
                        </Recharts.ResponsiveContainer>
                    </div>
                </Card>

                {/* Active Users Chart */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Daily Active Users</h3>
                    <div className="h-[300px] w-full">
                        <Recharts.ResponsiveContainer width="100%" height="100%">
                            <Recharts.BarChart data={data}>
                                <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <Recharts.XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Recharts.YAxis
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Recharts.Tooltip content={<CustomTooltip />} />
                                <Recharts.Bar
                                    dataKey="users"
                                    fill="#8b5cf6"
                                    radius={[4, 4, 0, 0]}
                                />
                            </Recharts.BarChart>
                        </Recharts.ResponsiveContainer>
                    </div>
                </Card>

                {/* Token Usage Chart */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Token Consumption</h3>
                    <div className="h-[300px] w-full">
                        <Recharts.ResponsiveContainer width="100%" height="100%">
                            <Recharts.AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <Recharts.XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Recharts.YAxis
                                    tick={{ fontSize: 12, fill: '#6b7280' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${(value / 1000)}k`}
                                />
                                <Recharts.Tooltip content={<CustomTooltip />} />
                                <Recharts.Area
                                    type="monotone"
                                    dataKey="tokens"
                                    stroke="#f97316"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorTokens)"
                                />
                            </Recharts.AreaChart>
                        </Recharts.ResponsiveContainer>
                    </div>
                </Card>
            </div>
        </div>
    );
};
