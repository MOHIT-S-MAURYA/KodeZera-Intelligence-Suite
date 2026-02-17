import React, { useState } from 'react';
import * as Recharts from 'recharts';
import { BarChart3, Users, Clock, Database } from 'lucide-react';
import { Card } from '../../components/ui/Card';

// Mock Data Generators
const generateDateLabels = (days: number) => {
    return Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
};

const generateData = (days: number) => {
    const labels = generateDateLabels(days);
    return labels.map(label => ({
        date: label,
        queries: Math.floor(Math.random() * 5000) + 1000,
        failed: Math.floor(Math.random() * 50),
        tokens: Math.floor(Math.random() * 1000000) + 500000,
        latency: Math.floor(Math.random() * 200) + 50,
        users: Math.floor(Math.random() * 100) + 20,
    }));
};

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
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const data = generateData(days);

    // Calculate totals for summary cards
    const totalQueries = data.reduce((acc, curr) => acc + curr.queries, 0);
    const avgLatency = Math.round(data.reduce((acc, curr) => acc + curr.latency, 0) / days);
    const activeUsers = data[data.length - 1].users; // Last day's active users
    const totalTokens = data.reduce((acc, curr) => acc + curr.tokens, 0);

    return (
        <div className="space-y-6">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Usage Analytics</h1>
                    <p className="text-gray-600 mt-1">Platform-wide usage metrics and trends</p>
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
                </div>
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
