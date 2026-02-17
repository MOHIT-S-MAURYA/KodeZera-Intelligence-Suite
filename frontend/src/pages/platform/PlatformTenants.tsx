import React, { useEffect, useState } from 'react';
import { Building2, Plus, Search, MoreVertical, Users, FileText, CreditCard, AlertCircle } from 'lucide-react';
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
    plan: string;
    is_active: boolean;
}

export const PlatformTenants: React.FC = () => {
    const [tenants, setTenants] = useState<TenantListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState<CreateTenantForm>({
        name: '',
        slug: '',
        admin_email: '',
        plan: 'basic',
        is_active: true,
    });

    useEffect(() => {
        loadTenants();
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

    const handleOpenModal = () => {
        setFormData({
            name: '',
            slug: '',
            admin_email: '',
            plan: 'basic',
            is_active: true,
        });
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        setModalOpen(false);
        setFormData({
            name: '',
            slug: '',
            admin_email: '',
            plan: 'basic',
            is_active: true,
        });
    };

    const handleInputChange = (field: keyof CreateTenantForm, value: string | boolean) => {
        if (field === 'name' && typeof value === 'string') {
            // Auto-generate slug from name
            const autoSlug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            setFormData(prev => ({
                ...prev,
                name: value,
                // Auto-update slug only if it's currently empty or was auto-generated
                slug: prev.slug === '' ? autoSlug : prev.slug
            }));
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const validateForm = (): string | null => {
        if (!formData.name.trim()) return 'Organization name is required';
        if (!formData.slug.trim()) return 'Slug is required';
        if (!/^[a-z0-9-]+$/.test(formData.slug)) return 'Slug must contain only lowercase letters, numbers, and hyphens';
        if (!formData.admin_email.trim()) return 'Admin email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) return 'Invalid email format';

        // Check for duplicate slug
        if (tenants.some(t => t.slug === formData.slug)) {
            return 'A tenant with this slug already exists';
        }

        return null;
    };

    const handleCreateTenant = async () => {
        const error = validateForm();
        if (error) {
            alert(error);
            return;
        }

        setCreating(true);
        try {
            // TODO: Call backend API when endpoint is available
            // await platformOwnerService.createTenant(formData);

            // For now, add to local state
            const newTenant: TenantListItem = {
                id: `temp-${Date.now()}`,
                name: formData.name,
                slug: formData.slug,
                is_active: formData.is_active,
                created_at: new Date().toISOString(),
                users_count: 0,
                documents_count: 0,
                plan: formData.plan,
                subscription_status: 'active',
                storage_used_bytes: 0,
                queries_today: 0,
            };

            setTenants([newTenant, ...tenants]);
            handleCloseModal();

            // Show success message
            alert(`Tenant "${formData.name}" created successfully!`);
        } catch (error) {
            console.error('Failed to create tenant:', error);
            alert('Failed to create tenant. Please try again.');
        } finally {
            setCreating(false);
        }
    };

    const filteredTenants = tenants.filter(tenant =>
        tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.slug.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'success';
            case 'trial': return 'info';
            case 'suspended': return 'warning';
            case 'cancelled': return 'error';
            default: return 'default';
        }
    };

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

            {/* Create Tenant Modal */}
            <Modal isOpen={modalOpen} onClose={handleCloseModal} title="Create New Tenant" size="lg">
                <div className="space-y-4">
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
                            onChange={(e) => handleInputChange('slug', e.target.value)}
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

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Subscription Plan
                        </label>
                        <select
                            value={formData.plan}
                            onChange={(e) => handleInputChange('plan', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        >
                            <option value="basic">Basic</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="is_active"
                            checked={formData.is_active}
                            onChange={(e) => handleInputChange('is_active', e.target.checked)}
                            className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-2 focus:ring-brand-500"
                        />
                        <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                            Active (tenant can access the platform)
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={handleCloseModal} disabled={creating}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleCreateTenant} loading={creating}>
                            Create Tenant
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Search and Filters */}
            <Card>
                <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search tenants..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </Card>

            {/* Tenants List */}
            {loading ? (
                <Card>
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
                        <p className="text-gray-600 mt-4">Loading tenants...</p>
                    </div>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {filteredTenants.map((tenant) => (
                        <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                                        <Building2 className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">{tenant.name}</h3>
                                        <p className="text-sm text-gray-500">@{tenant.slug}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-center">
                                        <div className="flex items-center gap-1 text-gray-600">
                                            <Users className="w-4 h-4" />
                                            <span className="text-sm font-medium">{tenant.users_count}</span>
                                        </div>
                                        <p className="text-xs text-gray-500">Users</p>
                                    </div>

                                    <div className="text-center">
                                        <div className="flex items-center gap-1 text-gray-600">
                                            <FileText className="w-4 h-4" />
                                            <span className="text-sm font-medium">{tenant.documents_count}</span>
                                        </div>
                                        <p className="text-xs text-gray-500">Documents</p>
                                    </div>

                                    <div className="text-center">
                                        <div className="flex items-center gap-1 text-gray-600">
                                            <CreditCard className="w-4 h-4" />
                                            <span className="text-sm font-medium">{tenant.plan || 'No Plan'}</span>
                                        </div>
                                        <p className="text-xs text-gray-500">Plan</p>
                                    </div>

                                    <Badge variant={getStatusColor(tenant.subscription_status) as any}>
                                        {tenant.subscription_status}
                                    </Badge>

                                    <button className="text-gray-400 hover:text-gray-600">
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
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
            )}
        </div>
    );
};
