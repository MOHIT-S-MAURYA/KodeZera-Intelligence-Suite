import React, { useState } from 'react';
import { Search, Plus, Users as UsersIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

interface Department {
    id: number;
    name: string;
    description: string;
    userCount: number;
}

export const Departments: React.FC = () => {
    const [departments, setDepartments] = useState<Department[]>([
        { id: 1, name: 'Engineering', description: 'Software development team', userCount: 12 },
        { id: 2, name: 'Marketing', description: 'Marketing and communications', userCount: 8 },
        { id: 3, name: 'Sales', description: 'Sales and business development', userCount: 15 },
        { id: 4, name: 'HR', description: 'Human resources', userCount: 5 },
    ]);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        description: ''
    });

    // Open modal for adding new department
    const handleAddDepartment = () => {
        setEditingDept(null);
        setFormData({
            name: '',
            description: ''
        });
        setModalOpen(true);
    };

    // Open modal for editing existing department
    const handleEditDepartment = (dept: Department) => {
        setEditingDept(dept);
        setFormData({
            name: dept.name,
            description: dept.description
        });
        setModalOpen(true);
    };

    // Save department (add or update)
    const handleSaveDepartment = () => {
        if (!formData.name || !formData.description) {
            alert('Please fill in all required fields');
            return;
        }

        if (editingDept) {
            // Update existing department
            setDepartments(departments.map(d =>
                d.id === editingDept.id
                    ? { ...d, name: formData.name, description: formData.description }
                    : d
            ));
        } else {
            // Add new department
            const newDept: Department = {
                id: Math.max(...departments.map(d => d.id)) + 1,
                name: formData.name,
                description: formData.description,
                userCount: 0
            };
            setDepartments([...departments, newDept]);
        }

        setModalOpen(false);
    };

    // Delete department
    const handleDeleteDepartment = (id: number) => {
        if (confirm('Are you sure you want to delete this department?')) {
            setDepartments(departments.filter(d => d.id !== id));
        }
    };

    // Filter departments
    const filteredDepartments = departments.filter(dept =>
        dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dept.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Departments</h1>
                    <p className="text-body-md text-gray-600">Organize users into departments</p>
                </div>
                <Button
                    variant="primary"
                    size="lg"
                    icon={<Plus className="w-5 h-5" />}
                    onClick={handleAddDepartment}
                >
                    Add Department
                </Button>
            </div>

            <div className="mb-6">
                <Input
                    placeholder="Search departments..."
                    leftIcon={<Search className="w-5 h-5" />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDepartments.map((dept) => (
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
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => handleEditDepartment(dept)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => handleDeleteDepartment(dept.id)}
                                >
                                    Delete
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Add/Edit Department Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editingDept ? 'Edit Department' : 'Add New Department'}
            >
                <div className="space-y-4">
                    <Input
                        label="Department Name"
                        placeholder="Enter department name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Description
                        </label>
                        <textarea
                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                            rows={3}
                            placeholder="Enter department description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
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
                            onClick={handleSaveDepartment}
                        >
                            {editingDept ? 'Update Department' : 'Add Department'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
