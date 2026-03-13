import React, { useEffect, useState } from 'react';
import { CreditCard, TrendingUp, DollarSign, Plus, Edit2, Trash2, Users } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import platformOwnerService, {
    SubscriptionPlan,
    TenantSubscription,
} from '../../services/platformOwner.service';

export const PlatformSubscriptions: React.FC = () => {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [subscriptions, setSubscriptions] = useState<TenantSubscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [form, setForm] = useState({
        name: '',
        plan_type: 'starter',
        price: '',
        max_users: '10',
        max_documents: '100',
        max_storage_gb: '5',
        max_queries_per_month: '1000',
        max_tokens_per_month: '100000',
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [p, s] = await Promise.all([
                platformOwnerService.getSubscriptionPlans(),
                platformOwnerService.getTenantSubscriptions(),
            ]);
            setPlans(p);
            setSubscriptions(s);
        } catch {
            setError('Failed to load subscription data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const openCreate = () => {
        setEditingPlan(null);
        setForm({ name: '', plan_type: 'starter', price: '', max_users: '10', max_documents: '100', max_storage_gb: '5', max_queries_per_month: '1000', max_tokens_per_month: '100000' });
        setShowPlanModal(true);
    };

    const openEdit = (plan: SubscriptionPlan) => {
        setEditingPlan(plan);
        setForm({
            name: plan.name,
            plan_type: plan.plan_type,
            price: plan.price,
            max_users: String(plan.max_users),
            max_documents: String(plan.max_documents),
            max_storage_gb: String(plan.max_storage_gb),
            max_queries_per_month: String(plan.max_queries_per_month),
            max_tokens_per_month: String(plan.max_tokens_per_month),
        });
        setShowPlanModal(true);
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            const payload = {
                name: form.name,
                plan_type: form.plan_type,
                price: form.price,
                max_users: parseInt(form.max_users),
                max_documents: parseInt(form.max_documents),
                max_storage_gb: parseInt(form.max_storage_gb),
                max_queries_per_month: parseInt(form.max_queries_per_month),
                max_tokens_per_month: parseInt(form.max_tokens_per_month),
            };
            if (editingPlan) {
                await platformOwnerService.updateSubscriptionPlan(editingPlan.id, payload);
            } else {
                await platformOwnerService.createSubscriptionPlan(payload);
            }
            setShowPlanModal(false);
            fetchData();
        } catch {
            setError('Failed to save plan');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (plan: SubscriptionPlan) => {
        if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
        try {
            await platformOwnerService.deleteSubscriptionPlan(plan.id);
            fetchData();
        } catch {
            setError('Cannot delete plan with active subscribers');
        }
    };

    const activeCount = subscriptions.filter(s => s.status === 'active').length;
    const totalRevenue = plans.reduce((sum, p) => {
        const subs = subscriptions.filter(s => s.plan === p.id && s.status === 'active').length;
        return sum + subs * parseFloat(p.price || '0');
    }, 0);

    const planTypeColors: Record<string, 'default' | 'info' | 'warning' | 'success' | 'brand'> = {
        trial: 'default', starter: 'info', professional: 'warning', enterprise: 'success', custom: 'brand',
    };

    if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Subscriptions & Billing</h1>
                    <p className="text-gray-600 mt-1">Manage subscription plans and tenant subscriptions</p>
                </div>
                <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
                    New Plan
                </Button>
            </div>

            {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

            {/* Revenue Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                            <DollarSign className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Est. Monthly Revenue</p>
                            <p className="text-2xl font-bold text-gray-900">${totalRevenue.toFixed(2)}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Active Subscriptions</p>
                            <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                            <CreditCard className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Total Plans</p>
                            <p className="text-2xl font-bold text-gray-900">{plans.length}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Subscription Plans */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Subscription Plans</h2>
                <div className="space-y-4">
                    {plans.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">No plans configured. Create your first plan.</p>
                    ) : plans.map(plan => (
                        <div key={plan.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                                    <Badge variant={planTypeColors[plan.plan_type] || 'default'}>{plan.plan_type}</Badge>
                                    {!plan.is_active && <Badge variant="warning">Inactive</Badge>}
                                </div>
                                <div className="mt-1 text-sm text-gray-600 flex gap-4">
                                    <span>${plan.price}/mo</span>
                                    <span>{plan.max_users} users</span>
                                    <span>{plan.max_documents} docs</span>
                                    <span>{plan.max_storage_gb} GB</span>
                                    <span>{plan.max_queries_per_month.toLocaleString()} queries/mo</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-sm text-gray-500">
                                    <Users className="w-4 h-4" />
                                    <span>{plan.subscriber_count}</span>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => openEdit(plan)}>
                                    <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(plan)}>
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Tenant Subscriptions */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Tenant Subscriptions</h2>
                {subscriptions.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No subscriptions yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-gray-500">
                                    <th className="py-2 pr-4">Tenant</th>
                                    <th className="py-2 pr-4">Plan</th>
                                    <th className="py-2 pr-4">Status</th>
                                    <th className="py-2 pr-4">Period End</th>
                                </tr>
                            </thead>
                            <tbody>
                                {subscriptions.map(sub => (
                                    <tr key={sub.id} className="border-b last:border-0">
                                        <td className="py-3 pr-4 font-medium">{sub.tenant_name}</td>
                                        <td className="py-3 pr-4">
                                            <Badge variant={planTypeColors[sub.plan_type] || 'default'}>{sub.plan_name}</Badge>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <Badge variant={sub.status === 'active' ? 'success' : sub.status === 'trialing' ? 'info' : 'warning'}>
                                                {sub.status}
                                            </Badge>
                                        </td>
                                        <td className="py-3 pr-4 text-gray-600">
                                            {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Plan Modal */}
            <Modal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} title={editingPlan ? 'Edit Plan' : 'Create Plan'} size="lg">
                <div className="space-y-4">
                    <Input label="Plan Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Plan Type</label>
                        <select
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            value={form.plan_type}
                            onChange={e => setForm(f => ({ ...f, plan_type: e.target.value }))}
                        >
                            <option value="trial">Trial</option>
                            <option value="starter">Starter</option>
                            <option value="professional">Professional</option>
                            <option value="enterprise">Enterprise</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>
                    <Input label="Price ($/month)" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Max Users" type="number" value={form.max_users} onChange={e => setForm(f => ({ ...f, max_users: e.target.value }))} />
                        <Input label="Max Documents" type="number" value={form.max_documents} onChange={e => setForm(f => ({ ...f, max_documents: e.target.value }))} />
                        <Input label="Max Storage (GB)" type="number" value={form.max_storage_gb} onChange={e => setForm(f => ({ ...f, max_storage_gb: e.target.value }))} />
                        <Input label="Max Queries/Month" type="number" value={form.max_queries_per_month} onChange={e => setForm(f => ({ ...f, max_queries_per_month: e.target.value }))} />
                        <Input label="Max Tokens/Month" type="number" value={form.max_tokens_per_month} onChange={e => setForm(f => ({ ...f, max_tokens_per_month: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setShowPlanModal(false)}>Cancel</Button>
                        <Button variant="primary" loading={saving} onClick={handleSave}>
                            {editingPlan ? 'Update Plan' : 'Create Plan'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
