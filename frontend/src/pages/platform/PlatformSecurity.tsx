import React, { useEffect, useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, Activity, Clock, Server } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import platformOwnerService, { ComponentHealth } from '../../services/platformOwner.service';

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    healthy: 'success',
    warning: 'warning',
    error: 'error',
};

const COMPONENT_LABELS: Record<string, string> = {
    database: 'Database',
    redis: 'Redis Cache',
    qdrant: 'Vector DB (Qdrant)',
    celery: 'Celery Workers',
    api_server: 'API Server',
};

export const PlatformSecurity: React.FC = () => {
    const [components, setComponents] = useState<Record<string, ComponentHealth>>({});
    const [loading, setLoading] = useState(true);
    const [hours, setHours] = useState(24);
    const [error, setError] = useState('');

    const fetchHealth = async () => {
        setLoading(true);
        try {
            const data = await platformOwnerService.getHealthHistory({ hours });
            setComponents(data.components);
        } catch {
            setError('Failed to load health data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchHealth(); }, [hours]);

    const allHealthy = Object.values(components).every(c => c.latest?.status === 'healthy');
    const warningCount = Object.values(components).filter(c => c.latest?.status === 'warning').length;
    const errorCount = Object.values(components).filter(c => c.latest?.status === 'error').length;
    const avgUptime = Object.values(components).length > 0
        ? Object.values(components).reduce((sum, c) => sum + c.uptime_percentage, 0) / Object.values(components).length
        : 0;

    if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Security & Health Monitoring</h1>
                    <p className="text-gray-600 mt-1">System health, uptime monitoring, and security status</p>
                </div>
                <select
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={hours}
                    onChange={e => setHours(Number(e.target.value))}
                >
                    <option value={1}>Last 1 hour</option>
                    <option value={6}>Last 6 hours</option>
                    <option value={24}>Last 24 hours</option>
                    <option value={72}>Last 3 days</option>
                    <option value={168}>Last 7 days</option>
                </select>
            </div>

            {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

            {/* Status Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${allHealthy ? 'bg-green-100' : 'bg-red-100'}`}>
                            {allHealthy ? <CheckCircle className="w-6 h-6 text-green-600" /> : <AlertTriangle className="w-6 h-6 text-red-600" />}
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Overall Status</p>
                            <p className="text-xl font-bold text-gray-900">{allHealthy ? 'All Healthy' : 'Issues Detected'}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Activity className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Avg Uptime ({hours}h)</p>
                            <p className="text-2xl font-bold text-gray-900">{avgUptime.toFixed(1)}%</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Warnings</p>
                            <p className="text-2xl font-bold text-gray-900">{warningCount}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                            <ShieldAlert className="w-6 h-6 text-red-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Errors</p>
                            <p className="text-2xl font-bold text-gray-900">{errorCount}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Component Details */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Component Health</h2>
                <div className="space-y-3">
                    {Object.entries(components).map(([key, comp]) => (
                        <div key={key} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                            <div className="flex items-center gap-4">
                                <Server className="w-5 h-5 text-gray-400" />
                                <div>
                                    <h3 className="font-medium text-gray-900">{COMPONENT_LABELS[key] || key}</h3>
                                    {comp.latest && (
                                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                            <Clock className="w-3 h-3" />
                                            Last checked: {new Date(comp.latest.checked_at).toLocaleString()}
                                            {comp.latest.latency_ms != null && ` (${comp.latest.latency_ms.toFixed(0)}ms)`}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-gray-600">{comp.uptime_percentage.toFixed(1)}% uptime</span>
                                <Badge variant={comp.latest ? (STATUS_COLORS[comp.latest.status] || 'default') : 'default'}>
                                    {comp.latest?.status || 'unknown'}
                                </Badge>
                            </div>
                        </div>
                    ))}
                    {Object.keys(components).length === 0 && (
                        <div className="text-center py-12">
                            <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600">No health check data available yet. Checks run every 60 seconds.</p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Security Info */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Security Policies</h2>
                <div className="space-y-3">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start gap-3">
                            <ShieldAlert className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                                <h3 className="font-medium text-gray-900">Quota Enforcement</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    Automatic quota enforcement is active. Tenants exceeding plan limits receive 429 responses.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                            <div>
                                <h3 className="font-medium text-gray-900">Tenant Isolation</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    All tenant data is isolated via middleware enforcement. Cross-tenant data access is prevented.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="flex items-start gap-3">
                            <Activity className="w-5 h-5 text-purple-600 mt-0.5" />
                            <div>
                                <h3 className="font-medium text-gray-900">Real-time Metering</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    Redis-based atomic counters track queries, tokens, and storage in real-time. Counters flush to DB every 5 minutes.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};
