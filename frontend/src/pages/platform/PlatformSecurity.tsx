import React, { useEffect, useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, Activity, Clock, Server } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import platformOwnerService from '../../services/platformOwner.service';
import type { ComponentHealth } from '../../services/platformOwner.service';

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
                    <h1 className="text-3xl font-bold text-text-main">Security & Health Monitoring</h1>
                    <p className="text-text-muted mt-1">System health, uptime monitoring, and security status</p>
                </div>
                <select
                    className="border border-border bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-accent-cyan rounded-lg px-3 py-2 text-sm"
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

            {error && <div className="p-3 bg-red-500/10 text-red-500 rounded-lg text-sm">{error}</div>}

            {/* Status Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${allHealthy ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                            {allHealthy ? <CheckCircle className="w-6 h-6 text-green-500" /> : <AlertTriangle className="w-6 h-6 text-red-500" />}
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Overall Status</p>
                            <p className="text-xl font-bold text-text-main">{allHealthy ? 'All Healthy' : 'Issues Detected'}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-brand/10 flex items-center justify-center">
                            <Activity className="w-6 h-6 text-brand" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Avg Uptime ({hours}h)</p>
                            <p className="text-2xl font-bold text-text-main">{avgUptime.toFixed(1)}%</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-amber-500" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Warnings</p>
                            <p className="text-2xl font-bold text-text-main">{warningCount}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <ShieldAlert className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Errors</p>
                            <p className="text-2xl font-bold text-text-main">{errorCount}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Component Details */}
            <Card>
                <h2 className="text-xl font-semibold text-text-main mb-4">Component Health</h2>
                <div className="space-y-3">
                    {Object.entries(components).map(([key, comp]) => (
                        <div key={key} className="flex items-center justify-between p-4 border border-border rounded-lg">
                            <div className="flex items-center gap-4">
                                <Server className="w-5 h-5 text-text-muted opacity-50" />
                                <div>
                                    <h3 className="font-medium text-text-main">{COMPONENT_LABELS[key] || key}</h3>
                                    {comp.latest && (
                                        <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                                            <Clock className="w-3 h-3" />
                                            Last checked: {new Date(comp.latest.checked_at).toLocaleString()}
                                            {comp.latest.latency_ms != null && ` (${comp.latest.latency_ms.toFixed(0)}ms)`}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-text-muted">{comp.uptime_percentage.toFixed(1)}% uptime</span>
                                <Badge variant={comp.latest ? (STATUS_COLORS[comp.latest.status] || 'default') : 'default'}>
                                    {comp.latest?.status || 'unknown'}
                                </Badge>
                            </div>
                        </div>
                    ))}
                    {Object.keys(components).length === 0 && (
                        <div className="text-center py-12">
                            <Activity className="w-12 h-12 text-text-muted opacity-50 mx-auto mb-4" />
                            <p className="text-text-muted">No health check data available yet. Checks run every 60 seconds.</p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Security Info */}
            <Card>
                <h2 className="text-xl font-semibold text-text-main mb-4">Security Policies</h2>
                <div className="space-y-3">
                    <div className="p-4 bg-brand/10 border border-brand/20 rounded-lg">
                        <div className="flex items-start gap-3">
                            <ShieldAlert className="w-5 h-5 text-brand mt-0.5" />
                            <div>
                                <h3 className="font-medium text-text-main">Quota Enforcement</h3>
                                <p className="text-sm text-text-muted mt-1">
                                    Automatic quota enforcement is active. Tenants exceeding plan limits receive 429 responses.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <div className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                            <div>
                                <h3 className="font-medium text-text-main">Tenant Isolation</h3>
                                <p className="text-sm text-text-muted mt-1">
                                    All tenant data is isolated via middleware enforcement. Cross-tenant data access is prevented.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <div className="flex items-start gap-3">
                            <Activity className="w-5 h-5 text-purple-500 mt-0.5" />
                            <div>
                                <h3 className="font-medium text-text-main">Real-time Metering</h3>
                                <p className="text-sm text-text-muted mt-1">
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
