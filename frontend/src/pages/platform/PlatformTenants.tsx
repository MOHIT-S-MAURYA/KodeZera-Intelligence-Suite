import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
    Plus, Search, MoreVertical, Users, FileText,
    AlertCircle, Eye, Power, PowerOff, Trash2, Copy, CheckCircle2,
    Calendar, X, TriangleAlert,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import platformOwnerService from '../../services/platformOwner.service';
import type { TenantListItem } from '../../services/platformOwner.service';
import { useUIStore } from '../../store/ui.store';

// ─── Inline ConfirmDialog (rendered via portal, no browser dialogs) ─────────
interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel,
}) => {
    if (!isOpen) return null;
    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6 animate-scale-in border border-border">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto
                    ${danger ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                    <TriangleAlert className={`w-6 h-6 ${danger ? 'text-red-500' : 'text-amber-500'}`} />
                </div>
                <h3 className="text-lg font-semibold text-text-main text-center mb-2">{title}</h3>
                <p className="text-sm text-text-muted text-center mb-6">{message}</p>
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-text-main hover:bg-surface-hover transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors
                            ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── View Details Panel ──────────────────────────────────────────────────────
interface DetailRowProps { label: string; value: React.ReactNode; }
const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
        <span className="text-sm text-text-muted">{label}</span>
        <span className="text-sm font-medium text-text-main text-right">{value}</span>
    </div>
);

interface ViewDetailsPanelProps {
    tenant: TenantListItem | null;
    onClose: () => void;
}
const ViewDetailsPanel: React.FC<ViewDetailsPanelProps> = ({ tenant, onClose }) => {
    if (!tenant) return null;
    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md animate-scale-in border border-border">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 flex items-center justify-center text-accent-cyan font-bold text-lg">
                            {tenant.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-text-main">{tenant.name}</h2>
                            <p className="text-xs text-text-muted">@{tenant.slug}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-4">
                    <DetailRow label="Status" value={
                        <Badge variant={tenant.is_active ? 'success' : 'default'}>
                            {tenant.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                    } />
                    <DetailRow label="Total Users" value={
                        <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-text-muted opacity-50" />{tenant.users_count}
                        </span>
                    } />
                    <DetailRow label="Documents" value={
                        <span className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-text-muted opacity-50" />{tenant.documents_count}
                        </span>
                    } />
                    <DetailRow label="Queries Today" value={tenant.queries_today ?? '—'} />
                    <DetailRow label="Storage Used" value={
                        tenant.storage_used_bytes
                            ? `${(tenant.storage_used_bytes / (1024 * 1024)).toFixed(1)} MB`
                            : '0 MB'
                    } />
                    <DetailRow label="Created" value={
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-text-muted opacity-50" />
                            {new Date(tenant.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                    } />
                    <DetailRow label="Tenant ID" value={
                        <span className="font-mono text-xs text-text-muted select-all">{tenant.id}</span>
                    } />
                </div>

                <div className="px-6 pb-5">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2.5 rounded-lg bg-surface-hover hover:bg-border text-sm font-medium text-text-main transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── Inline error/feedback banner ───────────────────────────────────────────
const ActionError: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
        <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {message}
        </div>
        <button onClick={onClose} className="text-red-500/60 hover:text-red-500"><X className="w-4 h-4" /></button>
    </div>
);

// ─── Form interfaces ─────────────────────────────────────────────────────────
interface CreateTenantForm {
    name: string;
    slug: string;
    admin_email: string;
    is_active: boolean;
}

interface CredentialResult {
    tenantName: string;
    username: string;
    email: string;
    temporary_password: string;
    email_sent: boolean;
}

// ─── Confirm dialog state ────────────────────────────────────────────────────
interface ConfirmState {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => void;
}
const CLOSED_CONFIRM: ConfirmState = {
    isOpen: false, title: '', message: '', confirmLabel: 'Confirm', danger: false, onConfirm: () => { },
};

// ─── Main Component ──────────────────────────────────────────────────────────
export const PlatformTenants: React.FC = () => {
    const { addToast } = useUIStore();
    const [tenants, setTenants] = useState<TenantListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [actionError, setActionError] = useState<string | null>(null);

    // Create tenant modal
    const [modalOpen, setModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState<CreateTenantForm>({
        name: '', slug: '', admin_email: '', is_active: true,
    });
    const [formError, setFormError] = useState<string | null>(null);

    // Credentials modal (after creation)
    const [credentials, setCredentials] = useState<CredentialResult | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // View details
    const [viewTenant, setViewTenant] = useState<TenantListItem | null>(null);

    // Confirm dialog
    const [confirm, setConfirm] = useState<ConfirmState>(CLOSED_CONFIRM);

    // Action dropdown
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const loadTenants = async () => {
        try {
            const response = await platformOwnerService.getTenants();
            setTenants(response.tenants);
        } catch (error) {
            addToast('error', 'Failed to load tenants. Please refresh the page.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { loadTenants(); }, []);

    // ─ Create form ─
    const handleOpenModal = () => {
        setFormData({ name: '', slug: '', admin_email: '', is_active: true });
        setFormError(null);
        setModalOpen(true);
    };
    const handleCloseModal = () => { setModalOpen(false); setFormError(null); };

    const handleInputChange = (field: keyof CreateTenantForm, value: string | boolean) => {
        if (field === 'name' && typeof value === 'string') {
            const autoSlug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            setFormData(prev => ({ ...prev, name: value, slug: prev.slug === '' ? autoSlug : prev.slug }));
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const validateForm = (): string | null => {
        if (!formData.name.trim()) return 'Organization name is required';
        if (formData.name.trim().length > 255) return 'Name must be 255 characters or fewer';
        if (!formData.slug.trim()) return 'Slug is required';
        if (formData.slug.length < 3) return 'Slug must be at least 3 characters';
        if (formData.slug.length > 100) return 'Slug must be 100 characters or fewer';
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(formData.slug))
            return 'Slug must use lowercase letters, numbers, hyphens; cannot start or end with a hyphen';
        if (!formData.admin_email.trim()) return 'Admin email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) return 'Invalid email format';
        if (tenants.some(t => t.slug === formData.slug)) return 'A tenant with this slug already exists';
        return null;
    };

    const handleCreateTenant = async () => {
        const err = validateForm();
        if (err) { setFormError(err); return; }
        setCreating(true);
        setFormError(null);
        try {
            const result = await platformOwnerService.createTenant({
                name: formData.name,
                slug: formData.slug,
                admin_email: formData.admin_email,
            });
            const newTenant: TenantListItem = {
                id: result.id,
                name: result.name,
                slug: result.slug,
                is_active: result.is_active,
                created_at: result.created_at,
                users_count: 1,
                documents_count: 0,
                storage_used_bytes: 0,
                queries_today: 0,
            };
            setTenants(prev => [newTenant, ...prev]);
            handleCloseModal();
            setCredentials({
                tenantName: result.name,
                username: result.admin_credentials!.username,
                email: result.admin_credentials!.email,
                temporary_password: result.admin_credentials!.temporary_password,
                email_sent: result.email_sent ?? false,
            });
        } catch (error: any) {
            const data = error?.response?.data;
            let msg = 'Failed to create tenant. Please try again.';
            if (typeof data?.error === 'string') msg = data.error;
            else if (data?.errors && typeof data.errors === 'object') {
                const first = Object.values(data.errors)[0];
                if (typeof first === 'string') msg = first;
            }
            setFormError(msg);
        } finally {
            setCreating(false);
        }
    };

    const copyToClipboard = async (text: string, field: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    // ─ Action menu handlers — open custom dialog, don't use browser alert/confirm ─
    const handleViewTenant = (tenant: TenantListItem) => {
        setOpenMenuId(null);
        setViewTenant(tenant);
    };

    const handleToggleActive = (tenant: TenantListItem) => {
        setOpenMenuId(null);
        const willDeactivate = tenant.is_active;
        setConfirm({
            isOpen: true,
            title: willDeactivate ? 'Deactivate Tenant' : 'Activate Tenant',
            message: willDeactivate
                ? `Deactivating "${tenant.name}" will prevent all its users from logging in. Continue?`
                : `Reactivating "${tenant.name}" will restore access for all its users. Continue?`,
            confirmLabel: willDeactivate ? 'Deactivate' : 'Activate',
            danger: willDeactivate,
            onConfirm: async () => {
                setConfirm(CLOSED_CONFIRM);
                try {
                    await platformOwnerService.updateTenant(tenant.id, { is_active: !tenant.is_active });
                    setTenants(prev => prev.map(t =>
                        t.id === tenant.id ? { ...t, is_active: !tenant.is_active } : t
                    ));
                } catch (e: any) {
                    setActionError(e?.response?.data?.error || 'Failed to update tenant.');
                }
            },
        });
    };

    const handleDeleteTenant = (tenant: TenantListItem) => {
        setOpenMenuId(null);
        setConfirm({
            isOpen: true,
            title: 'Delete Tenant',
            message: `Permanently delete "${tenant.name}"? All data including users, documents, and configurations will be removed. This cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: async () => {
                setConfirm(CLOSED_CONFIRM);
                try {
                    await platformOwnerService.deleteTenant(tenant.id);
                    setTenants(prev => prev.filter(t => t.id !== tenant.id));
                } catch (e: any) {
                    setActionError(e?.response?.data?.error || 'Failed to delete tenant.');
                }
            },
        });
    };

    const filteredTenants = tenants.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Custom dialogs (portals) */}
            <ConfirmDialog
                {...confirm}
                onCancel={() => setConfirm(CLOSED_CONFIRM)}
            />
            <ViewDetailsPanel tenant={viewTenant} onClose={() => setViewTenant(null)} />

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Tenants Management</h1>
                    <p className="text-text-muted mt-1">Manage all organizations on the platform</p>
                </div>
                <Button variant="primary" className="flex items-center gap-2" onClick={handleOpenModal}>
                    <Plus className="w-4 h-4" />
                    Create Tenant
                </Button>
            </div>

            {/* Action error banner */}
            {actionError && (
                <ActionError message={actionError} onClose={() => setActionError(null)} />
            )}

            {/* Create Tenant Modal */}
            <Modal isOpen={modalOpen} onClose={handleCloseModal} title="Create New Tenant" size="lg">
                <div className="space-y-4">
                    {formError && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {formError}
                        </div>
                    )}
                    <Input
                        label="Organization Name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Enter organization name"
                        required
                    />
                    <div>
                        <Input
                            label="Slug / Domain"
                            value={formData.slug}
                            onChange={(e) => handleInputChange('slug', e.target.value.toLowerCase())}
                            placeholder="organization-slug"
                            required
                        />
                        <p className="text-xs text-text-muted mt-1">Lowercase letters, numbers, and hyphens only</p>
                    </div>
                    <div>
                        <Input
                            label="Admin Email"
                            type="email"
                            value={formData.admin_email}
                            onChange={(e) => handleInputChange('admin_email', e.target.value)}
                            placeholder="admin@example.com"
                            required
                        />
                        <p className="text-xs text-text-muted mt-1">
                            A temporary admin account will be created. Credentials will be shared with you after creation.
                        </p>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={handleCloseModal} disabled={creating}>Cancel</Button>
                        <Button variant="primary" onClick={handleCreateTenant} loading={creating}>Create Tenant</Button>
                    </div>
                </div>
            </Modal>

            {/* Credentials Modal */}
            <Modal
                isOpen={!!credentials}
                onClose={() => setCredentials(null)}
                title="Tenant Created Successfully"
            >
                {credentials && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-500 text-sm">
                            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                            <div>
                                <p className="font-medium">"{credentials.tenantName}" created!</p>
                                <p className="text-xs mt-0.5">
                                    {credentials.email_sent
                                        ? 'Credentials have been emailed to the admin.'
                                        : 'Email not sent — share credentials manually.'}
                                </p>
                            </div>
                        </div>
                        <p className="text-sm text-text-muted">
                            Share these temporary credentials with the admin. They should change the password on first login.
                        </p>
                        {[
                            { label: 'Username', value: credentials.username, id: 'username' },
                            { label: 'Email', value: credentials.email, id: 'email' },
                            { label: 'Temporary Password', value: credentials.temporary_password, id: 'password' },
                        ].map(({ label, value, id }) => (
                            <div key={id}>
                                <label className="block text-xs font-medium text-text-muted mb-1">{label}</label>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm font-mono text-text-main">
                                        {value}
                                    </code>
                                    <button
                                        onClick={() => copyToClipboard(value, id)}
                                        className="p-2 text-text-muted hover:text-accent-cyan transition-colors"
                                        title="Copy"
                                    >
                                        {copiedField === id
                                            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                        <div className="flex justify-end pt-2">
                            <Button variant="primary" onClick={() => setCredentials(null)}>Done</Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Search */}
            <Card variant="default">
                <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted opacity-50" />
                        <input
                            type="text"
                            placeholder="Search tenants..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-surface text-text-main text-sm focus:ring-2 focus:ring-accent-cyan focus:border-transparent outline-none"
                        />
                    </div>
                    <span className="text-sm text-text-muted shrink-0">
                        {filteredTenants.length} of {tenants.length}
                    </span>
                </div>
            </Card>

            {/* Tenants List */}
            {loading ? (
                <Card variant="default">
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-cyan mx-auto" />
                        <p className="text-text-muted mt-4">Loading tenants...</p>
                    </div>
                </Card>
            ) : (
                <div className="grid gap-4" ref={menuRef}>
                    {filteredTenants.map((tenant) => (
                        <Card key={tenant.id} hover variant="default">
                            <div className="flex items-center justify-between">
                                {/* Left: identity */}
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-12 h-12 rounded-xl bg-accent-cyan/10 flex items-center justify-center flex-shrink-0 text-accent-cyan font-bold text-lg">
                                        {tenant.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-base font-semibold text-text-main truncate">{tenant.name}</h3>
                                        <p className="text-sm text-text-muted">@{tenant.slug}</p>
                                    </div>
                                </div>

                                {/* Right: stats + actions */}
                                <div className="flex items-center gap-5 flex-shrink-0 ml-4">
                                    {/* Users */}
                                    <div className="text-center hidden sm:block">
                                        <div className="flex items-center gap-1 text-text-muted justify-center">
                                            <Users className="w-4 h-4 opacity-70" />
                                            <span className="text-sm font-semibold">{tenant.users_count}</span>
                                        </div>
                                        <p className="text-xs text-text-muted opacity-50">Users</p>
                                    </div>

                                    {/* Documents */}
                                    <div className="text-center hidden sm:block">
                                        <div className="flex items-center gap-1 text-text-muted justify-center">
                                            <FileText className="w-4 h-4 opacity-70" />
                                            <span className="text-sm font-semibold">{tenant.documents_count}</span>
                                        </div>
                                        <p className="text-xs text-text-muted opacity-50">Docs</p>
                                    </div>

                                    {/* Status badge */}
                                    <Badge variant={tenant.is_active ? 'success' : 'default'}>
                                        {tenant.is_active ? 'Active' : 'Inactive'}
                                    </Badge>

                                    {/* ── Action Menu ── */}
                                    <div className="relative">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuId(openMenuId === tenant.id ? null : tenant.id);
                                            }}
                                            className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
                                            aria-label="Actions"
                                        >
                                            <MoreVertical className="w-5 h-5" />
                                        </button>

                                        {openMenuId === tenant.id && (
                                            <div className="absolute right-0 mt-1 w-48 bg-surface rounded-xl shadow-lg border border-border z-50 py-1.5 animate-fade-in">
                                                {/* View Details */}
                                                <button
                                                    onClick={() => handleViewTenant(tenant)}
                                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-text-main hover:bg-surface-hover transition-colors"
                                                >
                                                    <Eye className="w-4 h-4 text-text-muted" />
                                                    View Details
                                                </button>

                                                {/* Activate / Deactivate */}
                                                <button
                                                    onClick={() => handleToggleActive(tenant)}
                                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-text-main hover:bg-surface-hover transition-colors"
                                                >
                                                    {tenant.is_active
                                                        ? <PowerOff className="w-4 h-4 text-amber-500" />
                                                        : <Power className="w-4 h-4 text-green-500" />}
                                                    {tenant.is_active ? 'Deactivate' : 'Activate'}
                                                </button>

                                                <hr className="my-1 border-border" />

                                                {/* Delete */}
                                                <button
                                                    onClick={() => handleDeleteTenant(tenant)}
                                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Delete Tenant
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}

                    {filteredTenants.length === 0 && (
                        <Card variant="default">
                            <div className="text-center py-12">
                                <AlertCircle className="w-12 h-12 text-text-muted opacity-30 mx-auto mb-4" />
                                <p className="text-text-main font-medium">No tenants found</p>
                                {searchTerm && (
                                    <p className="text-sm text-text-muted mt-1">
                                        Try a different search term or <button
                                            onClick={() => setSearchTerm('')}
                                            className="text-accent-cyan underline"
                                        >clear the search</button>.
                                    </p>
                                )}
                            </div>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
};
