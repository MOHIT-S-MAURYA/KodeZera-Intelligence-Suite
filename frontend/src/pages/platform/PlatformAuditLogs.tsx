import React, { useEffect, useState, useCallback } from 'react';
import { 
    Filter, Download, Shield, Eye, X, CheckCircle, AlertTriangle, 
    Copy, Check, PlusCircle, Edit2, Trash2, LogIn, LogOut, Upload, Search, 
    Settings, ShieldCheck, CheckCircle2, XCircle, Database, FileText, Server
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useUIStore } from '../../store/ui.store';
import { platformAuditService } from '../../services/audit.service';
import type { AuditEventEntry, AuditEventDetail, SecurityAlertEntry } from '../../services/audit.service';
import clsx from 'clsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand';

const ACTION_COLORS: Partial<Record<string, BadgeVariant>> = {
    create: 'success', update: 'warning', delete: 'error',
    login: 'success', logout: 'default', read: 'default',
    upload: 'info', download: 'default', query: 'default',
    grant_access: 'success', revoke_access: 'error',
    config_change: 'warning', export: 'info',
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
    create: <PlusCircle className="w-3.5 h-3.5 mr-1 inline" />,
    update: <Edit2 className="w-3.5 h-3.5 mr-1 inline" />,
    delete: <Trash2 className="w-3.5 h-3.5 mr-1 inline" />,
    login: <LogIn className="w-3.5 h-3.5 mr-1 inline" />,
    logout: <LogOut className="w-3.5 h-3.5 mr-1 inline" />,
    read: <Search className="w-3.5 h-3.5 mr-1 inline" />,
    upload: <Upload className="w-3.5 h-3.5 mr-1 inline" />,
    download: <Download className="w-3.5 h-3.5 mr-1 inline" />,
    query: <Database className="w-3.5 h-3.5 mr-1 inline" />,
    config_change: <Settings className="w-3.5 h-3.5 mr-1 inline" />,
    export: <FileText className="w-3.5 h-3.5 mr-1 inline" />,
    grant_access: <ShieldCheck className="w-3.5 h-3.5 mr-1 inline" />,
};

const OUTCOME_COLORS: Record<string, 'success' | 'error' | 'warning'> = {
    success: 'success', failure: 'error', denied: 'warning',
};

const OUTCOME_ICONS: Record<string, React.ReactNode> = {
    success: <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" />,
    failure: <XCircle className="w-3.5 h-3.5 mr-1 inline" />,
    denied: <AlertTriangle className="w-3.5 h-3.5 mr-1 inline" />,
};

const SEVERITY_COLORS: Record<string, 'info' | 'warning' | 'error'> = {
    low: 'info', medium: 'warning', high: 'error', critical: 'error',
};

function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="ml-2 inline-flex items-center text-text-muted hover:text-text-main transition-colors" title="Copy to clipboard">
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
        </button>
    );
};

// ── Event Detail Modal ──────────────────────────────────────────────────────

const EventDetailModal: React.FC<{ event: AuditEventDetail; onClose: () => void }> = ({ event, onClose }) => {
    const [tab, setTab] = useState<'overview' | 'json'>('overview');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
            <div className="bg-surface rounded-xl shadow-2xl border border-border max-w-3xl w-full my-8 max-h-full flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-surface-hover rounded-t-xl shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand/10 text-brand rounded-lg">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-text-main leading-tight">Audit Event Detail</h2>
                            <p className="text-xs text-text-muted mt-0.5 font-mono flex items-center">
                                ID: {event.id} <CopyButton text={event.id} />
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-text-muted hover:text-text-main transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-4 border-b border-border shrink-0">
                    <button onClick={() => setTab('overview')} className={clsx("px-4 py-3 text-sm font-medium border-b-2 transition-colors", tab === 'overview' ? "border-brand text-brand" : "border-transparent text-text-muted hover:text-text-main")}>Overview</button>
                    <button onClick={() => setTab('json')} className={clsx("px-4 py-3 text-sm font-medium border-b-2 transition-colors", tab === 'json' ? "border-brand text-brand" : "border-transparent text-text-muted hover:text-text-main")}>Raw JSON</button>
                </div>

                {/* Body */}
                <div className="p-6 text-sm overflow-y-auto">
                    {tab === 'overview' ? (
                        <div className="space-y-6">
                            {/* Key Value Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-3 bg-surface border border-border rounded-lg">
                                    <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Action</div>
                                    <Badge variant={ACTION_COLORS[event.action] ?? 'default'} className="text-sm px-2 py-0.5">
                                        {ACTION_ICONS[event.action]}{event.action.replace(/_/g, ' ')}
                                    </Badge>
                                </div>
                                <div className="p-3 bg-surface border border-border rounded-lg">
                                    <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Outcome</div>
                                    <Badge variant={OUTCOME_COLORS[event.outcome] ?? 'default'} className="text-sm px-2 py-0.5">
                                        {OUTCOME_ICONS[event.outcome]}{event.outcome}
                                    </Badge>
                                </div>
                                <div className="p-3 bg-surface border border-border rounded-lg">
                                    <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Actor</div>
                                    <div className="font-medium text-text-main flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold shrink-0">
                                            {event.user_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="truncate">
                                            {event.user_name} <span className="text-text-muted font-normal text-xs ml-1">({event.user_email || 'System'})</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-3 bg-surface border border-border rounded-lg">
                                    <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Tenant Scope</div>
                                    <div className="text-text-main font-medium">{event.tenant_name ?? '—'} <Badge variant="default" className="ml-2 font-normal scale-90">{event.scope}</Badge></div>
                                </div>
                                <div className="p-3 bg-surface border border-border rounded-lg md:col-span-2">
                                    <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Resource Involved</div>
                                    <div className="text-text-main flex items-center">
                                        <span className="font-medium capitalize">{event.resource_type}</span>
                                        {event.resource_id && (
                                            <span className="ml-2 text-text-muted font-mono flex items-center bg-surface-hover px-2 py-0.5 rounded text-xs border border-border">
                                                {event.resource_id} <CopyButton text={event.resource_id} />
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Request Details */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-surface-hover rounded-lg border border-border text-xs">
                                <div><span className="block text-text-muted mb-1">IP Address</span><span className="font-mono flex items-center">{event.ip_address ?? '—'} {event.ip_address && <CopyButton text={event.ip_address} />}</span></div>
                                <div><span className="block text-text-muted mb-1">Endpoint</span><span className="font-mono text-text-main">{event.http_method} {event.endpoint}</span></div>
                                <div><span className="block text-text-muted mb-1">Request ID</span><span className="font-mono text-text-main flex items-center max-w-[150px] truncate" title={event.request_id || ''}>{event.request_id ? event.request_id.slice(0, 8) + '...' : '—'} {event.request_id && <CopyButton text={event.request_id} />}</span></div>
                                <div><span className="block text-text-muted mb-1">Timestamp</span><span className="text-text-main">{formatTimestamp(event.timestamp)}</span></div>
                            </div>

                            {event.error_message && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                                    <span className="flex items-center gap-2 text-red-500 font-medium mb-2"><AlertTriangle className="w-4 h-4" /> Failure Reason</span>
                                    <div className="font-mono text-xs text-red-600 bg-red-500/5 p-3 rounded">{event.error_message}</div>
                                </div>
                            )}

                            {Object.keys(event.changes || {}).length > 0 && (
                                <div>
                                    <h3 className="font-medium text-text-main mb-3 flex items-center gap-2"><Edit2 className="w-4 h-4 text-text-muted" /> Config Changes</h3>
                                    <div className="border border-border rounded-lg overflow-hidden">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-surface-hover text-text-muted border-b border-border font-medium uppercase tracking-wider">
                                                <tr><th className="px-4 py-2 w-1/3">Field</th><th className="px-4 py-2 w-1/3">Old Value</th><th className="px-4 py-2 w-1/3">New Value</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-border font-mono">
                                                {Object.entries(event.changes).map(([field, diff]) => (
                                                    <tr key={field} className="bg-surface">
                                                        <td className="px-4 py-2 text-text-main">{field}</td>
                                                        <td className="px-4 py-2 text-red-500 bg-red-500/5 line-through decoration-red-500/30">{diff.old ?? 'null'}</td>
                                                        <td className="px-4 py-2 text-green-500 bg-green-500/5">{diff.new ?? 'null'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                        </div>
                    ) : (
                        <div className="relative group">
                            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(event, null, 2))} className="absolute top-2 right-2 p-2 bg-surface hover:bg-surface text-text-muted hover:text-text-main border border-border rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                                <Copy className="w-4 h-4" /> <span className="text-xs font-medium">Copy JSON</span>
                            </button>
                            <pre className="bg-[#0f172a] text-[#e2e8f0] p-4 rounded-lg overflow-x-auto font-mono text-xs leading-relaxed shadow-inner">
                                {JSON.stringify(event, null, 2)}
                            </pre>
                            <div className="mt-4 pt-4 border-t border-border">
                                <span className="text-text-main font-medium text-sm flex items-center gap-2 mb-2"><ShieldCheck className="w-4 h-4 text-green-500" /> Cryptographic Integrity</span>
                                <div className="bg-surface-hover p-3 rounded-lg border border-border font-mono text-xs text-text-muted space-y-1">
                                    <div className="flex gap-2"><span className="text-text-main w-20">Hash:</span> <span className="break-all select-all">{event.event_hash}</span></div>
                                    <div className="flex gap-2"><span className="text-text-main w-20">Previous:</span> <span className="break-all select-all">{event.previous_hash}</span></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

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
    }, [filters, limit, offset, addToast]);

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

    // Derived Summary Metrics
    const failedActionsCount = events.filter(e => e.outcome === 'failure' || e.outcome === 'denied').length;

    return (
        <div className="space-y-6">
            {selectedEvent && <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Platform Audit Logs</h1>
                    <p className="text-text-muted mt-2">Comprehensive tracking of system-wide activities, security events, and compliance records.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
                        Export CSV
                    </Button>
                    <Button variant="outline" size="sm" icon={<CheckCircle className="w-4 h-4" />} onClick={handleVerifyChain}
                        disabled={verifying}>
                        {verifying ? 'Verifying...' : 'Verify Chain'}
                    </Button>
                </div>
            </div>

            {/* Info Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="flex items-center p-4">
                    <div className="p-3 bg-brand/10 text-brand rounded-lg mr-4">
                        <FileText className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-sm font-medium text-text-muted">Total Events</div>
                        <div className="text-2xl font-bold text-text-main">{total.toLocaleString()}</div>
                    </div>
                </Card>
                <Card className="flex items-center p-4">
                    <div className="p-3 bg-red-500/10 text-red-500 rounded-lg mr-4">
                        <XCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-sm font-medium text-text-muted">Failed Actions (Current Page)</div>
                        <div className="text-2xl font-bold text-text-main">{failedActionsCount}</div>
                    </div>
                </Card>
                <Card className="flex items-center p-4 cursor-pointer hover:border-brand/40 transition-colors" onClick={() => setActiveTab('alerts')}>
                    <div className="p-3 bg-orange-500/10 text-orange-500 rounded-lg mr-4">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-sm font-medium text-text-muted">Active Security Alerts</div>
                        <div className="text-2xl font-bold text-text-main">{alertsTotal}</div>
                    </div>
                </Card>
            </div>

            {/* Chain verification result */}
            {chainResult && (
                <div className={clsx("rounded-lg px-4 py-3 text-sm flex items-center gap-3 shadow-sm border animate-in slide-in-from-top-2", chainResult.valid ? 'bg-green-500/10 border-green-500/20 text-green-700' : 'bg-red-500/10 border-red-500/20 text-red-700')}>
                    {chainResult.valid
                        ? <><CheckCircle2 className="w-5 h-5 shrink-0" /> <span className="font-medium">Hash chain verified securely.</span> Checked {chainResult.checked} cryptographic events with no tampering detected.</>
                        : <><AlertTriangle className="w-5 h-5 shrink-0" /> <span className="font-medium">Chain integrity broken!</span> Breach detected at event {chainResult.first_break_id} after {chainResult.checked} validations.</>
                    }
                    <button className="ml-auto text-xs underline font-medium hover:opacity-80 transition-opacity" onClick={() => setChainResult(null)}>Dismiss</button>
                </div>
            )}

            {/* Controls Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Tabs */}
                <div className="flex gap-1 bg-surface-hover p-1.5 rounded-xl border border-border w-fit shadow-sm">
                    <button
                        className={clsx("px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2", activeTab === 'events' ? 'bg-surface shadow-sm text-text-main' : 'text-text-muted hover:text-text-main')}
                        onClick={() => setActiveTab('events')}
                    >
                        <FileText className="w-4 h-4" /> Audit Events
                    </button>
                    <button
                        className={clsx("px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2", activeTab === 'alerts' ? 'bg-surface shadow-sm text-text-main' : 'text-text-muted hover:text-text-main')}
                        onClick={() => setActiveTab('alerts')}
                    >
                        <Shield className="w-4 h-4" /> Security Alerts {alertsTotal > 0 && <span className="bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-md text-xs">{alertsTotal}</span>}
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input type="text" placeholder="Search events..." value={filters.search} onChange={(e) => { setFilters(prev => ({ ...prev, search: e.target.value })); setOffset(0); }} className="pl-9 pr-4 py-2 border border-border bg-surface text-sm text-text-main placeholder:text-text-muted rounded-lg shadow-sm focus:ring-accent-cyan transition-shadow w-64" />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={clsx("flex items-center gap-2 px-4 py-2 border rounded-lg transition-all text-sm font-medium shadow-sm", showFilters ? 'bg-brand/10 border-brand/20 text-brand' : 'bg-surface border-border text-text-main hover:bg-surface-hover')}
                    >
                        <Filter className="w-4 h-4" />
                        More Filters
                    </button>
                </div>
            </div>

            {/* Advanced Filters */}
            {showFilters && (
                <div className="p-5 bg-surface rounded-xl border border-border shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Action</label>
                            <select value={filters.action} onChange={(e) => { setFilters(prev => ({ ...prev, action: e.target.value })); setOffset(0); }} className="w-full px-3 py-2 border border-border bg-surface text-text-main rounded-md shadow-sm focus:ring-accent-cyan sm:text-sm appearance-none cursor-pointer hover:border-text-muted/30 transition-colors">
                                <option value="">All Actions</option>
                                {['create', 'update', 'delete', 'read', 'login', 'logout', 'upload', 'download', 'config_change', 'export'].map(a => (
                                    <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Outcome</label>
                            <select value={filters.outcome} onChange={(e) => { setFilters(prev => ({ ...prev, outcome: e.target.value })); setOffset(0); }} className="w-full px-3 py-2 border border-border bg-surface text-text-main rounded-md shadow-sm focus:ring-accent-cyan sm:text-sm appearance-none cursor-pointer hover:border-text-muted/30 transition-colors">
                                <option value="">All Outcomes</option>
                                <option value="success">Success</option>
                                <option value="failure">Failure</option>
                                <option value="denied">Denied</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Scope</label>
                            <select value={filters.scope} onChange={(e) => { setFilters(prev => ({ ...prev, scope: e.target.value })); setOffset(0); }} className="w-full px-3 py-2 border border-border bg-surface text-text-main rounded-md shadow-sm focus:ring-accent-cyan sm:text-sm appearance-none cursor-pointer hover:border-text-muted/30 transition-colors">
                                <option value="">All Scopes</option>
                                <option value="tenant">Tenant</option>
                                <option value="platform">Platform</option>
                                <option value="system">System</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Start Date</label>
                            <input type="date" value={filters.startDate} onChange={(e) => { setFilters(prev => ({ ...prev, startDate: e.target.value })); setOffset(0); }} className="w-full px-3 py-2 border border-border bg-surface text-text-main rounded-md shadow-sm focus:ring-accent-cyan sm:text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">End Date</label>
                            <input type="date" value={filters.endDate} onChange={(e) => { setFilters(prev => ({ ...prev, endDate: e.target.value })); setOffset(0); }} className="w-full px-3 py-2 border border-border bg-surface text-text-main rounded-md shadow-sm focus:ring-accent-cyan sm:text-sm" />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Events Tab ─────────────────────────────────────────────── */}
            {activeTab === 'events' && (
                <Card className="overflow-hidden shadow-sm border border-border">
                    {loading ? (
                        <div className="py-16 flex flex-col items-center justify-center">
                            <div className="relative w-12 h-12">
                                <div className="absolute inset-0 border-4 border-surface-hover rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-brand rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-text-muted mt-4 font-medium">Loading audit events...</p>
                        </div>
                    ) : events.length === 0 ? (
                        <div className="py-24 flex flex-col items-center justify-center text-center px-4">
                            <div className="w-20 h-20 bg-surface-hover rounded-full flex items-center justify-center mb-6 border border-border">
                                <Search className="w-10 h-10 text-text-muted opacity-50" />
                            </div>
                            <h3 className="text-xl font-bold text-text-main mb-2">No events found</h3>
                            <p className="text-text-muted max-w-md">We couldn't find any audit events matching your current filters. Try adjusting your search criteria or date range.</p>
                            {showFilters && (
                                <Button variant="outline" className="mt-6" onClick={() => setFilters({search: '', action: '', outcome: '', scope: '', startDate: '', endDate: ''})}>Clear Filters</Button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-border bg-surface-hover">
                                            <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider w-40">Timestamp</th>
                                            <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">User</th>
                                            <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Action</th>
                                            <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Resource</th>
                                            <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Outcome</th>
                                            <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Tenant / IP</th>
                                            <th className="py-4 px-5 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {events.map(evt => (
                                            <tr key={evt.id} className="group hover:bg-surface-hover transition-colors cursor-pointer" onClick={() => openDetail(evt.id)}>
                                                <td className="py-3 px-5 text-sm font-mono text-text-muted whitespace-nowrap align-middle">
                                                    {formatTimestamp(evt.timestamp)}
                                                </td>
                                                <td className="py-3 px-5 align-middle">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex flex-col items-center justify-center text-xs font-bold shrink-0 border border-brand/20">
                                                            {evt.user_name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-text-main leading-tight">{evt.user_name}</div>
                                                            {evt.user_email && <div className="text-xs text-text-muted mt-0.5">{evt.user_email}</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-5 align-middle whitespace-nowrap">
                                                    <Badge variant={ACTION_COLORS[evt.action] ?? 'default'} className="font-medium shadow-sm">
                                                        {ACTION_ICONS[evt.action]}{evt.action.replace(/_/g, ' ')}
                                                    </Badge>
                                                </td>
                                                <td className="py-3 px-5 align-middle">
                                                    <div className="text-sm font-medium text-text-main capitalize">{evt.resource_type}</div>
                                                    {evt.resource_id && (
                                                        <div className="text-xs text-text-muted font-mono mt-0.5 flex items-center group/id">
                                                            #{evt.resource_id.slice(0, 8)} 
                                                            <span className="opacity-0 group-hover/id:opacity-100 transition-opacity ml-1 z-10" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(evt.resource_id || ''); addToast('success', 'Resource ID copied'); }}><Copy className="w-3 h-3 cursor-pointer hover:text-brand" /></span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3 px-5 align-middle">
                                                    <Badge variant={OUTCOME_COLORS[evt.outcome] ?? 'default'} className="font-medium shadow-sm">
                                                        {OUTCOME_ICONS[evt.outcome]}{evt.outcome}
                                                    </Badge>
                                                </td>
                                                <td className="py-3 px-5 align-middle">
                                                    <div className="text-sm text-text-main font-medium">{evt.tenant_name ?? <span className="text-text-muted italic">System</span>}</div>
                                                    <div className="text-xs text-text-muted font-mono mt-0.5 group/ip flex items-center">
                                                        {evt.ip_address ?? '—'}
                                                        {evt.ip_address && <span className="opacity-0 group-hover/ip:opacity-100 transition-opacity ml-1 z-10" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(evt.ip_address || ''); addToast('success', 'IP address copied'); }}><Copy className="w-3 h-3 cursor-pointer hover:text-brand" /></span>}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-5 align-middle text-right">
                                                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-all transform scale-95 group-hover:scale-100">
                                                        View <Eye className="w-4 h-4 ml-1" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {total > limit && (
                                <div className="flex items-center justify-between p-4 border-t border-border bg-surface">
                                    <span className="text-sm text-text-muted font-medium">
                                        Showing <span className="text-text-main">{offset + 1}</span>–<span className="text-text-main">{Math.min(offset + limit, total)}</span> of <span className="text-text-main">{total}</span>
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
                <Card className="overflow-hidden border border-border shadow-sm">
                    {alertsLoading ? (
                        <div className="py-16 flex flex-col items-center justify-center">
                            <div className="relative w-12 h-12">
                                <div className="absolute inset-0 border-4 border-surface-hover rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-brand rounded-full border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-text-muted mt-4 font-medium">Loading security alerts...</p>
                        </div>
                    ) : alerts.length === 0 ? (
                        <div className="text-center py-24 text-text-muted flex flex-col items-center px-4">
                            <div className="w-20 h-20 bg-green-500/5 rounded-full flex items-center justify-center mb-6 border border-green-500/10">
                                <ShieldCheck className="w-10 h-10 text-green-500 opacity-80" />
                            </div>
                            <h3 className="text-xl font-bold text-text-main mb-2">System is secure</h3>
                            <p className="text-text-muted">No active security alerts found across the platform.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {alerts.map(alert => (
                                <div key={alert.id} className="p-5 hover:bg-surface-hover transition-colors">
                                    <div className="flex gap-4">
                                        <div className="shrink-0 mt-1">
                                            {alert.severity === 'critical' ? <AlertTriangle className="w-6 h-6 text-red-600" /> :
                                             alert.severity === 'high' ? <AlertTriangle className="w-6 h-6 text-orange-500" /> :
                                             alert.severity === 'medium' ? <AlertTriangle className="w-6 h-6 text-yellow-500" /> :
                                             <Shield className="w-6 h-6 text-blue-500" />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-semibold text-text-main text-base">{alert.title}</span>
                                                    <Badge variant={SEVERITY_COLORS[alert.severity] ?? 'default'} className="uppercase text-[10px] tracking-wider px-2 py-0.5">{alert.severity}</Badge>
                                                    <Badge variant={alert.status === 'open' ? 'error' : alert.status === 'resolved' ? 'success' : 'default'} className="uppercase text-[10px] tracking-wider px-2 py-0.5">{alert.status}</Badge>
                                                </div>
                                                <span className="text-xs font-mono text-text-muted bg-surface py-1 px-2 rounded border border-border">{formatTimestamp(alert.created_at)}</span>
                                            </div>
                                            <p className="text-sm text-text-muted leading-relaxed mb-3">{alert.description}</p>
                                            
                                            {alert.tenant_name && (
                                                <div className="inline-flex items-center gap-2 text-xs font-medium text-text-main bg-brand/5 border border-brand/10 px-2.5 py-1 rounded">
                                                    <Server className="w-3.5 h-3.5 text-brand" /> Tenant: {alert.tenant_name}
                                                </div>
                                            )}
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
