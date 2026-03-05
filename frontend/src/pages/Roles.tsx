import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, RefreshCw, Users as UsersIcon, Shield, Lock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { roleService } from '../services/role.service';
import { getApiError } from '../utils/errors';
import type {
    RoleRecord,
    CreateRolePayload,
    UpdateRolePayload,
} from '../services/role.service';
import type { AxiosError } from 'axios';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
    name:        string;
    description: string;
    parent:      string;   // UUID or ''
}

const EMPTY_FORM: FormState = { name: '', description: '', parent: '' };

// ── Skeleton card ─────────────────────────────────────────────────────────────

const SkeletonCard: React.FC = () => (
    <Card>
        <CardHeader>
            <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-lg bg-gray-200 animate-pulse" />
            </div>
        </CardHeader>
        <CardContent>
            <div className="h-5 bg-gray-200 rounded animate-pulse mb-2 w-3/4" />
            <div className="h-4 bg-gray-100 rounded animate-pulse mb-3 w-full" />
            <div className="h-6 bg-gray-100 rounded animate-pulse w-1/2" />
        </CardContent>
    </Card>
);

// ── Main component ────────────────────────────────────────────────────────────

export const Roles: React.FC = () => {
    const [roles, setRoles]     = useState<RoleRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);
    const [search, setSearch]   = useState('');
    const [saving, setSaving]   = useState(false);

    // Modal state
    const [modalOpen, setModalOpen]   = useState(false);
    const [editTarget, setEditTarget] = useState<RoleRecord | null>(null);
    const [form, setForm]             = useState<FormState>(EMPTY_FORM);
    const [formError, setFormError]   = useState<string | null>(null);

    // ── Data loading ──────────────────────────────────────────────────────────

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await roleService.getAll();
            setRoles(data);
        } catch (err) {
            setError(getApiError(err, 'Failed to load roles. Check your connection and try again.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Filtered list ─────────────────────────────────────────────────────────

    const filtered = roles.filter((r) => {
        const q = search.toLowerCase();
        return (
            r.name.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q) ||
            (r.parent_name ?? '').toLowerCase().includes(q)
        );
    });

    // ── Modal helpers ─────────────────────────────────────────────────────────

    const openCreate = () => {
        setEditTarget(null);
        setForm(EMPTY_FORM);
        setFormError(null);
        setModalOpen(true);
    };

    const openEdit = (role: RoleRecord) => {
        setEditTarget(role);
        setForm({ name: role.name, description: role.description, parent: role.parent ?? '' });
        setFormError(null);
        setModalOpen(true);
    };

    const closeModal = () => {
        if (saving) return;
        setModalOpen(false);
        setEditTarget(null);
        setForm(EMPTY_FORM);
        setFormError(null);
    };

    // ── Save (create / update) ────────────────────────────────────────────────

    const handleSave = async () => {
        if (!form.name.trim()) { setFormError('Role name is required.'); return; }
        if (editTarget && form.parent === editTarget.id) {
            setFormError('A role cannot be its own parent.');
            return;
        }
        setSaving(true);
        setFormError(null);
        try {
            if (editTarget) {
                const payload: UpdateRolePayload = {
                    name: form.name.trim(), description: form.description.trim(),
                    parent: form.parent || null,
                };
                const updated = await roleService.update(editTarget.id, payload);
                setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            } else {
                const payload: CreateRolePayload = {
                    name: form.name.trim(), description: form.description.trim(),
                    parent: form.parent || null,
                };
                const created = await roleService.create(payload);
                setRoles((prev) => [...prev, created]);
            }
            closeModal();
        } catch (err) {
            const axErr = err as AxiosError<Record<string, string[] | string>>;
            const data  = axErr.response?.data;
            if (data) {
                const first = Object.values(data).flat()[0];
                setFormError(typeof first === 'string' ? first : 'Save failed. Please try again.');
            } else {
                setFormError('Save failed. Please try again.');
            }
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ────────────────────────────────────────────────────────────────

    const handleDelete = async (role: RoleRecord) => {
        if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
        try {
            await roleService.remove(role.id);
            setRoles((prev) => prev.filter((r) => r.id !== role.id));
        } catch (err) {
            const axErr = err as AxiosError<{ error?: string }>;
            alert(axErr.response?.data?.error ?? 'Delete failed.');
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Roles</h1>
                    <p className="text-body-md text-gray-600">Manage roles and permissions</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="md" icon={<RefreshCw className="w-4 h-4" />}
                        onClick={loadAll} disabled={loading}>
                        Refresh
                    </Button>
                    <Button variant="primary" size="lg" icon={<Plus className="w-5 h-5" />}
                        onClick={openCreate}>
                        Add Role
                    </Button>
                </div>
            </div>

            {/* Search */}
            <div className="mb-6">
                <Input
                    placeholder="Search by name, description or parent…"
                    leftIcon={<Search className="w-5 h-5" />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Error banner */}
            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">
                    {error}
                    <button className="ml-3 underline" onClick={loadAll}>Retry</button>
                </div>
            )}

            {/* Card grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading
                    ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                    : filtered.length === 0
                        ? (
                            <div className="col-span-full text-center py-12 text-gray-400">
                                {search ? 'No roles match your search.' : 'No roles yet. Create one to get started.'}
                            </div>
                        )
                        : filtered.map((role) => {
                            const canDelete = role.user_count === 0;
                            return (
                                <Card key={role.id} hover>
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center">
                                                <Shield className="w-6 h-6 text-brand-600" />
                                            </div>
                                            {role.parent_name && (
                                                <Badge variant="default" className="text-xs flex items-center gap-1">
                                                    <Lock className="w-3 h-3 inline mr-1" />
                                                    {role.parent_name}
                                                </Badge>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <CardTitle className="mb-1">{role.name}</CardTitle>
                                        {role.description && (
                                            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{role.description}</p>
                                        )}
                                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                                            <Badge variant="brand">
                                                <Lock className="w-3 h-3 mr-1 inline" />
                                                {role.permission_count} permissions
                                            </Badge>
                                            <Badge variant={role.user_count > 0 ? 'success' : 'default'}>
                                                <UsersIcon className="w-3 h-3 mr-1 inline" />
                                                {role.user_count} users
                                            </Badge>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" className="flex-1"
                                                onClick={() => openEdit(role)}>
                                                Edit
                                            </Button>
                                            <Button
                                                variant="ghost" size="sm" className="flex-1"
                                                disabled={!canDelete}
                                                title={canDelete ? undefined : `${role.user_count} user(s) assigned — reassign first`}
                                                onClick={() => handleDelete(role)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })
                }
            </div>

            {/* Create / Edit modal */}
            <Modal isOpen={modalOpen} onClose={closeModal}
                title={editTarget ? 'Edit Role' : 'Create Role'}>
                <div className="space-y-4">
                    {formError && (
                        <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-red-800 text-sm">
                            {formError}
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Name <span className="text-red-500">*</span>
                        </label>
                        <Input placeholder="e.g. Developer" value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                            rows={3} placeholder="Describe what this role can do…"
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Parent Role</label>
                        <select
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={form.parent}
                            onChange={(e) => setForm((f) => ({ ...f, parent: e.target.value }))}
                        >
                            <option value="">— None (top-level) —</option>
                            {roles.filter((r) => r.id !== editTarget?.id).map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancel</Button>
                        <Button variant="primary" loading={saving} onClick={handleSave}>
                            {editTarget ? 'Save Changes' : 'Create Role'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
