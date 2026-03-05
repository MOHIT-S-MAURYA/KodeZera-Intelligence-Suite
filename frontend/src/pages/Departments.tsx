import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, RefreshCw, Users as UsersIcon, GitBranch } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { departmentService } from '../services/department.service';
import { getApiError } from '../utils/errors';
import type {
    DepartmentRecord,
    CreateDepartmentPayload,
    UpdateDepartmentPayload,
} from '../services/department.service';

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
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
        </CardHeader>
        <CardContent>
            <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-full bg-gray-100 rounded animate-pulse mb-1" />
            <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse mb-4" />
            <div className="flex gap-2">
                <div className="flex-1 h-8 bg-gray-200 rounded animate-pulse" />
                <div className="flex-1 h-8 bg-gray-200 rounded animate-pulse" />
            </div>
        </CardContent>
    </Card>
);

// ── Component ─────────────────────────────────────────────────────────────────

export const Departments: React.FC = () => {
    // ── Data state ─────────────────────────────────────────────────────────
    const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState<string | null>(null);

    // ── Filter state ───────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');

    // ── Modal state ────────────────────────────────────────────────────────
    const [modalOpen,    setModalOpen]    = useState(false);
    const [editingDept,  setEditingDept]  = useState<DepartmentRecord | null>(null);
    const [form,         setForm]         = useState<FormState>(EMPTY_FORM);
    const [saving,       setSaving]       = useState(false);
    const [formError,    setFormError]    = useState<string | null>(null);

    // ── Load data ─────────────────────────────────────────────────────────
    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await departmentService.getAll();
            setDepartments(data);
        } catch (err) {
            setError(getApiError(err, 'Failed to load departments. Please try again.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Filtered list ──────────────────────────────────────────────────────
    const filteredDepts = departments.filter(d => {
        const q = searchQuery.toLowerCase();
        return (
            d.name.toLowerCase().includes(q) ||
            d.description.toLowerCase().includes(q) ||
            (d.parent_name ?? '').toLowerCase().includes(q)
        );
    });

    // ── Modal helpers ──────────────────────────────────────────────────────
    const openAdd = () => {
        setEditingDept(null);
        setForm(EMPTY_FORM);
        setFormError(null);
        setModalOpen(true);
    };

    const openEdit = (d: DepartmentRecord) => {
        setEditingDept(d);
        setForm({
            name:        d.name,
            description: d.description,
            parent:      d.parent ?? '',
        });
        setFormError(null);
        setModalOpen(true);
    };

    const closeModal = () => { setModalOpen(false); setEditingDept(null); };

    const patch = (field: keyof FormState, value: string) =>
        setForm(prev => ({ ...prev, [field]: value }));

    // ── Save ───────────────────────────────────────────────────────────────
    const handleSave = async () => {
        setFormError(null);
        if (!form.name.trim()) {
            setFormError('Department name is required.');
            return;
        }
        // Prevent self-parenting (edit mode)
        if (editingDept && form.parent === editingDept.id) {
            setFormError('A department cannot be its own parent.');
            return;
        }
        setSaving(true);
        try {
            if (editingDept) {
                const payload: UpdateDepartmentPayload = {
                    name:        form.name,
                    description: form.description,
                    parent:      form.parent || null,
                };
                const updated = await departmentService.update(editingDept.id, payload);
                setDepartments(prev => prev.map(d => d.id === updated.id ? updated : d));
            } else {
                const payload: CreateDepartmentPayload = {
                    name:        form.name,
                    description: form.description,
                    parent:      form.parent || null,
                };
                const created = await departmentService.create(payload);
                setDepartments(prev => [...prev, created]);
            }
            closeModal();
        } catch (err: unknown) {
            const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
            if (data) {
                const msg = Object.values(data).flat().join(' ');
                setFormError(msg || 'Failed to save department.');
            } else {
                setFormError('Failed to save department.');
            }
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ─────────────────────────────────────────────────────────────
    const handleDelete = async (d: DepartmentRecord) => {
        if (!confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
        try {
            await departmentService.remove(d.id);
            setDepartments(prev => prev.filter(x => x.id !== d.id));
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { error?: string } } }).response?.data?.error
                ?? 'Failed to delete department.';
            alert(msg);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Departments</h1>
                    <p className="text-body-md text-gray-600">Organise users into departments</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="lg" icon={<RefreshCw className="w-4 h-4" />} onClick={loadAll}>
                        Refresh
                    </Button>
                    <Button variant="primary" size="lg" icon={<Plus className="w-5 h-5" />} onClick={openAdd}>
                        Add Department
                    </Button>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {/* Search */}
            <div className="mb-2">
                <Input
                    placeholder="Search by name, description, or parent…"
                    leftIcon={<Search className="w-5 h-5" />}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Card grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                ) : filteredDepts.length === 0 ? (
                    <div className="col-span-3 py-16 text-center text-gray-500 text-sm">
                        {searchQuery ? 'No departments match the search.' : 'No departments yet. Create one to get started.'}
                    </div>
                ) : (
                    filteredDepts.map(d => (
                        <Card key={d.id} hover>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                                        <UsersIcon className="w-6 h-6 text-brand-600" />
                                    </div>
                                    <Badge variant="brand">
                                        {d.user_count} {d.user_count === 1 ? 'user' : 'users'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <CardTitle className="mb-1">{d.name}</CardTitle>

                                {/* Parent breadcrumb */}
                                {d.parent_name && (
                                    <p className="text-xs text-brand-600 flex items-center gap-1 mb-2">
                                        <GitBranch className="w-3 h-3" />
                                        {d.parent_name}
                                    </p>
                                )}

                                <p className="text-sm text-gray-600 mb-1 min-h-[2.5rem] line-clamp-2">
                                    {d.description || <span className="text-gray-400 italic">No description</span>}
                                </p>

                                {/* Sub-dept count */}
                                {d.children_count > 0 && (
                                    <p className="text-xs text-gray-400 mb-3">
                                        {d.children_count} sub-department{d.children_count !== 1 ? 's' : ''}
                                    </p>
                                )}

                                <div className="flex gap-2 mt-3">
                                    <Button variant="ghost" size="sm" className="flex-1" onClick={() => openEdit(d)}>
                                        Edit
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => handleDelete(d)}
                                        disabled={d.user_count > 0 || d.children_count > 0}
                                        title={
                                            d.user_count > 0
                                                ? `${d.user_count} users assigned — reassign first`
                                                : d.children_count > 0
                                                ? `${d.children_count} sub-departments exist — delete them first`
                                                : 'Delete department'
                                        }
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Footer count */}
            {!loading && (
                <p className="text-xs text-gray-400">
                    Showing {filteredDepts.length} of {departments.length} department{departments.length !== 1 ? 's' : ''}
                </p>
            )}

            {/* Add / Edit Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={closeModal}
                title={editingDept ? `Edit "${editingDept.name}"` : 'Add New Department'}
            >
                <div className="space-y-4">
                    {formError && (
                        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
                            {formError}
                        </div>
                    )}

                    <Input
                        label="Department Name"
                        placeholder="e.g. Engineering"
                        value={form.name}
                        onChange={e => patch('name', e.target.value)}
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Description <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none text-sm"
                            rows={3}
                            placeholder="What does this department do?"
                            value={form.description}
                            onChange={e => patch('description', e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Parent Department <span className="text-gray-400 font-normal">(optional)</span>
                        </label>
                        <select
                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                            value={form.parent}
                            onChange={e => patch('parent', e.target.value)}
                        >
                            <option value="">— Top-level (no parent) —</option>
                            {departments
                                /* Don't offer self as parent in edit mode */
                                .filter(d => !editingDept || d.id !== editingDept.id)
                                .map(d => (
                                    <option key={d.id} value={d.id}>
                                        {d.parent_name ? `${d.parent_name} › ${d.name}` : d.name}
                                    </option>
                                ))}
                        </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button variant="secondary" className="flex-1" onClick={closeModal} disabled={saving}>
                            Cancel
                        </Button>
                        <Button variant="primary" className="flex-1" onClick={handleSave} loading={saving}>
                            {editingDept ? 'Save Changes' : 'Create Department'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};