import React from 'react';
import { Search, Plus, Users as UsersIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export const Departments: React.FC = () => {
    const departments = [
        { id: 1, name: 'Engineering', description: 'Software development team', userCount: 12 },
        { id: 2, name: 'Marketing', description: 'Marketing and communications', userCount: 8 },
        { id: 3, name: 'Sales', description: 'Sales and business development', userCount: 15 },
        { id: 4, name: 'HR', description: 'Human resources', userCount: 5 },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Departments</h1>
                    <p className="text-body-md text-gray-600">Organize users into departments</p>
                </div>
                <Button variant="primary" size="lg" icon={<Plus className="w-5 h-5" />}>
                    Add Department
                </Button>
            </div>

            <div className="mb-6">
                <Input placeholder="Search departments..." leftIcon={<Search className="w-5 h-5" />} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {departments.map((dept) => (
                    <Card key={dept.id} hover>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center">
                                    <UsersIcon className="w-6 h-6 text-brand-600" />
                                </div>
                                <Badge variant="brand">{dept.userCount} users</Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <CardTitle className="mb-2">{dept.name}</CardTitle>
                            <p className="text-sm text-gray-600 mb-4">{dept.description}</p>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" className="flex-1">Edit</Button>
                                <Button variant="ghost" size="sm" className="flex-1">Delete</Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};
