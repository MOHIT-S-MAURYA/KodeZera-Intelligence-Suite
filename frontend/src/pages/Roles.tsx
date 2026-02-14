import React from 'react';
import { Search, Plus, Shield as ShieldIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export const Roles: React.FC = () => {
    const roles = [
        { id: 1, name: 'Admin', permissionCount: 24, isSystem: true, description: 'Full system access' },
        { id: 2, name: 'Developer', permissionCount: 18, isSystem: false, description: 'Development team access' },
        { id: 3, name: 'Viewer', permissionCount: 8, isSystem: false, description: 'Read-only access' },
        { id: 4, name: 'Content Editor', permissionCount: 12, isSystem: false, description: 'Content management' },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Roles</h1>
                    <p className="text-body-md text-gray-600">Manage roles and permissions</p>
                </div>
                <Button variant="primary" size="lg" icon={<Plus className="w-5 h-5" />}>
                    Add Role
                </Button>
            </div>

            <div className="mb-6">
                <Input placeholder="Search roles..." leftIcon={<Search className="w-5 h-5" />} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {roles.map((role) => (
                    <Card key={role.id} hover>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center">
                                    <ShieldIcon className="w-6 h-6 text-brand-600" />
                                </div>
                                {role.isSystem && <Badge variant="info">System</Badge>}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <CardTitle className="mb-2">{role.name}</CardTitle>
                            <p className="text-sm text-gray-600 mb-3">{role.description}</p>
                            <div className="flex items-center gap-2 mb-4">
                                <Badge variant="brand">{role.permissionCount} permissions</Badge>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" className="flex-1">Edit</Button>
                                <Button variant="ghost" size="sm" className="flex-1" disabled={role.isSystem}>
                                    Delete
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};
