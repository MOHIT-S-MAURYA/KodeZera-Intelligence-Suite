import React, { useEffect, useState, useCallback } from 'react';
import { FileSearch, Filter, ChevronDown, Download, Shield, Eye, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useUIStore } from '../../store/ui.store';
import { platformAuditService } from '../../services/audit.service';
import type { AuditEventEntry, AuditEventDetail, SecurityAlertEntry } from '../../services/audit.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
    create: 'success', update: 'warning', delete: 'error',
    login: 'success', logout: 'default', read: 'default',
    upload: 'info', download: 'default', query: 'default',
    grant_access: 'success', revoke_access: 'error',
    config_change: 'warning', export: 'info',
};

const OUTCOME_COLORS: Record<string, 'success' | 'error' | 'warning'> = {
    success: 'success', failure: 'error', denied: 'warning',
};

const SEVERITY_COLORS: Record<string, 'info' | 'warning' | 'error'> = {
    low: 'info', medium: 'warning', high: 'error', critical: 'error',
};

function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

// ── Event Detail Modal ──────────────────────────────────────────────────────

const EventDetailModal: React.FC<{ event: AuditEventDetail; onClose: () => void }> = ({ event, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">Audit Event Detail</h2>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-gray-500">Scope:</span> <Badge variant="default">{event.scope}</Badge></div>
                    <div><span className="text-gray-500">Action:</span> <Badge variant={(ACTION_COLORS[event.action] ?? 'default') as any}>{event.action}</Badge></div>
                    <div><span className="text-gray-500">Outcome:</span> <Badge variant={OUTCOME_COLORS[event.outcome] ?? 'default'}>{event.outcome}</Badge></div>
                    <div><span className="text-gray-500">User:</span> {event.user_name} {event.user_email && <span className="text-gray-400">({event.user_email})</span>}</div>
                    <div><span className="text-gray-500">Tenant:</span> {event.tenant_name ?? '—'}</div>
                    <div><span className="text-gray-500">Resource:</span> {event.resource_type} {event.resource_id && <span className="text-gray-400 font-mono">#{event.resource_id.slice(0, 8)}</span>}</div>
                    <div><span className="text-gray-500">Endpoint:</span> <span className="font-mono text-xs">{event.http_method} {event.endpoint}</span></div>
                    <div><span className="text-gray-500">IP:</span> <span className="font-mono">{event.ip_address ?? '—'}</span></div>
                    <div><span className="text-gray-500">Request ID:</span> <span className="font-mono text-xs">{event.request_id || '—'}</span></div>
                    <div><span className="text-gray-500">Timestamp:</span> {formatTimestamp(event.timestamp)}</div>
                </div>
                {event.error_message && (
                    <div>
                        <span className="text-gray-500 font-medium">Error:</span>
                        <p className="mt-1 text-red-700 bg-red-50 rounded p-2 text-xs">{event.error_message}</p>
                    </div>
                )}
                {Object.keys(event.changes || {}).length > 0 && (
                    <div>
                        <span className="text-gray-500 font-medium">Changes:</span>
                        <div className="mt-1 bg-gray-50 rounded p-2 space-y-1">
                            {Object.entries(event.changes).map(([field, diff]) => (
                                <div key={field} className="flex items-start gap-2 text-xs">
                                    <span className="font-medium text-gray-700 min-w-[100px]">{field}:</span>
                                    <span className="text-red-600 line-through">{diff.old ?? '—'}</span>
                                    <span className="text-gray-400">&rarr;</span>
                                    <span className="text-green-600">{diff.new ?? '—'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {Object.keys(event.metadata || {}).length > 0 && (
                    <div>
                        <span className="text-gray-500 font-medium">Metadata:</span>
                        <pre className="mt-1 bg-gray-50 rounded p-2 text-xs overflow-x-auto">{JSON.stringify(event.metadata, null, 2)}</pre>
                    </div>
                )}
                <div className="pt-2 border-t">
                    <span className="text-gray-500 font-medium">Integrity:</span>
                    <div className="mt-1 font-mono text-xs text-gray-500 break-all space-y-1">
                        <div>Hash: {event.event_hash}</div>
                        <div>Previous: {event.previous_hash}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

// ── Main Component ──────────────────────────────────────────────────────────

export const PlatformAuditLogs: React.FC = () => {
    const { addToast } = useUIStore();

    // Events state
    const [events, setEvents] = useState<AuditEventEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [selectedEvent, setSelectedEvent] = useState<AuditEventDetail | null>(null);

    // Alerts state
    const [alerts, setAlerts] = useState<SecurityAlertEntry[]>([]);
    const [alertsTotal, setAlertsTotal] = useState(0);
    const [alertsLoading, setAlertsLoading] = useState(false);

    // Chain verification
    const [chainResult, setChainResult] = useState<{ valid: boolean; checked: number; first_break_id: string | null } | null>(null);
    const [verifying, setVerifying] = useState(false);

    // UI
    const [activeTab, setActiveTab] = useState<'events' | 'alerts'>('events');
    const [showFilters, setShowFilters] = useState(false);
    const [limit] = useState(50);
    const [offset, setOffset] = useState(0);

    // Filters
    const [filters, setFilters] = useState({
        search: '',
        action: '',
        outcome: '',
        scope: '',
        startDate: '',
        endDate: '',
    });

    // ── Load events ─────────────────────────────────────────────────────────

    const loadEvents = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await platformAuditService.getEvents({
                action: filters.action || undefined,
                outcome: filters.outcome || undefined,
                scope: filters.scope || undefined,
                date_from: filters.startDate || undefined,
                date_to: filters.endDate || undefined,
                search: filters.search || undefined,
                limit,
                offset,
            });
            setEvents(resp.results);
            setTotal(resp.count);
        } catch {
            addToast('error', 'Failed to load audit events.');
        } finally {
            setLoading(false);
        }
    }, [filters, limit, offset]);

    useEffect(() => {
        const timer = setTimeout(loadEvents, 300);
        return () => clearTimeout(timer);
    }, [loadEvents]);

    // ── Load alerts ─────────────────────────────────────────────────────────

    const loadAlerts = useCallback(async () => {
        setAlertsLoading(true);
        try {
            const resp = await platformAuditService.getSecurityAlerts({ limit: 50 });
            setAlerts(resp.results);
            setAlertsTotal(resp.count);
        } catch { /* ignore */ }
        finally { setAlertsLoading(false); }
    }, []);

    useEffect(() => { if (activeTab === 'alerts') loadAlerts(); }, [activeTab, loadAlerts]);

    // ── Event detail ────────────────────────────────────────────────────────

    const openDetail = async (eventId: string) => {
        try {
            const detail = await platformAuditService.getEventDetail(eventId);
            setSelectedEvent(detail);
        } catch { /* ignore */ }
    };

    // ── Export ──────────────────────────────────────────────────────────────

    const handleExport = async () => {
        try {
            const blob = await platformAuditService.exportEvents('csv', filters.scope || undefined, filters.startDate || undefined, filters.endDate || undefined);
            const url = URL.createObjectURL(blob as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'platform_audit_events.csv';
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            addToast('error', 'Failed to export audit events.');
        }
    };

    // ── Verify chain ────────────────────────────────────────────────────────

    const handleVerifyChain = async () => {
        setVerifying(true);
        try {
            const result = await platformAuditService.verifyChain(1000, 0);
            setChainResult(result);
        } catch {
            addToast('error', 'Failed to verify hash chain.');
        } finally {
            setVerifying(false);
        }
    };

    // Pagination
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return (
        <div className="space-y-6">
            {selectedEvent && <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Platform Audit Logs</h1>
                    <p className="text-gray-600 mt-1">Cross-tenant audit events, security alerts &amp; integrity verification</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
                        Export CSV
                    </Button>
                    <Button variant="outline" size="sm" icon={<CheckCircle className="w-4 h-4" />} onClick={handleVerifyChain}
                        disabled={verifying}>
                        {verifying ? 'Verifying...' : 'Verify Chain'}
                    </Button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${showFilters ? 'bg-brand-50 border-brand-200 text-brand-700' : 'border-gray-300 hover:bg-gray-50'}`}
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                    </button>
                </div>
            </div>

            {/* Chain verification result */}
            {chainResult && (
                <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${chainResult.valid ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                    {chainResult.valid
                        ? <><CheckCircle className="w-5 h-5" /> Hash chain verified: {chainResult.checked} events checked, no tampering detected.</>
                        : <><AlertTriangle className="w-5 h-5" /> Chain broken at event {chainResult.first_break_id} after checking {chainResult.checked} events.</>
                    }
                    <button className="ml-auto text-xs underline" onClick={() => setChainResult(null)}>Dismiss</button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'events' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-800'}`}
                    onClick={() => setActiveTab('events')}
                >
                    Audit Events {total > 0 && <span className="text-gray-400 ml-1">({total})</span>}
                </button>
                <button
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${activeTab === 'alerts' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-800'}`}
                    onClick={() => setActiveTab('alerts')}
                >
                    <Shield className="w-4 h-4" />
                    Security Alerts {alertsTotal > 0 && <span className="text-red-500 ml-1">({alertsTotal})</span>}
                </button>
            </div>

            {/* Filters */}
            {showFilters && (
                <Card className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                            <input type="text" placeholder="Search..." value={filters.search}
                                onChange={(e) => { setFilters(prev => ({ ...prev, search: e.target.value })); setOffset(0); }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                            <select value={filters.action}
                                onChange={(e) => { setFilters(prev => ({ ...prev, action: e.target.value })); setOffset(0); }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm">
                                <option value="">All Actions</option>
                                {['create', 'update', 'delete', 'read', 'login', 'logout', 'upload', 'download', 'config_change', 'export'].map(a => (
                                    <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Outcome</label>
                            <select value={filters.outcome}
                                onChange={(e) => { setFilters(prev => ({ ...prev, outcome: e.target.value })); setOffset(0); }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm">
                                <option value="">All</option>
                                <option value="success">Success</option>
                                <option value="failure">Failure</option>
                                <option value="denied">Denied</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                            <select value={filters.scope}
                                onChange={(e) => { setFilters(prev => ({ ...prev, scope: e.target.value })); setOffset(0); }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm">
                                <option value="">All</option>
                                <option value="tenant">Tenant</option>
                                <option value="platform">Platform</option>
                                <option value="system">System</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <input type="date" value={filters.startDate}
                                onChange={(e) => { setFilters(prev => ({ ...prev, startDate: e.target.value })); setOffset(0); }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                            <input type="date" value={filters.endDate}
                                onChange={(e) => { setFilters(prev => ({ ...prev, endDate: e.target.value })); setOffset(0); }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
                        </div>
                    </div>
                </Card>
            )}

            {/* ── Events Tab ─────────────────────────────────────────────── */}
            {activeTab === 'events' && (
                <Card>
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto" />
                            <p className="text-gray-600 mt-4">Loading audit events...</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-200">
                                            <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                                            <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">User</th>
                                            <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Action</th>
                                            <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Resource</th>
                                            <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Outcome</th>
                                            <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Tenant</th>
                                            <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">IP</th>
                                            <th className="py-3 px-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {events.length === 0 ? (
                                            <tr><td colSpan={8} className="py-12 text-center text-gray-400">No audit events found.</td></tr>
                                        ) : events.map(evt => (
                                            <tr key={evt.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                                                onClick={() => openDetail(evt.id)}>
                                                <td className="py-3 px-3 text-sm font-mono text-gray-600 whitespace-nowrap">
                                                    {formatTimestamp(evt.timestamp)}
                                                </td>
                                                <td className="py-3 px-3">
                                                    <div className="text-sm text-gray-900">{evt.user_name}</div>
                                                    {evt.user_email && <div className="text-xs text-gray-500">{evt.user_email}</div>}
                                                </td>
                                                <td className="py-3 px-3">
                                                    <Badge variant={(ACTION_COLORS[evt.action] ?? 'default') as any}>
                                                        {evt.action.replace(/_/g, ' ')}
                                                    </Badge>
                                                </td>
                                                <td className="py-3 px-3 text-sm text-gray-700">
                                                    {evt.resource_type}
                                                    {evt.resource_id && <span className="text-xs text-gray-400 ml-1 font-mono">#{evt.resource_id.slice(0, 8)}</span>}
                                                </td>
                                                <td className="py-3 px-3">
                                                    <Badge variant={OUTCOME_COLORS[evt.outcome] ?? 'default'}>{evt.outcome}</Badge>
                                                </td>
                                                <td className="py-3 px-3 text-sm text-gray-600">{evt.tenant_name ?? '—'}</td>
                                                <td className="py-3 px-3 text-sm text-gray-500 font-mono">{evt.ip_address ?? '—'}</td>
                                                <td className="py-3 px-3"><Eye className="w-4 h-4 text-gray-400" /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {total > limit && (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                    <span className="text-sm text-gray-500">
                                        Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
                                    </span>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" disabled={offset === 0}
                                            onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
                                        <Button variant="outline" size="sm" disabled={currentPage >= totalPages}
                                            onClick={() => setOffset(offset + limit)}>Next</Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </Card>
            )}

            {/* ── Alerts Tab ─────────────────────────────────────────────── */}
            {activeTab === 'alerts' && (
                <Card>
                    {alertsLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600 mx-auto" />
                            <p className="text-gray-500 mt-3">Loading alerts...</p>
                        </div>
                    ) : alerts.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            No security alerts found.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {alerts.map(alert => (
                                <div key={alert.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant={SEVERITY_COLORS[alert.severity] ?? 'default'}>{alert.severity}</Badge>
                                                <span className="font-medium text-gray-900">{alert.title}</span>
                                                <Badge variant={alert.status === 'open' ? 'error' : alert.status === 'resolved' ? 'success' : 'default'}>{alert.status}</Badge>
                                                {alert.tenant_name && <span className="text-xs text-gray-500">({alert.tenant_name})</span>}
                                            </div>
                                            <p className="text-sm text-gray-600">{alert.description}</p>
                                            <span className="text-xs text-gray-400">{formatTimestamp(alert.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};
