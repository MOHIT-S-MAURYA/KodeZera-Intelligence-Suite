import React, { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, RefreshCw, ShieldCheck } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import { userService } from '../services/user.service';
import { getApiError } from '../utils/errors';
import type { UserRecord, CreateUserPayload, UpdateUserPayload } from '../services/user.service';
import api from '../services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoleOption { id: string; name: string }
interface DeptOption { id: string; name: string }

interface FormState {
    first_name:      string;
    last_name:       string;
    email:           string;
    password:        string;
    department:      string;
    role_id:         string;
}

const EMPTY_FORM: FormState = {
    first_name:      '',
    last_name:       '',
    email:           '',
    password:        '',
    department:      '',
    role_id:         '',
};

// ── Component ─────────────────────────────────────────────────────────────────

export const Users: React.FC = () => {
    const { user: me } = useAuthStore();

    // ── Data state ─────────────────────────────────────────────────────────
    const [users,       setUsers]       = useState<UserRecord[]>([]);
    const [roles,       setRoles]       = useState<RoleOption[]>([]);
    const [departments, setDepartments] = useState<DeptOption[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState<string | null>(null);

    // ── Filter state ───────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter,  setRoleFilter]  = useState('all');

    // ── Toast ───────────────────────────────────────────────────────────
    const { addToast } = useUIStore();

    // ── Modal state ────────────────────────────────────────────────────────
    const [modalOpen,    setModalOpen]    = useState(false);
    const [editingUser,  setEditingUser]  = useState<UserRecord | null>(null);
    const [form,         setForm]         = useState<FormState>(EMPTY_FORM);
    const [saving,       setSaving]       = useState(false);
    const [formError,    setFormError]    = useState<string | null>(null);

    // ── Delete confirmation modal ──────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
    const [isDeleting,   setIsDeleting]   = useState(false);

    // ── Load data ─────────────────────────────────────────────────────────
    const loadAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersData, rolesRes, deptsRes] = await Promise.all([
                userService.getAll(),
                api.get<{ results?: RoleOption[] } | RoleOption[]>('/roles/'),
                api.get<{ results?: DeptOption[] } | DeptOption[]>('/departments/'),
            ]);
            setUsers(usersData);
            const rd = rolesRes.data as { results?: RoleOption[] } | RoleOption[];
            setRoles((rd as { results?: RoleOption[] }).results ?? (rd as RoleOption[]));
            const dd = deptsRes.data as { results?: DeptOption[] } | DeptOption[];
            setDepartments((dd as { results?: DeptOption[] }).results ?? (dd as DeptOption[]));
        } catch (err) {
            setError(getApiError(err, 'Failed to load users. Please try again.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Filtered list ──────────────────────────────────────────────────────
    const filteredUsers = users.filter(u => {
        const q = searchQuery.toLowerCase();
        const matchSearch = u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        const matchRole   = roleFilter === 'all' || u.primary_role_id === roleFilter;
        return matchSearch && matchRole;
    });

    // ── Modal helpers ──────────────────────────────────────────────────────
    const openAdd = () => {
        setEditingUser(null);
        setForm(EMPTY_FORM);
        setFormError(null);
        setModalOpen(true);
    };

    const openEdit = (u: UserRecord) => {
        setEditingUser(u);
        setForm({
            first_name:      u.first_name,
            last_name:       u.last_name,
            email:           u.email,
            password:        '',
            department:      u.department ?? '',
            role_id:         u.primary_role_id ?? '',
        });
        setFormError(null);
        setModalOpen(true);
    };

    const closeModal = () => { setModalOpen(false); setEditingUser(null); };

    const patch = (field: keyof FormState, value: string | boolean) =>
        setForm(prev => ({ ...prev, [field]: value }));

    // ── Save ───────────────────────────────────────────────────────────────
    const handleSave = async () => {
        setFormError(null);
        if (!form.first_name.trim() || !form.email.trim()) {
            setFormError('First name and email are required.');
            return;
        }
        if (!editingUser && !form.password) {
            setFormError('Password is required for new users.');
            return;
        }
        setSaving(true);
        try {
            if (editingUser) {
                const payload: UpdateUserPayload = {
                    first_name:      form.first_name,
                    last_name:       form.last_name,
                    department:      form.department || null,
                    role_id:         form.role_id   || null,
                };
                if (form.password) payload.password = form.password;
                const updated = await userService.update(editingUser.id, payload);
                setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
            } else {
                const payload: CreateUserPayload = {
                    first_name:      form.first_name,
                    last_name:       form.last_name,
                    email:           form.email,
                    password:        form.password,
                    department:      form.department || null,
                    role_id:         form.role_id   || null,
                };
                const created = await userService.create(payload);
                setUsers(prev => [created, ...prev]);
            }
            closeModal();
        } catch (err: unknown) {
            const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
            if (data) {
                const msg = Object.values(data).flat().join(' ');
                setFormError(msg || 'Failed to save user.');
            } else {
                setFormError('Failed to save user.');
            }
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ─────────────────────────────────────────────────────────────
    const confirmDelete = (u: UserRecord) => setDeleteTarget(u);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await userService.remove(deleteTarget.id);
            setUsers(prev => prev.filter(x => x.id !== deleteTarget.id));
            addToast('success', `${deleteTarget.full_name} deleted.`);
            setDeleteTarget(null);
        } catch {
            addToast('error', 'Failed to delete user. Please try again.');
        } finally {
            setIsDeleting(false);
        }
    };

    // ── Toggle status ──────────────────────────────────────────────────────
    const handleToggleStatus = async (u: UserRecord) => {
        try {
            const updated = await userService.toggleStatus(u.id);
            setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
        } catch {
            addToast('error', 'Failed to update status. Please try again.');
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Users</h1>
                    <p className="text-body-md text-gray-600">Manage user accounts and permissions</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="lg" icon={<RefreshCw className="w-4 h-4" />} onClick={loadAll}>
                        Refresh
                    </Button>
                    <Button variant="primary" size="lg" icon={<UserPlus className="w-5 h-5" />} onClick={openAdd}>
                        Add User
                    </Button>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            <Card>
                {/* Filters */}
                <div className="flex gap-4 mb-6">
                    <div className="flex-1">
                        <Input
                            placeholder="Search by name or email…"
                            leftIcon={<Search className="w-5 h-5" />}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <select
                        className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                        value={roleFilter}
                        onChange={e => setRoleFilter(e.target.value)}
                    >
                        <option value="all">All Roles</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-200">
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">User</th>
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Role</th>
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Department</th>
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Status</th>
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="border-b border-gray-100">
                                        {Array.from({ length: 5 }).map((__, j) => (
                                            <td key={j} className="py-3 px-4">
                                                <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-10 text-center text-gray-500 text-sm">
                                        {searchQuery || roleFilter !== 'all' ? 'No users match the current filters.' : 'No users found.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(u => (
                                    <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar name={u.full_name} size="sm" />
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="font-medium text-gray-900">{u.full_name}</p>
                                                        {u.is_tenant_admin && (
                                                            <span title="Tenant Admin">
                                                                <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-500">{u.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            {u.primary_role_name
                                                ? <Badge variant="brand">{u.primary_role_name}</Badge>
                                                : <span className="text-gray-400 text-sm">—</span>}
                                        </td>
                                        <td className="py-3 px-4 text-gray-600 text-sm">
                                            {u.department_name ?? <span className="text-gray-400">—</span>}
                                        </td>
                                        <td className="py-3 px-4">
                                            <button
                                                onClick={() => { if (u.email !== me?.email) handleToggleStatus(u); }}
                                                disabled={u.email === me?.email}
                                                title={u.email === me?.email ? 'Cannot change own status' : 'Click to toggle'}
                                            >
                                                <Badge variant={u.is_active ? 'success' : 'default'}>
                                                    {u.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </button>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => confirmDelete(u)}
                                                    disabled={u.email === me?.email}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && (
                    <p className="text-xs text-gray-400 mt-4">
                        Showing {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
                    </p>
                )}
            </Card>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => !isDeleting && setDeleteTarget(null)}
                title="Delete User"
            >
                <div className="space-y-4">
                    <p className="text-gray-600 text-sm">
                        Are you sure you want to delete{' '}
                        <span className="font-semibold text-gray-900">{deleteTarget?.full_name}</span>?
                        This action cannot be undone.
                    </p>
                    <div className="flex gap-3 pt-1">
                        <Button
                            variant="secondary"
                            className="flex-1"
                            onClick={() => setDeleteTarget(null)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            className="flex-1"
                            onClick={handleDelete}
                            loading={isDeleting}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Add / Edit Modal */}
            <Modal isOpen={modalOpen} onClose={closeModal} title={editingUser ? `Edit ${editingUser.full_name}` : 'Add New User'}>
                <div className="space-y-4">
                    {formError && (
                        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
                            {formError}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <Input label="First Name" placeholder="First name" value={form.first_name}
                            onChange={e => patch('first_name', e.target.value)} />
                        <Input label="Last Name" placeholder="Last name" value={form.last_name}
                            onChange={e => patch('last_name', e.target.value)} />
                    </div>

                    <Input label="Email" type="email" placeholder="user@company.com"
                        value={form.email} disabled={!!editingUser}
                        onChange={e => patch('email', e.target.value)} />

                    <Input
                        label={editingUser ? 'New Password (leave blank to keep)' : 'Password'}
                        type="password"
                        placeholder={editingUser ? '(unchanged)' : 'Min 8 characters'}
                        value={form.password}
                        onChange={e => patch('password', e.target.value)}
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                        <select className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                            value={form.role_id} onChange={e => patch('role_id', e.target.value)}>
                            <option value="">— No role —</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                        <select className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                            value={form.department} onChange={e => patch('department', e.target.value)}>
                            <option value="">— No department —</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button variant="secondary" className="flex-1" onClick={closeModal} disabled={saving}>Cancel</Button>
                        <Button variant="primary" className="flex-1" onClick={handleSave} loading={saving}>
                            {editingUser ? 'Save Changes' : 'Create User'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};