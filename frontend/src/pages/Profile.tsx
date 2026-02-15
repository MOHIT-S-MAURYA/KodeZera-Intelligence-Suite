import React, { useState } from 'react';
import clsx from 'clsx';
import { User, Mail, Phone, MapPin, Calendar, Shield, Activity, Camera } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { useAuthStore } from '../store/auth.store';

export const Profile: React.FC = () => {
    const { user } = useAuthStore();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        firstName: user?.first_name || 'Admin',
        lastName: user?.last_name || 'User',
        email: user?.email || 'admin@demo.com',
        phone: '+1 (555) 123-4567',
        location: 'San Francisco, CA',
        bio: 'System administrator with expertise in AI and document management.',
        timezone: 'America/Los_Angeles',
    });

    const handleSave = () => {
        // TODO: Implement API call to update profile
        setIsEditing(false);
    };

    const handleCancel = () => {
        setIsEditing(false);
        // Reset form data
    };

    const stats = [
        { label: 'Documents Uploaded', value: '1,234', icon: Activity, color: 'text-blue-600' },
        { label: 'Queries Made', value: '5,678', icon: Activity, color: 'text-green-600' },
        { label: 'Days Active', value: '234', icon: Calendar, color: 'text-purple-600' },
        { label: 'Team Members', value: '45', icon: User, color: 'text-orange-600' },
    ];

    const recentActivity = [
        { action: 'Uploaded document', item: 'Q4 Report.pdf', time: '2 hours ago' },
        { action: 'Created role', item: 'Content Editor', time: '5 hours ago' },
        { action: 'Added user', item: 'john@example.com', time: '1 day ago' },
        { action: 'Modified department', item: 'Engineering', time: '2 days ago' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
                <p className="text-gray-500 mt-1">Manage your personal information and preferences</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Profile Info */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Profile Card */}
                    <Card variant="elevated">
                        <div className="p-6">
                            <div className="flex items-start justify-between mb-6">
                                <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
                                {!isEditing ? (
                                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                                        Edit Profile
                                    </Button>
                                ) : (
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={handleCancel}>
                                            Cancel
                                        </Button>
                                        <Button variant="primary" size="sm" onClick={handleSave}>
                                            Save Changes
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Avatar Section */}
                            <div className="flex items-center gap-6 mb-8 pb-8 border-b border-gray-200">
                                <div className="relative">
                                    <Avatar
                                        name={`${formData.firstName} ${formData.lastName}`}
                                        size="xl"
                                        className="ring-4 ring-white shadow-lg"
                                    />
                                    {isEditing && (
                                        <button className="absolute bottom-0 right-0 p-2 bg-brand-600 text-white rounded-full shadow-lg hover:bg-brand-700 transition-colors">
                                            <Camera className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900">
                                        {formData.firstName} {formData.lastName}
                                    </h3>
                                    <p className="text-gray-500">{formData.email}</p>
                                    <div className="flex gap-2 mt-2">
                                        <Badge variant="info">Superuser</Badge>
                                        <Badge variant="success">Active</Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Form Fields */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="First Name"
                                    value={formData.firstName}
                                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<User className="w-5 h-5" />}
                                />
                                <Input
                                    label="Last Name"
                                    value={formData.lastName}
                                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<User className="w-5 h-5" />}
                                />
                                <Input
                                    label="Email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<Mail className="w-5 h-5" />}
                                />
                                <Input
                                    label="Phone"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<Phone className="w-5 h-5" />}
                                />
                                <Input
                                    label="Location"
                                    value={formData.location}
                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<MapPin className="w-5 h-5" />}
                                />
                                <Input
                                    label="Timezone"
                                    value={formData.timezone}
                                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<Calendar className="w-5 h-5" />}
                                />
                            </div>

                            <div className="mt-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
                                <textarea
                                    value={formData.bio}
                                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                    disabled={!isEditing}
                                    rows={4}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-150 disabled:bg-gray-50 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Security Card */}
                    <Card variant="elevated">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <Shield className="w-6 h-6 text-brand-600" />
                                <h2 className="text-xl font-semibold text-gray-900">Security</h2>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                    <div>
                                        <p className="font-medium text-gray-900">Password</p>
                                        <p className="text-sm text-gray-500">Last changed 30 days ago</p>
                                    </div>
                                    <Button variant="outline" size="sm">
                                        Change Password
                                    </Button>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                    <div>
                                        <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                                        <p className="text-sm text-gray-500">Add an extra layer of security</p>
                                    </div>
                                    <Button variant="outline" size="sm">
                                        Enable 2FA
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right Column - Stats & Activity */}
                <div className="space-y-6">
                    {/* Stats Card */}
                    <Card variant="elevated">
                        <div className="p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">Activity Stats</h2>
                            <div className="space-y-4">
                                {stats.map((stat, index) => (
                                    <div key={index} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={clsx('p-2 rounded-lg bg-gray-50', stat.color)}>
                                                <stat.icon className="w-5 h-5" />
                                            </div>
                                            <span className="text-sm text-gray-600">{stat.label}</span>
                                        </div>
                                        <span className="text-lg font-semibold text-gray-900">{stat.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>

                    {/* Recent Activity Card */}
                    <Card variant="elevated">
                        <div className="p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
                            <div className="space-y-4">
                                {recentActivity.map((activity, index) => (
                                    <div key={index} className="flex gap-3">
                                        <div className="w-2 h-2 mt-2 rounded-full bg-brand-600" />
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-900">
                                                <span className="font-medium">{activity.action}</span>
                                                <span className="text-brand-600 ml-1">{activity.item}</span>
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">{activity.time}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
