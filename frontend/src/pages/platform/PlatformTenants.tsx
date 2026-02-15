import React, { useEffect, useState } from 'react';
import { Building2, Plus, Search, MoreVertical, Users, FileText, CreditCard, AlertCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import platformOwnerService from '../../services/platformOwner.service';
import type { TenantListItem } from '../../services/platformOwner.service';

export const PlatformTenants: React.FC = () => {
    const [tenants, setTenants] = useState<TenantListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

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
                <Button variant="primary" className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Create Tenant
                </Button>
            </div>

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
