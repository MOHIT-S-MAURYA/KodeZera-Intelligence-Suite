import React from 'react';
import { Search, UserPlus } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';

export const Users: React.FC = () => {
    const users = [
        { id: 1, name: 'John Doe', email: 'john@demo.com', role: 'Admin', department: 'Engineering', status: 'active' },
        { id: 2, name: 'Jane Smith', email: 'jane@demo.com', role: 'Developer', department: 'Engineering', status: 'active' },
        { id: 3, name: 'Mike Johnson', email: 'mike@demo.com', role: 'Viewer', department: 'Marketing', status: 'inactive' },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Users</h1>
                    <p className="text-body-md text-gray-600">Manage user accounts and permissions</p>
                </div>
                <Button variant="primary" size="lg" icon={<UserPlus className="w-5 h-5" />}>
                    Add User
                </Button>
            </div>

            <Card>
                <div className="flex gap-4 mb-6">
                    <div className="flex-1">
                        <Input placeholder="Search users..." leftIcon={<Search className="w-5 h-5" />} />
                    </div>
                    <select className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option>All Roles</option>
                        <option>Admin</option>
                        <option>Developer</option>
                        <option>Viewer</option>
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
                            {users.map((user) => (
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
                                            <Button variant="ghost" size="sm">Edit</Button>
                                            <Button variant="ghost" size="sm">Delete</Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
