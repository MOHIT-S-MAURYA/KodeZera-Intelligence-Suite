import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
    Headphones, AlertCircle, CheckCircle2, Plus, Clock, RefreshCw,
    X, ChevronDown, Building2, User, Calendar, Tag, MessageSquare,
    ArrowUpRight, Loader2,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import apiService from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Ticket {
    id: string;
    subject: string;
    description: string;
    category: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'resolved';
    tenant_name?: string;
    tenant_slug?: string;
    created_by_name?: string;
    created_by_email?: string;
    created_by_role?: string;
    context_info?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand';

const PRIORITY_COLORS: Record<string, BadgeVariant> = {
    critical: 'error', high: 'warning', medium: 'info', low: 'default',
};
const STATUS_COLORS: Record<string, BadgeVariant> = {
    open: 'error', in_progress: 'warning', resolved: 'success',
};
const STATUS_LABELS: Record<string, string> = {
    open: 'Open', in_progress: 'In Progress', resolved: 'Resolved',
};
const CATEGORY_LABELS: Record<string, string> = {
    bug: 'Bug / Error', feature: 'Feature Request', access: 'Access Issue',
    performance: 'Performance', data: 'Data Issue', other: 'Other',
};

const timeAgo = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

// ─── Ticket Detail Panel ─────────────────────────────────────────────────────
interface TicketDetailProps {
    ticket: Ticket;
    isPlatformOwner: boolean;
    onClose: () => void;
    onStatusChange: (id: string, status: string) => void;
}

const TicketDetail: React.FC<TicketDetailProps> = ({ ticket, isPlatformOwner, onClose, onStatusChange }) => {
    const [updating, setUpdating] = useState(false);
    const { addToast } = useUIStore();

    const handleStatusChange = async (newStatus: string) => {
        setUpdating(true);
        try {
            await apiService.patch(`/support/${ticket.id}/`, { status: newStatus });
            onStatusChange(ticket.id, newStatus);
            onClose();
        } catch {
            addToast('error', 'Failed to update ticket status. Please try again.');
        } finally {
            setUpdating(false);
        }
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in border border-border">
                {/* Header */}
                <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-surface">
                    <div className="pr-4">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-mono text-text-muted opacity-50 bg-surface-hover px-2 py-0.5 rounded">
                                {ticket.id}
                            </span>
                            <Badge variant={STATUS_COLORS[ticket.status] ?? 'default'}>
                                {STATUS_LABELS[ticket.status]}
                            </Badge>
                            <Badge variant={PRIORITY_COLORS[ticket.priority] ?? 'default'}>
                                {ticket.priority}
                            </Badge>
                        </div>
                        <h2 className="text-base font-semibold text-text-main">{ticket.subject}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors flex-shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-4 space-y-5">
                    {/* Tenant context — shown to platform owner */}
                    {isPlatformOwner && ticket.tenant_name && (
                        <div className="flex items-center gap-3 p-3 bg-brand/10 border border-brand/20 rounded-xl">
                            <Building2 className="w-4 h-4 text-brand flex-shrink-0" />
                            <div>
                                <p className="text-xs text-brand">Tenant</p>
                                <p className="text-sm font-semibold text-brand">
                                    {ticket.tenant_name} <span className="font-normal opacity-80">@{ticket.tenant_slug}</span>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Submitted by */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-surface-hover p-3">
                            <p className="text-xs text-text-muted opacity-80 mb-1 flex items-center gap-1"><User className="w-3 h-3" />Submitted By</p>
                            <p className="font-medium text-text-main">{ticket.created_by_name || '—'}</p>
                            <p className="text-xs text-text-muted">{ticket.created_by_email}</p>
                            <p className="text-xs text-text-muted opacity-80 mt-0.5">{ticket.created_by_role}</p>
                        </div>
                        <div className="rounded-xl bg-surface-hover p-3">
                            <p className="text-xs text-text-muted opacity-80 mb-1 flex items-center gap-1"><Tag className="w-3 h-3" />Category</p>
                            <p className="font-medium text-text-main">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</p>
                            <p className="text-xs text-text-muted opacity-80 mt-2 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <p className="text-xs font-medium text-text-muted opacity-80 mb-2 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />DESCRIPTION
                        </p>
                        <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap bg-surface-hover rounded-xl p-4">
                            {ticket.description}
                        </p>
                    </div>

                    {/* Context info (auto-captured) */}
                    {ticket.context_info && Object.keys(ticket.context_info).length > 0 && (
                        <div>
                            <p className="text-xs font-medium text-text-muted opacity-80 mb-2">SYSTEM CONTEXT</p>
                            <div className="bg-surface-hover rounded-xl p-3 space-y-1">
                                {Object.entries(ticket.context_info).map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-2 text-xs">
                                        <span className="text-text-muted opacity-50 w-24 shrink-0">{k.replace(/_/g, ' ')}</span>
                                        <span className="text-text-muted font-mono break-all">{String(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions — platform owner can change status */}
                    {isPlatformOwner && ticket.status !== 'resolved' && (
                        <div className="flex gap-3 pt-2">
                            {ticket.status === 'open' && (
                                <button
                                    disabled={updating}
                                    onClick={() => handleStatusChange('in_progress')}
                                    className="flex-1 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                >
                                    {updating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Mark In Progress'}
                                </button>
                            )}
                            <button
                                disabled={updating}
                                onClick={() => handleStatusChange('resolved')}
                                className="flex-1 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-sm font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
                            >
                                {updating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Mark Resolved'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── Create Ticket Panel ─────────────────────────────────────────────────────
interface CreateTicketProps {
    user: { email?: string; full_name?: string } | null;
    onClose: () => void;
    onCreated: (ticket: Ticket) => void;
}

const CreateTicketPanel: React.FC<CreateTicketProps> = ({ onClose, onCreated }) => {
    const [form, setForm] = useState({
        subject: '', description: '', priority: 'medium', category: 'bug',
    });
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        if (!form.subject.trim()) { setError('Subject is required.'); return; }
        if (!form.description.trim()) { setError('Description is required — please provide as much detail as possible.'); return; }
        if (form.description.trim().length < 20) { setError('Description must be at least 20 characters.'); return; }

        setCreating(true);
        setError(null);
        try {
            // Auto-capture client-side context for the platform owner
            const contextInfo = {
                page_url: window.location.href,
                browser: navigator.userAgent.split(') ')[0].split(' (')[1] ?? navigator.userAgent.slice(0, 60),
                screen: `${window.screen.width}x${window.screen.height}`,
                submitted_at: new Date().toISOString(),
            };

            const resp = await apiService.post('/support/', {
                ...form,
                context_info: contextInfo,
            });
            onCreated(resp.data as Ticket);
            onClose();
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } } };
            setError(err?.response?.data?.error || 'Failed to create ticket. Please try again.');
        } finally {
            setCreating(false);
        }
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-surface rounded-2xl shadow-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
                    <h2 className="text-base font-semibold text-text-main">Open Support Ticket</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-text-main mb-1.5">Category</label>
                            <div className="relative">
                                <select
                                    value={form.category}
                                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                    className="w-full appearance-none px-3 py-2.5 border border-border rounded-xl bg-surface text-sm text-text-main focus:ring-2 focus:ring-accent-cyan focus:border-transparent outline-none pr-8"
                                >
                                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                                        <option key={v} value={v}>{l}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted opacity-50 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-main mb-1.5">Priority</label>
                            <div className="relative">
                                <select
                                    value={form.priority}
                                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                                    className="w-full appearance-none px-3 py-2.5 border border-border rounded-xl bg-surface text-sm text-text-main focus:ring-2 focus:ring-accent-cyan focus:border-transparent outline-none pr-8"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical — system down</option>
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted opacity-50 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    <Input
                        label="Subject"
                        value={form.subject}
                        onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                        placeholder="Brief summary of the issue"
                        required
                    />

                    <div>
                        <label className="block text-sm font-medium text-text-main mb-1.5">
                            Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={5}
                            className="w-full px-3 py-2.5 border border-border bg-surface rounded-xl text-sm text-text-main placeholder:text-text-muted focus:ring-2 focus:ring-accent-cyan focus:border-transparent outline-none resize-none"
                            placeholder="Describe the issue in detail — what happened, what you expected, and any steps to reproduce it."
                        />
                        <p className="text-xs text-text-muted opacity-80 mt-1">
                            Your browser, page URL, and timestamp are automatically attached to help our team investigate faster.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
                        <Button variant="primary" onClick={handleCreate} loading={creating}>Submit Ticket</Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────
export const PlatformSupport: React.FC = () => {
    const { user, isPlatformOwner } = useAuthStore();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await apiService.get('/support/');
            // Backend returns an array
            const data = Array.isArray(resp.data) ? resp.data : resp.data?.results ?? [];
            setTickets(data);
        } catch (e) {
            const err = e as { response?: { data?: { detail?: string } } };
            setError(err?.response?.data?.detail || 'Failed to load support tickets.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTickets(); }, [fetchTickets]);

    const handleStatusChange = (id: string, newStatus: string) => {
        setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus as Ticket['status'] } : t));
    };

    const handleTicketCreated = (ticket: Ticket) => {
        setTickets(prev => [ticket, ...prev]);
    };

    const filtered = tickets.filter(t => {
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
        return true;
    });

    const openCount = tickets.filter(t => t.status === 'open').length;
    const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
    const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

    return (
        <div className="space-y-6">
            {/* Portals */}
            {selectedTicket && (
                <TicketDetail
                    ticket={selectedTicket}
                    isPlatformOwner={isPlatformOwner}
                    onClose={() => setSelectedTicket(null)}
                    onStatusChange={handleStatusChange}
                />
            )}
            {showCreate && (
                <CreateTicketPanel
                    user={user}
                    onClose={() => setShowCreate(false)}
                    onCreated={handleTicketCreated}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Support</h1>
                    <p className="text-text-muted mt-1">
                        {isPlatformOwner
                            ? 'View and manage all support tickets from tenants'
                            : 'Get help from the platform team'}
                    </p>
                </div>
                <Button variant="primary" className="flex items-center gap-2" onClick={() => setShowCreate(true)}>
                    <Plus className="w-4 h-4" />
                    Open Ticket
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Open', count: openCount, color: 'bg-red-500/10', icon: <AlertCircle className="w-5 h-5 text-red-500" />, filter: 'open' },
                    { label: 'In Progress', count: inProgressCount, color: 'bg-amber-500/10', icon: <Clock className="w-5 h-5 text-amber-500" />, filter: 'in_progress' },
                    { label: 'Resolved', count: resolvedCount, color: 'bg-green-500/10', icon: <CheckCircle2 className="w-5 h-5 text-green-500" />, filter: 'resolved' },
                ].map(stat => (
                    <button
                        key={stat.filter}
                        onClick={() => setStatusFilter(statusFilter === stat.filter ? 'all' : stat.filter)}
                        className={`text-left transition-all ${statusFilter === stat.filter ? 'ring-2 ring-accent-cyan rounded-xl' : ''}`}
                    >
                        <Card>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center flex-shrink-0`}>
                                    {stat.icon}
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-text-main">{stat.count}</p>
                                    <p className="text-xs text-text-muted">{stat.label}</p>
                                </div>
                            </div>
                        </Card>
                    </button>
                ))}
            </div>

            {/* Filters + Refresh */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-2 border border-border rounded-lg bg-surface text-sm text-text-main focus:ring-2 focus:ring-accent-cyan outline-none"
                    >
                        <option value="all">All Statuses</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted opacity-50 pointer-events-none" />
                </div>
                <div className="relative">
                    <select
                        value={priorityFilter}
                        onChange={e => setPriorityFilter(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-2 border border-border rounded-lg bg-surface text-sm text-text-main focus:ring-2 focus:ring-accent-cyan outline-none"
                    >
                        <option value="all">All Priorities</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted opacity-50 pointer-events-none" />
                </div>
                <button
                    onClick={fetchTickets}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg bg-surface text-sm text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
                <span className="text-sm text-text-muted opacity-80 ml-auto">
                    {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Tickets list */}
            <Card>
                {error ? (
                    <div className="flex flex-col items-center py-12 text-center">
                        <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
                        <p className="text-text-main font-medium mb-1">Failed to load tickets</p>
                        <p className="text-sm text-text-muted mb-4">{error}</p>
                        <Button variant="outline" onClick={fetchTickets}>Try Again</Button>
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-accent-cyan animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <Headphones className="w-12 h-12 text-text-muted opacity-30 mx-auto mb-3" />
                        <p className="text-text-main font-medium">No tickets found</p>
                        <p className="text-sm text-text-muted mt-1">
                            {tickets.length > 0
                                ? 'Try clearing the filters'
                                : 'No support tickets yet. Open a ticket if you need help.'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {filtered.map(ticket => (
                            <button
                                key={ticket.id}
                                onClick={() => setSelectedTicket(ticket)}
                                className="w-full text-left px-2 py-4 hover:bg-surface-hover transition-colors rounded-xl group"
                            >
                                <div className="flex items-start gap-4">
                                    {/* Status dot */}
                                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${ticket.status === 'resolved' ? 'bg-green-500' :
                                        ticket.status === 'in_progress' ? 'bg-amber-500' : 'bg-red-500'
                                        }`} />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className="text-xs font-mono text-text-muted opacity-50">{ticket.id}</span>
                                            <Badge variant={STATUS_COLORS[ticket.status] ?? 'default'}>{STATUS_LABELS[ticket.status]}</Badge>
                                            <Badge variant={PRIORITY_COLORS[ticket.priority] ?? 'default'}>{ticket.priority}</Badge>
                                            <span className="text-xs text-text-muted bg-surface-hover px-2 py-0.5 rounded-full">
                                                {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                                            </span>
                                        </div>
                                        <p className="font-medium text-sm text-text-main truncate">{ticket.subject}</p>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-text-muted opacity-80 flex-wrap">
                                            {isPlatformOwner && ticket.tenant_name && (
                                                <span className="flex items-center gap-1">
                                                    <Building2 className="w-3 h-3" />
                                                    {ticket.tenant_name}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <User className="w-3 h-3" />
                                                {ticket.created_by_name}
                                            </span>
                                            <span>{timeAgo(ticket.created_at)}</span>
                                        </div>
                                    </div>

                                    <ArrowUpRight className="w-4 h-4 text-text-muted opacity-30 group-hover:opacity-100 group-hover:text-brand transition-colors flex-shrink-0 mt-1" />
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};
