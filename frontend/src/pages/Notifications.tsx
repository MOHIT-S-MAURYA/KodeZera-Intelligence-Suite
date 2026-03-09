import React, { useEffect } from 'react';
import { useUIStore } from '../store/ui.store';
import { Card } from '../components/ui/Card';
import { Bell, Check, Trash2, Clock } from 'lucide-react';

export const Notifications: React.FC = () => {
    const { notifications, notificationsLoading, fetchNotifications, markAsRead, markAllAsRead, removeNotification } = useUIStore();
    const unreadCount = notifications.filter(n => n.unread).length;

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
                    <p className="text-sm text-gray-600">
                        You have {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                    </p>
                </div>
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

            <div className="space-y-4">
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
                        <h3 className="text-lg font-medium text-gray-900">No notifications yet</h3>
                        <p className="text-gray-500 mt-1">You'll see updates here as actions happen in your organisation.</p>
                    </Card>
                ) : (
                    notifications.map((notification) => (
                        <Card
                            key={notification.id}
                            className={`transition-colors ${notification.unread ? 'bg-blue-50/50 border-blue-100' : 'bg-white'}`}
                        >
                            <div className="p-4 flex gap-4">
                                <div className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${notification.unread ? 'bg-blue-600' : 'bg-transparent'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h4 className={`text-sm ${notification.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                                                {notification.title}
                                            </h4>
                                            <p className="mt-1 text-sm text-gray-600">
                                                {notification.message}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="flex items-center text-xs text-gray-500">
                                                <Clock className="w-3 h-3 mr-1" />
                                                {notification.time}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-3">
                                        {notification.unread && (
                                            <button
                                                onClick={() => markAsRead(notification.id)}
                                                className="text-xs font-medium text-brand-600 hover:text-brand-700"
                                            >
                                                Mark as read
                                            </button>
                                        )}
                                        <button
                                            onClick={() => removeNotification(notification.id)}
                                            className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};
