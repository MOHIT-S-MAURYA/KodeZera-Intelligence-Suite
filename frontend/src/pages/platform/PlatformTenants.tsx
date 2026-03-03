import React, { useEffect, useRef, useState } from 'react';
import {
    Building2, Plus, Search, MoreVertical, Users, FileText,
    AlertCircle, Eye, Pencil, Trash2, Copy, CheckCircle2
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import platformOwnerService from '../../services/platformOwner.service';
import type { TenantListItem } from '../../services/platformOwner.service';

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

export const PlatformTenants: React.FC = () => {
    const [tenants, setTenants] = useState<TenantListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState<CreateTenantForm>({
        name: '', slug: '', admin_email: '', is_active: true,
    });
    const [formError, setFormError] = useState<string | null>(null);

    // Credentials modal state (shown after successful creation)
    const [credentials, setCredentials] = useState<CredentialResult | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // Action menu state
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close action menu on outside click
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
            console.error('Failed to load tenants:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadTenants(); }, []);

    const handleOpenModal = () => {
        setFormData({ name: '', slug: '', admin_email: '', is_active: true });
        setFormError(null);
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        setModalOpen(false);
        setFormError(null);
    };

    const handleInputChange = (field: keyof CreateTenantForm, value: string | boolean) => {
        if (field === 'name' && typeof value === 'string') {
            const autoSlug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            setFormData(prev => ({
                ...prev, name: value,
                slug: prev.slug === '' ? autoSlug : prev.slug,
            }));
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const validateForm = (): string | null => {
        if (!formData.name.trim()) return 'Organization name is required';
        if (formData.name.trim().length > 255) return 'Organization name must be 255 characters or fewer';
        if (!formData.slug.trim()) return 'Slug is required';
        if (formData.slug.length < 3) return 'Slug must be at least 3 characters';
        if (formData.slug.length > 100) return 'Slug must be 100 characters or fewer';
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(formData.slug))
            return 'Slug must contain only lowercase letters, numbers, and hyphens; cannot start or end with a hyphen';
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

            // Instant UI update — prepend the new tenant without a full reload
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

            // Close form and show credentials modal
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
            // Backend returns either {error: 'string'} or {errors: {field: 'msg'}}
            let msg = 'Failed to create tenant. Please try again.';
            if (typeof data?.error === 'string') {
                msg = data.error;
            } else if (data?.errors && typeof data.errors === 'object') {
                // Show the first field-level error message from the validation object
                const firstMsg = Object.values(data.errors)[0];
                if (typeof firstMsg === 'string') msg = firstMsg;
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

    // --- Action menu handlers ---
    const handleViewTenant = (tenant: TenantListItem) => {
        setOpenMenuId(null);
        alert(`Tenant: ${tenant.name}\nSlug: ${tenant.slug}\nUsers: ${tenant.users_count}\nStatus: ${tenant.is_active ? 'Active' : 'Inactive'}`);
    };

    const handleToggleActive = async (tenant: TenantListItem) => {
        setOpenMenuId(null);
        const action = tenant.is_active ? 'deactivate' : 'activate';
        if (!confirm(`Are you sure you want to ${action} "${tenant.name}"?`)) return;
        try {
            // PATCH is_active via the existing endpoint (extend if needed)
            await platformOwnerService.updateTenant(tenant.id, { is_active: !tenant.is_active });
            setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, is_active: !tenant.is_active } : t));
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to update tenant.');
        }
    };

    const handleDeleteTenant = async (tenant: TenantListItem) => {
        setOpenMenuId(null);
        if (!confirm(`Are you sure you want to permanently delete "${tenant.name}"? This cannot be undone.`)) return;
        try {
            await platformOwnerService.deleteTenant(tenant.id);
            setTenants(prev => prev.filter(t => t.id !== tenant.id));
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Failed to delete tenant.');
        }
    };

    const filteredTenants = tenants.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchTerm.toLowerCase())
    );


    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Tenants Management</h1>
                    <p className="text-gray-600 mt-1">Manage all organizations on the platform</p>
                </div>
                <Button variant="primary" className="flex items-center gap-2" onClick={handleOpenModal}>
                    <Plus className="w-4 h-4" />
                    Create Tenant
                </Button>
            </div>

            {/* ── Create Tenant Modal ── */}
            <Modal isOpen={modalOpen} onClose={handleCloseModal} title="Create New Tenant" size="lg">
                <div className="space-y-4">
                    {formError && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
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
                        <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and hyphens only</p>
                    </div>

                    <Input
                        label="Admin Email"
                        type="email"
                        value={formData.admin_email}
                        onChange={(e) => handleInputChange('admin_email', e.target.value)}
                        placeholder="admin@example.com"
                        required
                    />
                    <p className="text-xs text-gray-500 -mt-2">
                        A temporary admin account will be created and credentials sent to this email.
                    </p>


                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={handleCloseModal} disabled={creating}>Cancel</Button>
                        <Button variant="primary" onClick={handleCreateTenant} loading={creating}>Create Tenant</Button>
                    </div>
                </div>
            </Modal>

            {/* ── Credentials Modal (shown after successful creation) ── */}
            < Modal
                isOpen={!!credentials}
                onClose={() => setCredentials(null)}
                title="Tenant Created Successfully"
            >
                {credentials && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                            <div>
                                <p className="font-medium">"{credentials.tenantName}" created!</p>
                                <p className="text-xs mt-0.5">
                                    {credentials.email_sent
                                        ? 'Credentials have been emailed to the admin.'
                                        : 'Email could not be sent — please share credentials manually.'}
                                </p>
                            </div>
                        </div>

                        <p className="text-sm text-gray-600">
                            Please share these temporary credentials with the admin user. They should change the password on first login.
                        </p>

                        {[
                            { label: 'Username', value: credentials.username, id: 'username' },
                            { label: 'Email', value: credentials.email, id: 'email' },
                            { label: 'Temporary Password', value: credentials.temporary_password, id: 'password' },
                        ].map(({ label, value, id }) => (
                            <div key={id}>
                                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm font-mono text-gray-800">
                                        {value}
                                    </code>
                                    <button
                                        onClick={() => copyToClipboard(value, id)}
                                        className="p-2 text-gray-500 hover:text-brand-600 transition-colors"
                                        title="Copy"
                                    >
                                        {copiedField === id ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        ))}

                        <div className="flex justify-end pt-2">
                            <Button variant="primary" onClick={() => setCredentials(null)}>Done</Button>
                        </div>
                    </div>
                )}
            </Modal >

            {/* Search */}
            < Card >
                <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search tenants..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                        />
                    </div>
                </div>
            </Card >

            {/* Tenants List */}
            {
                loading ? (
                    <Card>
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto" />
                            <p className="text-gray-600 mt-4">Loading tenants...</p>
                        </div>
                    </Card>
                ) : (
                    <div className="grid gap-4" ref={menuRef}>
                        {filteredTenants.map((tenant) => (
                            <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center flex-shrink-0">
                                            <Building2 className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900">{tenant.name}</h3>
                                            <p className="text-sm text-gray-500">@{tenant.slug}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className="text-center hidden sm:block">
                                            <div className="flex items-center gap-1 text-gray-600">
                                                <Users className="w-4 h-4" />
                                                <span className="text-sm font-medium">{tenant.users_count}</span>
                                            </div>
                                            <p className="text-xs text-gray-500">Users</p>
                                        </div>

                                        <div className="text-center hidden sm:block">
                                            <div className="flex items-center gap-1 text-gray-600">
                                                <FileText className="w-4 h-4" />
                                                <span className="text-sm font-medium">{tenant.documents_count}</span>
                                            </div>
                                            <p className="text-xs text-gray-500">Documents</p>
                                        </div>

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
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                                aria-label="Actions"
                                            >
                                                <MoreVertical className="w-5 h-5" />
                                            </button>

                                            {openMenuId === tenant.id && (
                                                <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1">
                                                    <button
                                                        onClick={() => handleViewTenant(tenant)}
                                                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        <Eye className="w-4 h-4" /> View Details
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleActive(tenant)}
                                                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                        {tenant.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    <hr className="my-1 border-gray-100" />
                                                    <button
                                                        onClick={() => handleDeleteTenant(tenant)}
                                                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="w-4 h-4" /> Delete Tenant
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))}

                        {filteredTenants.length === 0 && (
                            <Card>
                                <div className="text-center py-12">
                                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                    <p className="text-gray-600">No tenants found</p>
                                </div>
                            </Card>
                        )}
                    </div>
                )
            }
        </div >
    );
};
