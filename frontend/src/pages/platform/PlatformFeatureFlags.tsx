import React, { useEffect, useState } from 'react';
import { ToggleLeft, Plus, ChevronDown, ChevronUp, Trash2, Building2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Switch } from '../../components/ui/Switch';
import { Spinner } from '../../components/ui/Spinner';
import platformOwnerService from '../../services/platformOwner.service';
import type {
    FeatureFlag,
    TenantFeatureFlag,
    TenantListItem,
} from '../../services/platformOwner.service';

export const PlatformFeatureFlags: React.FC = () => {
    const [flags, setFlags] = useState<FeatureFlag[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [overrides, setOverrides] = useState<TenantFeatureFlag[]>([]);
    const [overridesLoading, setOverridesLoading] = useState(false);

    // Create flag modal
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ key: '', name: '', description: '', default_enabled: false });
    const [saving, setSaving] = useState(false);

    // Add override modal
    const [showOverride, setShowOverride] = useState(false);
    const [overrideFlag, setOverrideFlag] = useState<string>('');
    const [tenants, setTenants] = useState<TenantListItem[]>([]);
    const [overrideForm, setOverrideForm] = useState({ tenant_id: '', enabled: true, reason: '' });

    const fetchFlags = async () => {
        setLoading(true);
        try {
            const data = await platformOwnerService.getFeatureFlags();
            setFlags(data);
        } catch {
            setError('Failed to load feature flags');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchFlags(); }, []);

    const toggleExpand = async (key: string) => {
        if (expandedKey === key) {
            setExpandedKey(null);
            return;
        }
        setExpandedKey(key);
        setOverridesLoading(true);
        try {
            const data = await platformOwnerService.getFeatureFlagTenants(key);
            setOverrides(data);
        } catch {
            setOverrides([]);
        } finally {
            setOverridesLoading(false);
        }
    };

    const handleToggleFlag = async (flag: FeatureFlag) => {
        try {
            await platformOwnerService.updateFeatureFlag(flag.key, {
                default_enabled: !flag.default_enabled,
            });
            setFlags(prev => prev.map(f => f.key === flag.key ? { ...f, default_enabled: !f.default_enabled } : f));
        } catch {
            setError('Failed to update flag');
        }
    };

    const handleToggleActive = async (flag: FeatureFlag) => {
        try {
            await platformOwnerService.updateFeatureFlag(flag.key, {
                is_active: !flag.is_active,
            });
            setFlags(prev => prev.map(f => f.key === flag.key ? { ...f, is_active: !f.is_active } : f));
        } catch {
            setError('Failed to update flag');
        }
    };

    const handleCreate = async () => {
        setSaving(true);
        try {
            await platformOwnerService.createFeatureFlag(createForm);
            setShowCreate(false);
            setCreateForm({ key: '', name: '', description: '', default_enabled: false });
            fetchFlags();
        } catch {
            setError('Failed to create flag');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (key: string) => {
        if (!confirm(`Delete feature flag "${key}"?`)) return;
        try {
            await platformOwnerService.deleteFeatureFlag(key);
            fetchFlags();
        } catch {
            setError('Failed to delete flag');
        }
    };

    const openOverrideModal = async (flagKey: string) => {
        setOverrideFlag(flagKey);
        setOverrideForm({ tenant_id: '', enabled: true, reason: '' });
        try {
            const resp = await platformOwnerService.getTenants();
            setTenants(resp.tenants);
        } catch {
            setTenants([]);
        }
        setShowOverride(true);
    };

    const handleAddOverride = async () => {
        setSaving(true);
        try {
            await platformOwnerService.setFeatureFlagOverride(
                overrideFlag,
                overrideForm.tenant_id,
                overrideForm.enabled,
                overrideForm.reason,
            );
            setShowOverride(false);
            // Refresh overrides
            const data = await platformOwnerService.getFeatureFlagTenants(overrideFlag);
            setOverrides(data);
            fetchFlags();
        } catch {
            setError('Failed to set override');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveOverride = async (flagKey: string, tenantId: string) => {
        try {
            await platformOwnerService.removeFeatureFlagOverride(flagKey, tenantId);
            setOverrides(prev => prev.filter(o => o.tenant !== tenantId));
            fetchFlags();
        } catch {
            setError('Failed to remove override');
        }
    };

    if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-text-main">Feature Flags</h1>
                    <p className="text-text-muted mt-1">Control feature availability across tenants and plans</p>
                </div>
                <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
                    New Flag
                </Button>
            </div>

            {error && <div className="p-3 bg-red-500/10 text-red-500 rounded-lg text-sm">{error}</div>}

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-brand/10 flex items-center justify-center">
                            <ToggleLeft className="w-6 h-6 text-brand" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Total Flags</p>
                            <p className="text-2xl font-bold text-text-main">{flags.length}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <ToggleLeft className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Enabled by Default</p>
                            <p className="text-2xl font-bold text-text-main">{flags.filter(f => f.default_enabled).length}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-orange-500" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">With Overrides</p>
                            <p className="text-2xl font-bold text-text-main">{flags.filter(f => f.override_count > 0).length}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Flags List */}
            <Card>
                <div className="space-y-2">
                    {flags.length === 0 ? (
                        <p className="text-text-muted text-center py-8">No feature flags configured.</p>
                    ) : flags.map(flag => (
                        <div key={flag.key} className="border border-border rounded-lg">
                            <div className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-4 flex-1">
                                    <Switch
                                        checked={flag.default_enabled}
                                        onChange={() => handleToggleFlag(flag)}
                                        size="sm"
                                    />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-text-main">{flag.name}</span>
                                            <code className="text-xs bg-surface-hover px-1.5 py-0.5 rounded text-text-muted">{flag.key}</code>
                                            {!flag.is_active && <Badge variant="warning" size="sm">Inactive</Badge>}
                                        </div>
                                        <p className="text-sm text-text-muted mt-0.5">{flag.description}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {flag.override_count > 0 && (
                                        <Badge variant="info" size="sm">{flag.override_count} override{flag.override_count > 1 ? 's' : ''}</Badge>
                                    )}
                                    {Object.keys(flag.plan_gates).length > 0 && (
                                        <Badge variant="brand" size="sm">{Object.keys(flag.plan_gates).length} plan gate{Object.keys(flag.plan_gates).length > 1 ? 's' : ''}</Badge>
                                    )}
                                    <Button variant="ghost" size="sm" onClick={() => handleToggleActive(flag)}>
                                        {flag.is_active ? 'Deactivate' : 'Activate'}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(flag.key)}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => toggleExpand(flag.key)}>
                                        {expandedKey === flag.key ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </div>

                            {expandedKey === flag.key && (
                                <div className="border-t border-border p-4 bg-surface-hover">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-medium text-text-main">Tenant Overrides</h4>
                                        <Button variant="outline" size="sm" onClick={() => openOverrideModal(flag.key)}>
                                            <Plus className="w-3 h-3 mr-1" /> Add Override
                                        </Button>
                                    </div>
                                    {overridesLoading ? (
                                        <div className="flex justify-center py-4"><Spinner /></div>
                                    ) : overrides.length === 0 ? (
                                        <p className="text-sm text-text-muted text-center py-4">No tenant overrides. Default applies to all.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {overrides.map(o => (
                                                <div key={o.id} className="flex items-center justify-between p-3 bg-surface rounded border border-border">
                                                    <div>
                                                        <span className="font-medium text-sm text-text-main">{o.tenant_name}</span>
                                                        <Badge variant={o.enabled ? 'success' : 'error'} size="sm" className="ml-2">
                                                            {o.enabled ? 'Enabled' : 'Disabled'}
                                                        </Badge>
                                                        {o.reason && <span className="text-xs text-text-muted ml-2">({o.reason})</span>}
                                                    </div>
                                                    <Button variant="ghost" size="sm" onClick={() => handleRemoveOverride(flag.key, o.tenant)}>
                                                        <Trash2 className="w-3 h-3 text-red-500" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Plan Gates */}
                                    {Object.keys(flag.plan_gates).length > 0 && (
                                        <div className="mt-4">
                                            <h4 className="text-sm font-medium text-text-main mb-2">Plan Gates</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {Object.entries(flag.plan_gates).map(([plan, enabled]) => (
                                                    <Badge key={plan} variant={enabled ? 'success' : 'default'} size="sm">
                                                        {plan}: {enabled ? 'Yes' : 'No'}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </Card>

            {/* Create Flag Modal */}
            <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Feature Flag" size="md">
                <div className="space-y-4">
                    <Input label="Key (snake_case)" value={createForm.key} onChange={e => setCreateForm(f => ({ ...f, key: e.target.value }))} placeholder="e.g. advanced_export" />
                    <Input label="Display Name" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
                    <Input label="Description" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} />
                    <Switch
                        checked={createForm.default_enabled}
                        onChange={val => setCreateForm(f => ({ ...f, default_enabled: val }))}
                        label="Enabled by default"
                        description="When enabled, all tenants get this feature unless overridden"
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button variant="primary" loading={saving} onClick={handleCreate}>Create Flag</Button>
                    </div>
                </div>
            </Modal>

            {/* Add Override Modal */}
            <Modal isOpen={showOverride} onClose={() => setShowOverride(false)} title="Add Tenant Override" size="md">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-main mb-1">Tenant</label>
                        <select
                            className="w-full border border-border bg-surface text-text-main focus:outline-none focus:ring-2 focus:ring-accent-cyan rounded-lg px-3 py-2 text-sm"
                            value={overrideForm.tenant_id}
                            onChange={e => setOverrideForm(f => ({ ...f, tenant_id: e.target.value }))}
                        >
                            <option value="">Select a tenant...</option>
                            {tenants.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                    <Switch
                        checked={overrideForm.enabled}
                        onChange={val => setOverrideForm(f => ({ ...f, enabled: val }))}
                        label="Feature enabled"
                        description="Override the default for this tenant"
                    />
                    <Input label="Reason (optional)" value={overrideForm.reason} onChange={e => setOverrideForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Beta participant" />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setShowOverride(false)}>Cancel</Button>
                        <Button variant="primary" loading={saving} onClick={handleAddOverride} disabled={!overrideForm.tenant_id}>
                            Set Override
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
