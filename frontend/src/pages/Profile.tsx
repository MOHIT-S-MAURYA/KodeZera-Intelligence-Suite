import React, { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { User, Mail, Phone, MapPin, Shield, Activity, Camera, RefreshCw, Lock, Calendar, Smartphone, Monitor, Trash2, ShieldCheck, Copy } from 'lucide-react';
import authService from '../services/auth.service';
import type { SessionInfo, MFADevice, MFASetupResponse } from '../services/auth.service';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { useAuthStore } from '../store/auth.store';

const FALLBACK_TIMEZONES = [
    'UTC', 'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage',
    'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
    'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'Atlantic/Azores',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Helsinki',
    'Europe/Istanbul', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dhaka',
    'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney',
    'Pacific/Auckland',
];

function buildTimezoneOptions() {
    const now = new Date();
    const intlWithExtensions = Intl as { supportedValuesOf?: (key: string) => string[] };
    const zones: string[] = intlWithExtensions.supportedValuesOf
        ? intlWithExtensions.supportedValuesOf('timeZone')
        : FALLBACK_TIMEZONES;

    // Use a Map keyed by "offset|longName" to collapse duplicates.
    // The first IANA zone encountered for each unique combo is kept.
    const seen = new Map<string, { label: string; value: string; searchText: string; _offset: number }>();

    for (const tz of zones) {
        try {
            const getPart = (tzName: Intl.DateTimeFormatOptions['timeZoneName']) =>
                new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: tzName })
                    .formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? '';

            const rawOffset = getPart('shortOffset') || 'GMT+0'; // e.g. "GMT+5:30"
            const shortCode = getPart('short');                   // e.g. "IST", "PST"
            const longName  = getPart('long') || tz;             // e.g. "India Standard Time"

            const dedupeKey = `${rawOffset}|${longName}`;
            if (seen.has(dedupeKey)) continue;

            // Only show shortCode if it is a real abbreviation, not just the offset echoed back
            const isRealCode = shortCode && shortCode !== rawOffset && !/^GMT[+-]/.test(shortCode);
            const codeStr = isRealCode ? ` ${shortCode}` : '';
            const label = `(${rawOffset})${codeStr} · ${longName}`;
            const searchText = `${rawOffset} ${shortCode} ${longName} ${tz}`.toLowerCase();

            seen.set(dedupeKey, { label, value: tz, searchText, _offset: parseOffsetMinutes(rawOffset) });
        } catch {
            // skip unsupported zones
        }
    }

    const opts = Array.from(seen.values());
    // Sort west → east by offset, then alphabetically within the same offset
    opts.sort((a, b) => a._offset !== b._offset ? a._offset - b._offset : a.label.localeCompare(b.label));
    return opts.map(({ label, value, searchText }) => ({ label, value, searchText }));
}

function parseOffsetMinutes(offsetStr: string): number {
    const m = offsetStr.match(/([+-])(\d{1,2}):?(\d{0,2})/);
    if (!m) return 0;
    const sign = m[1] === '+' ? 1 : -1;
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
}

const TIMEZONE_OPTIONS = buildTimezoneOptions();
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

    // Sessions state
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);

    // MFA state
    const [mfaDevices, setMfaDevices] = useState<MFADevice[]>([]);
    const [mfaSetup, setMfaSetup] = useState<MFASetupResponse | null>(null);
    const [mfaConfirmCode, setMfaConfirmCode] = useState('');
    const [mfaLoading, setMfaLoading] = useState(false);

    const [formData, setFormData] = useState<ProfileData>({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        location: '',
        bio: '',
        timezone: '',
    });

    const fetchSessions = useCallback(async () => {
        setSessionsLoading(true);
        try {
            const data = await authService.getSessions();
            setSessions(data);
        } catch { /* ignore */ } finally {
            setSessionsLoading(false);
        }
    }, []);

    const fetchMFADevices = useCallback(async () => {
        try {
            const data = await authService.getMFADevices();
            setMfaDevices(data);
        } catch { /* ignore */ }
    }, []);

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
            } catch (_error) {
                addToast('error', 'Failed to load profile. Please refresh the page.');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
        fetchSessions();
        fetchMFADevices();
    }, [fetchSessions, fetchMFADevices]);

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
        } catch (_error) {
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
        if (passwordData.newPwd === passwordData.current) {
            addToast('error', 'New password must be different from your current password.');
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
        } catch (error) {
            const err = error as { response?: { data?: { error?: string } } };
            const msg = err?.response?.data?.error || 'Failed to change password. Please try again.';
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
                                    placeholder="Enter your first name"
                                />
                                <Input
                                    label="Last Name"
                                    value={formData.last_name}
                                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                    disabled={!isEditing}
                                    leftIcon={<User className="w-5 h-5 ml-1" />}
                                    placeholder="Enter your last name"
                                />
                                <Input
                                    label="Email Address"
                                    type="email"
                                    value={formData.email}
                                    onChange={() => { }} // Note: Email is readonly directly on the user model currently
                                    disabled={true}
                                    leftIcon={<Mail className="w-5 h-5 ml-1" />}
                                    placeholder="your@email.com"
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
                                <div>
                                    <SearchableSelect
                                        label="Timezone"
                                        options={TIMEZONE_OPTIONS}
                                        value={formData.timezone}
                                        onChange={(val) => setFormData({ ...formData, timezone: val })}
                                        disabled={!isEditing}
                                        placeholder="Search timezone…"
                                    />
                                </div>
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
                                {/* Password Section */}
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
                                        <Input
                                            label="Current Password"
                                            type="password"
                                            value={passwordData.current}
                                            onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
                                            leftIcon={<Lock className="w-5 h-5 ml-1" />}
                                            placeholder="Enter your current password"
                                        />
                                        <Input
                                            label="New Password"
                                            type="password"
                                            value={passwordData.newPwd}
                                            onChange={(e) => setPasswordData({ ...passwordData, newPwd: e.target.value })}
                                            leftIcon={<Lock className="w-5 h-5 ml-1" />}
                                            placeholder="At least 8 characters"
                                        />
                                        <Input
                                            label="Confirm New Password"
                                            type="password"
                                            value={passwordData.confirm}
                                            onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                                            leftIcon={<Lock className="w-5 h-5 ml-1" />}
                                            placeholder="Repeat new password"
                                        />
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

                                {/* MFA Section */}
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    <div>
                                        <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                                        <p className="text-sm text-gray-500">
                                            {mfaDevices.length > 0 ? `${mfaDevices.length} device(s) configured` : 'Not enabled'}
                                        </p>
                                    </div>
                                    {mfaDevices.length === 0 ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            loading={mfaLoading}
                                            onClick={async () => {
                                                setMfaLoading(true);
                                                try {
                                                    const data = await authService.setupMFA();
                                                    setMfaSetup(data);
                                                } catch { addToast('error', 'Failed to start MFA setup.'); }
                                                finally { setMfaLoading(false); }
                                            }}
                                        >
                                            <ShieldCheck className="w-4 h-4 mr-1" /> Enable MFA
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={async () => {
                                                const pw = prompt('Enter your password to disable MFA:');
                                                if (!pw) return;
                                                try {
                                                    await authService.disableMFA(pw);
                                                    setMfaDevices([]);
                                                    addToast('success', 'MFA disabled.');
                                                } catch { addToast('error', 'Failed to disable MFA. Check your password.'); }
                                            }}
                                        >
                                            Disable MFA
                                        </Button>
                                    )}
                                </div>

                                {/* MFA Setup flow */}
                                {mfaSetup && (
                                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                                        <p className="text-sm font-medium text-gray-900">Scan this QR code with your authenticator app:</p>
                                        <div className="flex justify-center">
                                            <img src={mfaSetup.qr_code} alt="MFA QR Code" className="w-48 h-48 border rounded" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 text-xs bg-white p-2 rounded border font-mono break-all">{mfaSetup.secret}</code>
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(mfaSetup.secret); addToast('info', 'Secret copied!'); }}
                                                className="p-2 hover:bg-gray-200 rounded"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <Input
                                                type="text"
                                                label="Verification Code"
                                                value={mfaConfirmCode}
                                                onChange={(e) => setMfaConfirmCode(e.target.value)}
                                                placeholder="6-digit code"
                                                maxLength={6}
                                            />
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                className="mt-6"
                                                loading={mfaLoading}
                                                onClick={async () => {
                                                    setMfaLoading(true);
                                                    try {
                                                        await authService.confirmMFA(mfaConfirmCode);
                                                        addToast('success', 'MFA enabled successfully!');
                                                        setMfaSetup(null);
                                                        setMfaConfirmCode('');
                                                        fetchMFADevices();
                                                    } catch { addToast('error', 'Invalid code. Try again.'); }
                                                    finally { setMfaLoading(false); }
                                                }}
                                            >
                                                Verify
                                            </Button>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => { setMfaSetup(null); setMfaConfirmCode(''); }}>Cancel</Button>
                                    </div>
                                )}

                                {/* MFA Devices list */}
                                {mfaDevices.length > 0 && (
                                    <div className="space-y-2">
                                        {mfaDevices.map((device) => (
                                            <div key={device.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                                                <div className="flex items-center gap-3">
                                                    <ShieldCheck className="w-5 h-5 text-green-600" />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{device.name || device.device_type.toUpperCase()}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {device.is_primary && 'Primary · '}
                                                            {device.last_used_at ? `Last used ${new Date(device.last_used_at).toLocaleDateString()}` : 'Never used'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            await authService.removeMFADevice(device.id);
                                                            fetchMFADevices();
                                                            addToast('success', 'Device removed.');
                                                        } catch { addToast('error', 'Failed to remove device.'); }
                                                    }}
                                                    className="p-1 text-gray-400 hover:text-red-600"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Active Sessions Card */}
                    <Card variant="elevated">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <Monitor className="w-6 h-6 text-brand-600" />
                                    <h2 className="text-xl font-semibold text-gray-900">Active Sessions</h2>
                                </div>
                                <Button variant="ghost" size="sm" onClick={fetchSessions} disabled={sessionsLoading}>
                                    <RefreshCw className={clsx('w-4 h-4', sessionsLoading && 'animate-spin')} />
                                </Button>
                            </div>
                            <div className="space-y-3">
                                {sessions.length === 0 && !sessionsLoading && (
                                    <p className="text-sm text-gray-500">No active sessions found.</p>
                                )}
                                {sessions.map((session) => (
                                    <div key={session.id} className={clsx(
                                        'flex items-center justify-between p-3 rounded-lg border',
                                        session.is_current ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-200',
                                    )}>
                                        <div className="flex items-center gap-3">
                                            <Smartphone className="w-5 h-5 text-gray-500" />
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {session.device_name}
                                                    {session.is_current && <span className="ml-2 text-xs text-brand-600 font-semibold">(This device)</span>}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {session.ip_address}{session.location ? ` · ${session.location}` : ''}
                                                    {' · '}
                                                    {new Date(session.last_active_at).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                        {!session.is_current && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await authService.revokeSession(session.id);
                                                        fetchSessions();
                                                        addToast('success', 'Session revoked.');
                                                    } catch { addToast('error', 'Failed to revoke session.'); }
                                                }}
                                                className="text-sm text-red-600 hover:text-red-800 font-medium"
                                            >
                                                Revoke
                                            </button>
                                        )}
                                    </div>
                                ))}
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
