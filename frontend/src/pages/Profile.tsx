import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { User, Mail, Phone, MapPin, Calendar, Shield, Activity, Camera, RefreshCw, Lock, Eye, EyeOff } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import apiService from '../services/api';

interface ProfileData {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    location: string;
    bio: string;
    timezone: string;
}

export const Profile: React.FC = () => {
    const { user, setUser } = useAuthStore();
    const { addToast } = useUIStore();
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Password change state
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [passwordData, setPasswordData] = useState({ current: '', newPwd: '', confirm: '' });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [showCurrentPwd, setShowCurrentPwd] = useState(false);
    const [showNewPwd, setShowNewPwd] = useState(false);
    const [showConfirmPwd, setShowConfirmPwd] = useState(false);

    const [formData, setFormData] = useState<ProfileData>({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        location: '',
        bio: '',
        timezone: '',
    });

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const resp = await apiService.get('/auth/me/');
                const data = resp.data;
                const meta = data.profile_metadata || {};

                setFormData({
                    first_name: data.first_name || '',
                    last_name: data.last_name || '',
                    email: data.email || '',
                    phone: meta.phone || '',
                    location: meta.location || '',
                    bio: meta.bio || '',
                    timezone: meta.timezone || '',
                });
            } catch (error) {
                addToast('error', 'Failed to load profile. Please refresh the page.');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                first_name: formData.first_name,
                last_name: formData.last_name,
                profile_metadata: {
                    phone: formData.phone,
                    location: formData.location,
                    bio: formData.bio,
                    timezone: formData.timezone,
                }
            };
            const resp = await apiService.put('/auth/me/', payload);

            // Re-sync local store so header avatar updates if name changed
            if (user) {
                setUser({
                    ...user,
                    first_name: resp.data.first_name,
                    last_name: resp.data.last_name,
                    full_name: `${resp.data.first_name} ${resp.data.last_name}`.trim() || user.username
                });
            }

            setIsEditing(false);
        } catch (error) {
            addToast('error', 'Failed to save profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
    };

    const handleChangePassword = async () => {
        if (!passwordData.current || !passwordData.newPwd || !passwordData.confirm) {
            addToast('error', 'Please fill in all password fields.');
            return;
        }
        if (passwordData.newPwd !== passwordData.confirm) {
            addToast('error', 'New passwords do not match.');
            return;
        }
        if (passwordData.newPwd.length < 8) {
            addToast('error', 'New password must be at least 8 characters.');
            return;
        }
        setPasswordSaving(true);
        try {
            await apiService.post('/auth/change-password/', {
                current_password: passwordData.current,
                new_password: passwordData.newPwd,
            });
            addToast('success', 'Password changed successfully.');
            setPasswordData({ current: '', newPwd: '', confirm: '' });
            setShowPasswordForm(false);
        } catch (error: any) {
            const msg = error?.response?.data?.error || 'Failed to change password. Please try again.';
            addToast('error', msg);
        } finally {
            setPasswordSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <RefreshCw className="animate-spin text-brand-600 w-8 h-8" />
            </div>
        );
    }

    const stats = [
        { label: 'Documents Access', value: 'Active', icon: Activity, color: 'text-blue-600' },
        { label: 'Platform Status', value: 'Healthy', icon: Activity, color: 'text-green-600' },
        { label: 'Security Level', value: 'High', icon: Shield, color: 'text-purple-600' },
        { label: 'Last Login', value: new Date().toLocaleDateString(), icon: Calendar, color: 'text-orange-600' },
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
                                        <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                                            Cancel
                                        </Button>
                                        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                                            {saving ? 'Saving...' : 'Save Changes'}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Avatar Section */}
                            <div className="flex items-center gap-6 mb-8 pb-8 border-b border-gray-200">
                                <div className="relative">
                                    <Avatar
                                        name={`${formData.first_name} ${formData.last_name}`}
                                        size="xl"
                                        className="ring-4 ring-white shadow-lg"
                                    />
                                    {isEditing && (
                                        <button className="absolute bottom-0 right-0 p-2 bg-brand-600 text-white rounded-full shadow-lg hover:bg-brand-700 transition-colors cursor-pointer">
                                            <Camera className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900">
                                        {formData.first_name} {formData.last_name}
                                    </h3>
                                    <p className="text-gray-500">{formData.email}</p>
                                    <div className="flex gap-2 mt-2">
                                        {user?.isPlatformOwner && <Badge variant="info">Platform Owner</Badge>}
                                        {user?.is_tenant_admin && <Badge variant="warning">Tenant Admin</Badge>}
                                        <Badge variant="success">Active</Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Form Fields */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="First Name"
                                    value={formData.first_name}
                                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<User className="w-5 h-5 ml-1" />}
                                />
                                <Input
                                    label="Last Name"
                                    value={formData.last_name}
                                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<User className="w-5 h-5 ml-1" />}
                                />
                                <Input
                                    label="Email"
                                    type="email"
                                    value={formData.email}
                                    onChange={() => { }} // Note: Email is readonly directly on the user model currently
                                    disabled={true}
                                    leftIcon={<Mail className="w-5 h-5 ml-1" />}
                                />
                                <Input
                                    label="Phone"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<Phone className="w-5 h-5 ml-1" />}
                                    placeholder="+1 (555) 000-0000"
                                />
                                <Input
                                    label="Location"
                                    value={formData.location}
                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<MapPin className="w-5 h-5 ml-1" />}
                                    placeholder="City, Country"
                                />
                                <Input
                                    label="Timezone"
                                    value={formData.timezone}
                                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<Calendar className="w-5 h-5 ml-1" />}
                                    placeholder="e.g. America/Los_Angeles"
                                />
                            </div>

                            <div className="mt-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
                                <textarea
                                    value={formData.bio}
                                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                    disabled={!isEditing}
                                    rows={4}
                                    placeholder="Tell us a bit about yourself..."
                                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-150 disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-900"
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
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    <div>
                                        <p className="font-medium text-gray-900">Password</p>
                                        <p className="text-sm text-gray-500">Regularly update your password</p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setShowPasswordForm((v) => !v);
                                            setPasswordData({ current: '', newPwd: '', confirm: '' });
                                        }}
                                    >
                                        {showPasswordForm ? 'Cancel' : 'Change Password'}
                                    </Button>
                                </div>

                                {showPasswordForm && (
                                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                                        {/* Current password */}
                                        <div className="relative">
                                            <Input
                                                label="Current Password"
                                                type={showCurrentPwd ? 'text' : 'password'}
                                                value={passwordData.current}
                                                onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
                                                leftIcon={<Lock className="w-5 h-5 ml-1" />}
                                                placeholder="Enter your current password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrentPwd((v) => !v)}
                                                className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
                                            >
                                                {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        {/* New password */}
                                        <div className="relative">
                                            <Input
                                                label="New Password"
                                                type={showNewPwd ? 'text' : 'password'}
                                                value={passwordData.newPwd}
                                                onChange={(e) => setPasswordData({ ...passwordData, newPwd: e.target.value })}
                                                leftIcon={<Lock className="w-5 h-5 ml-1" />}
                                                placeholder="At least 8 characters"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowNewPwd((v) => !v)}
                                                className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
                                            >
                                                {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        {/* Confirm new password */}
                                        <div className="relative">
                                            <Input
                                                label="Confirm New Password"
                                                type={showConfirmPwd ? 'text' : 'password'}
                                                value={passwordData.confirm}
                                                onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                                                leftIcon={<Lock className="w-5 h-5 ml-1" />}
                                                placeholder="Repeat new password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPwd((v) => !v)}
                                                className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
                                            >
                                                {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <div className="flex justify-end pt-1">
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={handleChangePassword}
                                                disabled={passwordSaving}
                                            >
                                                {passwordSaving ? 'Saving...' : 'Update Password'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right Column - Stats & Activity */}
                <div className="space-y-6">
                    {/* Stats Card */}
                    <Card variant="elevated">
                        <div className="p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Overview</h2>
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
                </div>
            </div>
        </div>
    );
};
