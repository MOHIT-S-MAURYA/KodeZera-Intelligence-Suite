import React, { useState, useEffect, useCallback } from 'react';
import { Search, Calendar, RefreshCw, ChevronDown } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { auditLogService, AUDIT_ACTIONS } from '../services/auditlog.service';
import { getApiError } from '../utils/errors';
import type { AuditLogEntry, AuditLogFilters, AuditAction } from '../services/auditlog.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTION_VARIANT: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
    login:         'success',
    logout:        'default',
    create:        'info',
    update:        'warning',
    delete:        'error',
    upload:        'info',
    download:      'default',
    query:         'default',
    grant_access:  'success',
    revoke_access: 'error',
    read:          'default',
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
        {Array.from({ length: 5 }).map((_, i) => (
            <td key={i} className="py-3 px-4">
                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
            </td>
        ))}
    </tr>
);

// ── Main component ────────────────────────────────────────────────────────────

export const AuditLogs: React.FC = () => {
    const [logs, setLogs]         = useState<AuditLogEntry[]>([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);

    // Filters
    const [search, setSearch]         = useState('');
    const [action, setAction]         = useState<AuditAction | ''>('');
    const [dateFrom, setDateFrom]     = useState('');
    const [dateTo, setDateTo]         = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // ── Data loading ──────────────────────────────────────────────────────────

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const filters: AuditLogFilters = {};
            if (action)   filters.action    = action;
            if (dateFrom) filters.date_from = dateFrom;
            if (dateTo)   filters.date_to   = dateTo;
            const data = await auditLogService.getAll(filters);
            setLogs(data);
        } catch (err) {
            setError(getApiError(err, 'Failed to load audit logs. Check your connection and try again.'));
        } finally {
            setLoading(false);
        }
    }, [action, dateFrom, dateTo]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Client-side search (across user, action, resource_type) ──────────────

    const filtered = logs.filter((l) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            (l.user_name ?? '').toLowerCase().includes(q)   ||
            (l.user_email ?? '').toLowerCase().includes(q)  ||
            l.action.toLowerCase().includes(q)              ||
            l.resource_type.toLowerCase().includes(q)       ||
            (l.ip_address ?? '').includes(q)
        );
    });

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Audit Logs</h1>
                    <p className="text-body-md text-gray-600">Track all system activities and changes</p>
                </div>
                <Button variant="ghost" size="md" icon={<RefreshCw className="w-4 h-4" />}
                    onClick={loadAll} disabled={loading}>
                    Refresh
                </Button>
            </div>

            {/* Error banner */}
            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">
                    {error}
                    <button className="ml-3 underline" onClick={loadAll}>Retry</button>
                </div>
            )}

            <Card>
                {/* Search + filter bar */}
                <div className="flex flex-col gap-3 mb-6">
                    <div className="flex gap-3 items-center">
                        <div className="flex-1">
                            <Input
                                placeholder="Search by user, action or resource…"
                                leftIcon={<Search className="w-5 h-5" />}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Button
                            variant="ghost" size="md"
                            icon={<ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />}
                            onClick={() => setShowFilters((v) => !v)}
                        >
                            Filters {(action || dateFrom || dateTo) ? '●' : ''}
                        </Button>
                    </div>

                    {showFilters && (
                        <div className="flex flex-wrap gap-3 pt-1">
                            {/* Action filter */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-600 whitespace-nowrap">Action:</label>
                                <select
                                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                                    value={action}
                                    onChange={(e) => setAction(e.target.value as AuditAction | '')}
                                >
                                    <option value="">All Actions</option>
                                    {AUDIT_ACTIONS.map((a) => (
                                        <option key={a.value} value={a.value}>{a.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Date range */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-600 whitespace-nowrap">From:</label>
                                <Input
                                    type="date"
                                    leftIcon={<Calendar className="w-4 h-4" />}
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-600 whitespace-nowrap">To:</label>
                                <Input
                                    type="date"
                                    leftIcon={<Calendar className="w-4 h-4" />}
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                />
                            </div>

                            {(action || dateFrom || dateTo) && (
                                <Button
                                    variant="ghost" size="sm"
                                    onClick={() => { setAction(''); setDateFrom(''); setDateTo(''); }}
                                >
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
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">IP Address</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading
                                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                                : filtered.length === 0
                                    ? (
                                        <tr>
                                            <td colSpan={5} className="py-12 text-center text-gray-400">
                                                {search || action || dateFrom || dateTo
                                                    ? 'No entries match your filters.'
                                                    : 'No audit log entries yet.'}
                                            </td>
                                        </tr>
                                    )
                                    : filtered.map((log) => (
                                        <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="py-3 px-4 text-gray-600 text-sm font-mono whitespace-nowrap">
                                                {formatTs(log.created_at)}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="text-gray-900 text-sm">{log.user_name}</div>
                                                {log.user_email && (
                                                    <div className="text-gray-500 text-xs">{log.user_email}</div>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                <Badge variant={ACTION_VARIANT[log.action] ?? 'neutral'}>
                                                    {log.action.replace('_', ' ')}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 text-gray-700 text-sm">
                                                <span className="font-medium">{log.resource_type}</span>
                                                {log.resource_id && (
                                                    <span className="text-gray-400 text-xs ml-1 font-mono">
                                                        #{log.resource_id.slice(0, 8)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-gray-500 text-sm font-mono">
                                                {log.ip_address ?? '—'}
                                            </td>
                                        </tr>
                                    ))
                            }
                        </tbody>
                    </table>
                </div>

                {!loading && filtered.length > 0 && (
                    <div className="mt-4 text-xs text-gray-400 text-right">
                        {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}
                        {logs.length !== filtered.length && ` (filtered from ${logs.length})`}
                    </div>
                )}
            </Card>
        </div>
    );
};
