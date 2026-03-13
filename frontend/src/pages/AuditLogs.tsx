import React, { useState, useEffect, useCallback } from 'react';
import { Search, Calendar, RefreshCw, ChevronDown, Download, Shield, X, Eye } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { auditEventService, AUDIT_ACTIONS } from '../services/audit.service';
import { getApiError } from '../utils/errors';
import type { AuditEventEntry, AuditEventDetail, AuditAction, SecurityAlertEntry } from '../services/audit.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTION_VARIANT: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
    login:           'success',
    logout:          'default',
    create:          'info',
    update:          'warning',
    delete:          'error',
    upload:          'info',
    download:        'default',
    query:           'default',
    grant_access:    'success',
    revoke_access:   'error',
    read:            'default',
    config_change:   'warning',
    export:          'info',
    mfa_event:       'info',
    password_change: 'warning',
    session_event:   'default',
};

const OUTCOME_VARIANT: Record<string, 'success' | 'error' | 'warning'> = {
    success: 'success',
    failure: 'error',
    denied:  'warning',
};

const SEVERITY_VARIANT: Record<string, 'success' | 'error' | 'warning' | 'info'> = {
    low:      'info',
    medium:   'warning',
    high:     'error',
    critical: 'error',
};

function formatTs(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

const SkeletonRow: React.FC = () => (
    <tr className="border-b border-gray-100">
        {Array.from({ length: 6 }).map((_, i) => (
            <td key={i} className="py-3 px-4">
                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${60 + i * 8}%` }} />
            </td>
        ))}
    </tr>
);

// ── Event Detail Modal ────────────────────────────────────────────────────────

const EventDetailModal: React.FC<{ event: AuditEventDetail; onClose: () => void }> = ({ event, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">Event Detail</h2>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-gray-500">Action:</span> <Badge variant={ACTION_VARIANT[event.action] ?? 'default'}>{event.action}</Badge></div>
                    <div><span className="text-gray-500">Outcome:</span> <Badge variant={OUTCOME_VARIANT[event.outcome] ?? 'default'}>{event.outcome}</Badge></div>
                    <div><span className="text-gray-500">User:</span> {event.user_name} {event.user_email && <span className="text-gray-400">({event.user_email})</span>}</div>
                    <div><span className="text-gray-500">Resource:</span> {event.resource_type} {event.resource_id && <span className="text-gray-400 font-mono">#{event.resource_id.slice(0, 8)}</span>}</div>
                    <div><span className="text-gray-500">Endpoint:</span> <span className="font-mono text-xs">{event.http_method} {event.endpoint}</span></div>
                    <div><span className="text-gray-500">IP:</span> <span className="font-mono">{event.ip_address ?? '—'}</span></div>
                    <div><span className="text-gray-500">Request ID:</span> <span className="font-mono text-xs">{event.request_id || '—'}</span></div>
                    <div><span className="text-gray-500">Trigger:</span> {event.trigger}</div>
                    <div><span className="text-gray-500">Status Code:</span> {event.status_code ?? '—'}</div>
                    <div><span className="text-gray-500">Timestamp:</span> {formatTs(event.timestamp)}</div>
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

// ── Main component ────────────────────────────────────────────────────────────

export const AuditLogs: React.FC = () => {
    const [events, setEvents]     = useState<AuditEventEntry[]>([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);
    const [total, setTotal]       = useState(0);
    const [selectedEvent, setSelectedEvent] = useState<AuditEventDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'events' | 'alerts'>('events');

    // Alerts
    const [alerts, setAlerts] = useState<SecurityAlertEntry[]>([]);
    const [alertsTotal, setAlertsTotal] = useState(0);
    const [alertsLoading, setAlertsLoading] = useState(false);

    // Filters
    const [search, setSearch]         = useState('');
    const [action, setAction]         = useState<AuditAction | ''>('');
    const [outcome, setOutcome]       = useState('');
    const [dateFrom, setDateFrom]     = useState('');
    const [dateTo, setDateTo]         = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Pagination
    const [limit] = useState(50);
    const [offset, setOffset] = useState(0);

    // ── Load audit events ─────────────────────────────────────────────────────

    const loadEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await auditEventService.getEvents({
                action: action || undefined,
                outcome: outcome || undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
                search: search || undefined,
                limit,
                offset,
            });
            setEvents(resp.results);
            setTotal(resp.count);
        } catch (err) {
            setError(getApiError(err, 'Failed to load audit events.'));
        } finally {
            setLoading(false);
        }
    }, [action, outcome, dateFrom, dateTo, search, limit, offset]);

    useEffect(() => { loadEvents(); }, [loadEvents]);

    // ── Load security alerts ──────────────────────────────────────────────────

    const loadAlerts = useCallback(async () => {
        setAlertsLoading(true);
        try {
            const resp = await auditEventService.getSecurityAlerts({ limit: 50 });
            setAlerts(resp.results);
            setAlertsTotal(resp.count);
        } catch { /* ignore */ }
        finally { setAlertsLoading(false); }
    }, []);

    useEffect(() => { if (activeTab === 'alerts') loadAlerts(); }, [activeTab, loadAlerts]);

    // ── Event detail ──────────────────────────────────────────────────────────

    const openDetail = async (eventId: string) => {
        setDetailLoading(true);
        try {
            const detail = await auditEventService.getEventDetail(eventId);
            setSelectedEvent(detail);
        } catch { /* ignore */ }
        finally { setDetailLoading(false); }
    };

    // ── Export ────────────────────────────────────────────────────────────────

    const handleExport = async () => {
        try {
            const blob = await auditEventService.exportEvents('csv', dateFrom || undefined, dateTo || undefined);
            const url = URL.createObjectURL(blob as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'audit_events.csv';
            a.click();
            URL.revokeObjectURL(url);
        } catch { /* ignore */ }
    };

    // ── Resolve alert ─────────────────────────────────────────────────────────

    const resolveAlert = async (alertId: string, newStatus: string) => {
        try {
            await auditEventService.updateSecurityAlert(alertId, newStatus);
            loadAlerts();
        } catch { /* ignore */ }
    };

    // ── Pagination helpers ────────────────────────────────────────────────────

    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 animate-fade-in">
            {selectedEvent && <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Audit Logs</h1>
                    <p className="text-body-md text-gray-600">Track all system activities, changes, and security events</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="md" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
                        Export CSV
                    </Button>
                    <Button variant="ghost" size="md" icon={<RefreshCw className="w-4 h-4" />}
                        onClick={activeTab === 'events' ? loadEvents : loadAlerts} disabled={loading || alertsLoading}>
                        Refresh
                    </Button>
                </div>
            </div>

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

            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">
                    {error}
                    <button className="ml-3 underline" onClick={loadEvents}>Retry</button>
                </div>
            )}

            {/* ── Events Tab ─────────────────────────────────────────────── */}
            {activeTab === 'events' && (
                <Card>
                    {/* Search + filter bar */}
                    <div className="flex flex-col gap-3 mb-6">
                        <div className="flex gap-3 items-center">
                            <div className="flex-1">
                                <Input
                                    placeholder="Search by user, action or resource..."
                                    leftIcon={<Search className="w-5 h-5" />}
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
                                />
                            </div>
                            <Button
                                variant="ghost" size="md"
                                icon={<ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />}
                                onClick={() => setShowFilters(v => !v)}
                            >
                                Filters {(action || outcome || dateFrom || dateTo) ? '●' : ''}
                            </Button>
                        </div>

                        {showFilters && (
                            <div className="flex flex-wrap gap-3 pt-1">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-600 whitespace-nowrap">Action:</label>
                                    <select
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        value={action}
                                        onChange={(e) => { setAction(e.target.value as AuditAction | ''); setOffset(0); }}
                                    >
                                        <option value="">All Actions</option>
                                        {AUDIT_ACTIONS.map(a => (
                                            <option key={a.value} value={a.value}>{a.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-600 whitespace-nowrap">Outcome:</label>
                                    <select
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                                        value={outcome}
                                        onChange={(e) => { setOutcome(e.target.value); setOffset(0); }}
                                    >
                                        <option value="">All</option>
                                        <option value="success">Success</option>
                                        <option value="failure">Failure</option>
                                        <option value="denied">Denied</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-600 whitespace-nowrap">From:</label>
                                    <Input type="date" leftIcon={<Calendar className="w-4 h-4" />} value={dateFrom}
                                        onChange={(e) => { setDateFrom(e.target.value); setOffset(0); }} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm text-gray-600 whitespace-nowrap">To:</label>
                                    <Input type="date" leftIcon={<Calendar className="w-4 h-4" />} value={dateTo}
                                        onChange={(e) => { setDateTo(e.target.value); setOffset(0); }} />
                                </div>

                                {(action || outcome || dateFrom || dateTo) && (
                                    <Button variant="ghost" size="sm"
                                        onClick={() => { setAction(''); setOutcome(''); setDateFrom(''); setDateTo(''); setOffset(0); }}>
                                        Clear filters
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Timestamp</th>
                                    <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">User</th>
                                    <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Action</th>
                                    <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Resource</th>
                                    <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Outcome</th>
                                    <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">IP Address</th>
                                    <th className="text-left py-3 px-4 text-label text-gray-600 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading
                                    ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                                    : events.length === 0
                                        ? (
                                            <tr>
                                                <td colSpan={7} className="py-12 text-center text-gray-400">
                                                    No audit events found.
                                                </td>
                                            </tr>
                                        )
                                        : events.map((evt) => (
                                            <tr key={evt.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                                                onClick={() => openDetail(evt.id)}>
                                                <td className="py-3 px-4 text-gray-600 text-sm font-mono whitespace-nowrap">
                                                    {formatTs(evt.timestamp)}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="text-gray-900 text-sm">{evt.user_name}</div>
                                                    {evt.user_email && <div className="text-gray-500 text-xs">{evt.user_email}</div>}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <Badge variant={ACTION_VARIANT[evt.action] ?? 'default'}>
                                                        {evt.action.replace(/_/g, ' ')}
                                                    </Badge>
                                                </td>
                                                <td className="py-3 px-4 text-gray-700 text-sm">
                                                    <span className="font-medium">{evt.resource_type}</span>
                                                    {evt.resource_id && (
                                                        <span className="text-gray-400 text-xs ml-1 font-mono">
                                                            #{evt.resource_id.slice(0, 8)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <Badge variant={OUTCOME_VARIANT[evt.outcome] ?? 'default'}>
                                                        {evt.outcome}
                                                    </Badge>
                                                </td>
                                                <td className="py-3 px-4 text-gray-500 text-sm font-mono">
                                                    {evt.ip_address ?? '—'}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <Eye className="w-4 h-4 text-gray-400" />
                                                </td>
                                            </tr>
                                        ))
                                }
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {!loading && total > limit && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <span className="text-sm text-gray-500">
                                Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
                            </span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={offset === 0}
                                    onClick={() => setOffset(Math.max(0, offset - limit))}>
                                    Previous
                                </Button>
                                <Button variant="outline" size="sm" disabled={currentPage >= totalPages}
                                    onClick={() => setOffset(offset + limit)}>
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {/* ── Security Alerts Tab ────────────────────────────────────── */}
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
                                                <Badge variant={SEVERITY_VARIANT[alert.severity] ?? 'default'}>
                                                    {alert.severity}
                                                </Badge>
                                                <span className="font-medium text-gray-900">{alert.title}</span>
                                                <Badge variant={alert.status === 'open' ? 'error' : alert.status === 'resolved' ? 'success' : 'default'}>
                                                    {alert.status}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-gray-600">{alert.description}</p>
                                            <span className="text-xs text-gray-400">{formatTs(alert.created_at)}</span>
                                        </div>
                                        {alert.status === 'open' && (
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" onClick={() => resolveAlert(alert.id, 'acknowledged')}>
                                                    Acknowledge
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => resolveAlert(alert.id, 'resolved')}>
                                                    Resolve
                                                </Button>
                                            </div>
                                        )}
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
