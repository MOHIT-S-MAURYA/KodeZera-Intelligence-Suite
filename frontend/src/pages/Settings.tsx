import React, { useState } from 'react';
import {
    Settings as SettingsIcon,
    Bell,
    Shield,
    Lock,
    Moon,
    Sun,
    Database,
    Key,
    Eye,
    Download,
    Server,
    AlertTriangle,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Tabs } from '../components/ui/Tabs';
import { Badge } from '../components/ui/Badge';

export const Settings: React.FC = () => {
    // General Settings State
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [language, setLanguage] = useState('en');
    const [timezone, setTimezone] = useState('America/Los_Angeles');

    // Notification Settings State
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [pushNotifications, setPushNotifications] = useState(true);
    const [documentNotifications, setDocumentNotifications] = useState(true);
    const [userNotifications, setUserNotifications] = useState(true);
    const [systemNotifications, setSystemNotifications] = useState(false);

    // Security Settings State
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

    // Privacy Settings State
    const [dataSharing, setDataSharing] = useState(false);
    const [activityVisible, setActivityVisible] = useState(true);

    // System Settings State (Admin only)
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [autoBackup, setAutoBackup] = useState(true);

    const activeSessions = [
        { device: 'MacBook Pro', location: 'San Francisco, CA', lastActive: 'Active now', current: true },
        { device: 'iPhone 14', location: 'San Francisco, CA', lastActive: '2 hours ago', current: false },
        { device: 'iPad Air', location: 'Los Angeles, CA', lastActive: '1 day ago', current: false },
    ];

    const apiKeys = [
        { name: 'Production API Key', created: '2024-01-15', lastUsed: '2 hours ago', status: 'active' },
        { name: 'Development API Key', created: '2024-02-01', lastUsed: '5 days ago', status: 'active' },
    ];

    const tabs = [
        {
            id: 'general',
            label: 'General',
            icon: <SettingsIcon className="w-5 h-5" />,
            content: (
                <div className="space-y-6">
                    <Card variant="elevated">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Appearance</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        {theme === 'light' ? (
                                            <Sun className="w-5 h-5 text-yellow-500" />
                                        ) : (
                                            <Moon className="w-5 h-5 text-blue-500" />
                                        )}
                                        <div>
                                            <p className="font-medium text-gray-900">Theme</p>
                                            <p className="text-sm text-gray-500">
                                                {theme === 'light' ? 'Light mode' : 'Dark mode'}
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={theme === 'dark'}
                                        onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card variant="elevated">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Localization</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                                    <select
                                        value={language}
                                        onChange={(e) => setLanguage(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-150"
                                    >
                                        <option value="en">English</option>
                                        <option value="es">Spanish</option>
                                        <option value="fr">French</option>
                                        <option value="de">German</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                                    <select
                                        value={timezone}
                                        onChange={(e) => setTimezone(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-150"
                                    >
                                        <option value="America/Los_Angeles">Pacific Time (PT)</option>
                                        <option value="America/New_York">Eastern Time (ET)</option>
                                        <option value="America/Chicago">Central Time (CT)</option>
                                        <option value="Europe/London">London (GMT)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            ),
        },
        {
            id: 'notifications',
            label: 'Notifications',
            icon: <Bell className="w-5 h-5" />,
            content: (
                <div className="space-y-6">
                    <Card variant="elevated">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Channels</h3>
                            <div className="space-y-4">
                                <Switch
                                    checked={emailNotifications}
                                    onChange={setEmailNotifications}
                                    label="Email Notifications"
                                    description="Receive notifications via email"
                                />
                                <Switch
                                    checked={pushNotifications}
                                    onChange={setPushNotifications}
                                    label="Push Notifications"
                                    description="Receive push notifications in your browser"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card variant="elevated">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h3>
                            <div className="space-y-4">
                                <Switch
                                    checked={documentNotifications}
                                    onChange={setDocumentNotifications}
                                    label="Document Updates"
                                    description="Get notified when documents are uploaded or modified"
                                />
                                <Switch
                                    checked={userNotifications}
                                    onChange={setUserNotifications}
                                    label="User Activity"
                                    description="Get notified about new users and role changes"
                                />
                                <Switch
                                    checked={systemNotifications}
                                    onChange={setSystemNotifications}
                                    label="System Alerts"
                                    description="Get notified about system maintenance and updates"
                                />
                            </div>
                        </div>
                    </Card>
                </div>
            ),
        },
        {
            id: 'security',
            label: 'Security',
            icon: <Shield className="w-5 h-5" />,
            content: (
                <div className="space-y-6">
                    <Card variant="elevated">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Authentication</h3>
                            <div className="space-y-4">
                                <Switch
                                    checked={twoFactorEnabled}
                                    onChange={setTwoFactorEnabled}
                                    label="Two-Factor Authentication"
                                    description="Add an extra layer of security to your account"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card variant="elevated">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">Active Sessions</h3>
                                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                        <AlertTriangle className="w-3 h-3" />
                                        Placeholder data — session management not yet available
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" disabled title="Session management not yet available">
                                    Revoke All
                                </Button>
                            </div>
                            <div className="space-y-3">
                                {activeSessions.map((session, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded-lg">
                                                <Server className="w-5 h-5 text-gray-600" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium text-gray-900">{session.device}</p>
                                                    {session.current && (
                                                        <Badge variant="success" size="sm">
                                                            Current
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-500">
                                                    {session.location} • {session.lastActive}
                                                </p>
                                            </div>
                                        </div>
                                        {!session.current && (
                                            <Button variant="ghost" size="sm" disabled title="Session management not yet available">
                                                Revoke
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>

                    <Card variant="elevated">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">API Keys</h3>
                                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                        <AlertTriangle className="w-3 h-3" />
                                        Placeholder data — API key management not yet available
                                    </p>
                                </div>
                                <Button variant="primary" size="sm" disabled title="API key management not yet available">
                                    Generate New Key
                                </Button>
                            </div>
                            <div className="space-y-3">
                                {apiKeys.map((key, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded-lg">
                                                <Key className="w-5 h-5 text-gray-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{key.name}</p>
                                                <p className="text-sm text-gray-500">
                                                    Created {key.created} • Last used {key.lastUsed}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="success" size="sm">
                                                {key.status}
                                            </Badge>
                                            <Button variant="ghost" size="sm" disabled title="API key management not yet available">
                                                Revoke
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                </div>
            ),
        },
        {
            id: 'privacy',
            label: 'Privacy',
            icon: <Eye className="w-5 h-5" />,
            content: (
                <div className="space-y-6">
                    <Card variant="elevated">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Data & Privacy</h3>
                            <div className="space-y-4">
                                <Switch
                                    checked={dataSharing}
                                    onChange={setDataSharing}
                                    label="Data Sharing"
                                    description="Allow anonymous usage data to improve the product"
                                />
                                <Switch
                                    checked={activityVisible}
                                    onChange={setActivityVisible}
                                    label="Activity Visibility"
                                    description="Make your activity visible to team members"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card variant="elevated">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <Download className="w-5 h-5 text-gray-600" />
                                        <div>
                                            <p className="font-medium text-gray-900">Export Your Data</p>
                                            <p className="text-sm text-gray-500">
                                                Download a copy of your personal data
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm">
                                        Export
                                    </Button>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <Lock className="w-5 h-5 text-red-600" />
                                        <div>
                                            <p className="font-medium text-red-900">Delete Account</p>
                                            <p className="text-sm text-red-600">
                                                Permanently delete your account and all data
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="danger" size="sm">
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            ),
        },
        {
            id: 'system',
            label: 'System',
            icon: <Database className="w-5 h-5" />,
            content: (
                <div className="space-y-6">
                    <Card variant="elevated">
                        <div className="p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">System Configuration</h3>
                                <Badge variant="warning" size="sm">
                                    Admin Only
                                </Badge>
                            </div>
                            <div className="space-y-4">
                                <Switch
                                    checked={maintenanceMode}
                                    onChange={setMaintenanceMode}
                                    label="Maintenance Mode"
                                    description="Put the system in maintenance mode (users will be logged out)"
                                />
                                <Switch
                                    checked={autoBackup}
                                    onChange={setAutoBackup}
                                    label="Automatic Backups"
                                    description="Automatically backup data every 24 hours"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card variant="elevated">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">System Information</h3>
                                <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                                    <AlertTriangle className="w-3 h-3" />
                                    Preview data
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-500">Version</p>
                                    <p className="text-lg font-semibold text-gray-900 mt-1">v2.4.1</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-500">Last Updated</p>
                                    <p className="text-lg font-semibold text-gray-900 mt-1">Feb 15, 2026</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-500">Database Size</p>
                                    <p className="text-lg font-semibold text-gray-900 mt-1">89 GB</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-500">Total Users</p>
                                    <p className="text-lg font-semibold text-gray-900 mt-1">45</p>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-500 mt-1">Manage your application preferences and configuration</p>
            </div>

            {/* Tabs */}
            <Tabs tabs={tabs} defaultTab="general" variant="pills" />
        </div>
    );
};
