import React, { useEffect, useState } from 'react';
import { useUIStore } from '../store/ui.store';
import { Card } from '../components/ui/Card';
import { Bell, Check, Trash2, Clock, Settings, AlertTriangle, Info, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import type { NotificationCategory, NotificationData } from '../services/notification.service';

const CATEGORIES: { key: NotificationCategory | null; label: string }[] = [
    { key: null, label: 'All' },
    { key: 'documents', label: 'Documents' },
    { key: 'chat', label: 'Chat' },
    { key: 'system', label: 'System' },
    { key: 'admin', label: 'Admin' },
    { key: 'security', label: 'Security' },
    { key: 'user_management', label: 'Users' },
];

const PRIORITY_COLORS: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    normal: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
    info: <Info className="w-4 h-4 text-blue-500" />,
    success: <CheckCircle className="w-4 h-4 text-green-500" />,
    warning: <AlertTriangle className="w-4 h-4 text-orange-500" />,
    error: <XCircle className="w-4 h-4 text-red-500" />,
    system: <Bell className="w-4 h-4 text-gray-500" />,
};

const DIGEST_LABELS: Record<string, string> = {
    instant: 'Instant',
    hourly: 'Hourly',
    daily: 'Daily',
    weekly: 'Weekly',
};

export const Notifications: React.FC = () => {
    const {
        notifications, notificationsLoading, notificationsTotal,
        unreadCount, notificationCategory,
        fetchNotifications, fetchUnreadCount, setNotificationCategory,
        markAsRead, markAllAsRead, removeNotification,
        preferences, preferencesLoading, fetchPreferences, updatePreferences,
    } = useUIStore();

    const [showPreferences, setShowPreferences] = useState(false);

    useEffect(() => {
        fetchNotifications(true);
        fetchUnreadCount();
    }, [fetchNotifications, fetchUnreadCount]);

    const handleLoadMore = () => {
        fetchNotifications(false);
    };

    const hasMore = notifications.length < notificationsTotal;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
                    <p className="text-sm text-gray-600">
                        You have {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { setShowPreferences(!showPreferences); if (!showPreferences) fetchPreferences(); }}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                        <Settings className="w-4 h-4 mr-2" />
                        Preferences
                    </button>
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
                        >
                            <Check className="w-4 h-4 mr-2" />
                            Mark all as read
                        </button>
                    )}
                </div>
            </div>

            {/* Preferences Panel */}
            {showPreferences && (
                <PreferencesPanel
                    preferences={preferences}
                    loading={preferencesLoading}
                    onUpdate={updatePreferences}
                />
            )}

            {/* Category Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
                {CATEGORIES.map(({ key, label }) => (
                    <button
                        key={label}
                        onClick={() => setNotificationCategory(key)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                            notificationCategory === key
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Notification List */}
            <div className="space-y-3">
                {notificationsLoading && notifications.length === 0 ? (
                    <Card className="p-12 flex flex-col items-center justify-center text-center">
                        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4" />
                        <p className="text-gray-500">Loading notifications…</p>
                    </Card>
                ) : notifications.length === 0 ? (
                    <Card className="p-12 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Bell className="w-6 h-6 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">No notifications</h3>
                        <p className="text-gray-500 mt-1">
                            {notificationCategory ? `No ${notificationCategory} notifications.` : "You'll see updates here as actions happen in your organisation."}
                        </p>
                    </Card>
                ) : (
                    <>
                        {notifications.map((notification) => (
                            <NotificationCard
                                key={notification.id}
                                notification={notification}
                                onMarkRead={markAsRead}
                                onDismiss={removeNotification}
                            />
                        ))}
                        {hasMore && (
                            <div className="flex justify-center pt-2">
                                <button
                                    onClick={handleLoadMore}
                                    disabled={notificationsLoading}
                                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                                >
                                    {notificationsLoading ? (
                                        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 mr-2" />
                                    )}
                                    Load more ({notificationsTotal - notifications.length} remaining)
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};


// ── NotificationCard ──────────────────────────────────────────────────────

const NotificationCard: React.FC<{
    notification: NotificationData;
    onMarkRead: (id: string) => void;
    onDismiss: (id: string) => void;
}> = ({ notification, onMarkRead, onDismiss }) => {
    const isUnread = !notification.is_read;

    return (
        <Card className={`transition-colors ${isUnread ? 'bg-blue-50/50 border-blue-100' : 'bg-white'}`}>
            <div className="p-4 flex gap-3">
                {/* Unread dot */}
                <div className={`mt-1.5 flex-shrink-0 w-2 h-2 rounded-full ${isUnread ? 'bg-blue-600' : 'bg-transparent'}`} />

                {/* Type icon */}
                <div className="mt-0.5 flex-shrink-0">
                    {TYPE_ICONS[notification.notification_type] || TYPE_ICONS.info}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className={`text-sm ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                                    {notification.title}
                                </h4>
                                {notification.priority && notification.priority !== 'normal' && (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[notification.priority]}`}>
                                        {notification.priority}
                                    </span>
                                )}
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                    {notification.category}
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                        </div>
                        <span className="flex items-center text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
                            <Clock className="w-3 h-3 mr-1" />
                            {notification.time_ago || notification.time}
                        </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                        {notification.action_url && (
                            <a
                                href={notification.action_url}
                                className="text-xs font-medium text-brand-600 hover:text-brand-700"
                            >
                                View details
                            </a>
                        )}
                        {isUnread && (
                            <button
                                onClick={() => onMarkRead(notification.id)}
                                className="text-xs font-medium text-brand-600 hover:text-brand-700"
                            >
                                Mark as read
                            </button>
                        )}
                        <button
                            onClick={() => onDismiss(notification.id)}
                            className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        </Card>
    );
};


// ── Preferences Panel ─────────────────────────────────────────────────────

import type { NotificationPreference } from '../services/notification.service';

const CATEGORY_LABELS: Record<string, string> = {
    documents: 'Documents',
    chat: 'Chat',
    system: 'System',
    admin: 'Admin',
    security: 'Security',
    user_management: 'User Management',
};

const PreferencesPanel: React.FC<{
    preferences: NotificationPreference[];
    loading: boolean;
    onUpdate: (prefs: NotificationPreference[]) => void;
}> = ({ preferences, loading, onUpdate }) => {
    const [localPrefs, setLocalPrefs] = useState<NotificationPreference[]>([]);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        setLocalPrefs(preferences);
        setDirty(false);
    }, [preferences]);

    const togglePref = (cat: string, ch: string) => {
        setLocalPrefs((prev) =>
            prev.map((p) =>
                p.category === cat && p.channel === ch && !p.mandatory
                    ? { ...p, enabled: !p.enabled }
                    : p
            )
        );
        setDirty(true);
    };

    const setDigest = (cat: string, ch: string, mode: string) => {
        setLocalPrefs((prev) =>
            prev.map((p) =>
                p.category === cat && p.channel === ch
                    ? { ...p, digest_mode: mode as NotificationPreference['digest_mode'] }
                    : p
            )
        );
        setDirty(true);
    };

    const handleSave = () => {
        onUpdate(localPrefs);
        setDirty(false);
    };

    // Group by category
    const grouped = localPrefs.reduce<Record<string, NotificationPreference[]>>((acc, p) => {
        (acc[p.category] ??= []).push(p);
        return acc;
    }, {});

    if (loading) {
        return (
            <Card className="p-6">
                <div className="flex items-center gap-2 text-gray-500">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    Loading preferences…
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
                {dirty && (
                    <button
                        onClick={handleSave}
                        className="inline-flex items-center px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-md hover:bg-brand-700"
                    >
                        Save Changes
                    </button>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-200">
                            <th className="text-left py-2 pr-4 font-medium text-gray-700">Category</th>
                            <th className="text-center px-4 py-2 font-medium text-gray-700">In-App</th>
                            <th className="text-center px-4 py-2 font-medium text-gray-700">Email</th>
                            <th className="text-center px-4 py-2 font-medium text-gray-700">Email Digest</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(grouped).map(([category, prefs]) => {
                            const inApp = prefs.find((p) => p.channel === 'in_app');
                            const email = prefs.find((p) => p.channel === 'email');
                            return (
                                <tr key={category} className="border-b border-gray-100">
                                    <td className="py-3 pr-4 font-medium text-gray-900">
                                        {CATEGORY_LABELS[category] || category}
                                        {inApp?.mandatory && (
                                            <span className="ml-2 text-xs text-orange-600">(required)</span>
                                        )}
                                    </td>
                                    <td className="text-center px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={inApp?.enabled ?? true}
                                            disabled={inApp?.mandatory}
                                            onChange={() => togglePref(category, 'in_app')}
                                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                                        />
                                    </td>
                                    <td className="text-center px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={email?.enabled ?? false}
                                            disabled={email?.mandatory}
                                            onChange={() => togglePref(category, 'email')}
                                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                                        />
                                    </td>
                                    <td className="text-center px-4 py-3">
                                        {email?.enabled && (
                                            <select
                                                value={email?.digest_mode ?? 'instant'}
                                                onChange={(e) => setDigest(category, 'email', e.target.value)}
                                                className="text-xs border-gray-300 rounded-md"
                                            >
                                                {Object.entries(DIGEST_LABELS).map(([k, v]) => (
                                                    <option key={k} value={k}>{v}</option>
                                                ))}
                                            </select>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};
