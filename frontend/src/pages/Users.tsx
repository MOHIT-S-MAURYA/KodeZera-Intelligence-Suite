import React, { useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    department: string;
    status: 'active' | 'inactive';
}

export const Users: React.FC = () => {
    const [users, setUsers] = useState<User[]>([
        { id: 1, name: 'John Doe', email: 'john@demo.com', role: 'Admin', department: 'Engineering', status: 'active' },
        { id: 2, name: 'Jane Smith', email: 'jane@demo.com', role: 'Developer', department: 'Engineering', status: 'active' },
        { id: 3, name: 'Mike Johnson', email: 'mike@demo.com', role: 'Viewer', department: 'Marketing', status: 'inactive' },
    ]);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        role: 'Developer',
        department: 'Engineering',
        status: 'active' as 'active' | 'inactive'
    });

    // Open modal for adding new user
    const handleAddUser = () => {
        setEditingUser(null);
        setFormData({
            name: '',
            email: '',
            role: 'Developer',
            department: 'Engineering',
            status: 'active'
        });
        setModalOpen(true);
    };

    // Open modal for editing existing user
    const handleEditUser = (user: User) => {
        setEditingUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            status: user.status
        });
        setModalOpen(true);
    };

    // Save user (add or update)
    const handleSaveUser = () => {
        if (!formData.name || !formData.email) {
            alert('Please fill in all required fields');
            return;
        }

        if (editingUser) {
            // Update existing user
            setUsers(users.map(u =>
                u.id === editingUser.id
                    ? { ...u, ...formData }
                    : u
            ));
        } else {
            // Add new user
            const newUser: User = {
                id: Math.max(...users.map(u => u.id)) + 1,
                ...formData
            };
            setUsers([...users, newUser]);
        }

        setModalOpen(false);
    };

    // Delete user
    const handleDeleteUser = (id: number) => {
        if (confirm('Are you sure you want to delete this user?')) {
            setUsers(users.filter(u => u.id !== id));
        }
    };

    // Filter users
    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Users</h1>
                    <p className="text-body-md text-gray-600">Manage user accounts and permissions</p>
                </div>
                <Button
                    variant="primary"
                    size="lg"
                    icon={<UserPlus className="w-5 h-5" />}
                    onClick={handleAddUser}
                >
                    Add User
                </Button>
            </div>

            <Card>
                <div className="flex gap-4 mb-6">
                    <div className="flex-1">
                        <Input
                            placeholder="Search users..."
                            leftIcon={<Search className="w-5 h-5" />}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <select
                        className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="all">All Roles</option>
                        <option value="Admin">Admin</option>
                        <option value="Developer">Developer</option>
                        <option value="Viewer">Viewer</option>
                    </select>
                </div>

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
                            {filteredUsers.map((user) => (
                                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar name={user.name} size="sm" />
                                            <div>
                                                <p className="font-medium text-gray-900">{user.name}</p>
                                                <p className="text-sm text-gray-500">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4"><Badge variant="brand">{user.role}</Badge></td>
                                    <td className="py-3 px-4 text-gray-600">{user.department}</td>
                                    <td className="py-3 px-4">
                                        <Badge variant={user.status === 'active' ? 'success' : 'default'}>
                                            {user.status}
                                        </Badge>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEditUser(user)}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteUser(user.id)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Add/Edit User Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editingUser ? 'Edit User' : 'Add New User'}
            >
                <div className="space-y-4">
                    <Input
                        label="Full Name"
                        placeholder="Enter full name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />

                    <Input
                        label="Email"
                        type="email"
                        placeholder="Enter email address"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Role
                        </label>
                        <select
                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        >
                            <option value="Admin">Admin</option>
                            <option value="Developer">Developer</option>
                            <option value="Viewer">Viewer</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Department
                        </label>
                        <select
                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={formData.department}
                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        >
                            <option value="Engineering">Engineering</option>
                            <option value="Marketing">Marketing</option>
                            <option value="Sales">Sales</option>
                            <option value="HR">HR</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Status
                        </label>
                        <select
                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            variant="secondary"
                            className="flex-1"
                            onClick={() => setModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            className="flex-1"
                            onClick={handleSaveUser}
                        >
                            {editingUser ? 'Update User' : 'Add User'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
