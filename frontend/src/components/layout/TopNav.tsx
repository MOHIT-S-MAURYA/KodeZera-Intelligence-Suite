import React from 'react';
import { Menu, Bell, LogOut, User, Settings, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../ui/Avatar';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import authService from '../../services/auth.service';

export const TopNav: React.FC = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const { toggleSidebar, notifications, fetchNotifications, markAllAsRead } = useUIStore();
    const [showUserMenu, setShowUserMenu] = React.useState(false);
    const [showNotifications, setShowNotifications] = React.useState(false);

    const unreadCount = notifications.filter(n => n.unread).length;

    // Fetch real notifications on mount + poll every 60 s
    React.useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60_000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    const handleLogout = async () => {
        await authService.logout();
        logout();
        navigate('/login');
    };

    return (
        <nav className="h-16 bg-surface border-b border-border px-6 flex items-center justify-between sticky top-0 z-40 transition-colors duration-300">
            {/* Left side */}
            <div className="flex items-center gap-4">
                <button
                    onClick={toggleSidebar}
                    className="lg:hidden text-text-muted hover:text-text-main transition-colors"
                >
                    <Menu className="w-6 h-6" />
                </button>

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg gradient-primary shadow-glow-cyan flex items-center justify-center">
                        <span className="text-white font-bold text-lg">K</span>
                    </div>
                    <div className="hidden sm:block">
                        <h1 className="text-lg font-semibold text-text-main tracking-tight">Kodezera Intelligence</h1>
                        <p className="text-xs text-text-muted font-medium">{user?.tenant?.name || 'Platform Administration'}</p>
                    </div>
                </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-4">
                

                {/* Notifications */}
                <div className="relative">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="relative text-text-muted hover:text-text-main transition-colors p-2 rounded-lg hover:bg-surface-hover hover-lift"
                    >
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 w-4 h-4 bg-accent-red rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-sm">
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {showNotifications && (
                        <>
                            <div
                                className="fixed inset-0 z-10"
                                onClick={() => setShowNotifications(false)}
                            />
                            <div className="absolute right-0 mt-2 w-80 bg-surface rounded-xl shadow-glass border border-border py-1 z-20 animate-scale-in max-h-96 overflow-y-auto overflow-hidden">
                                <div className="px-4 py-3 border-b border-border-light flex items-center justify-between bg-surface sticky top-0">
                                    <h3 className="font-semibold text-text-main">Notifications</h3>
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllAsRead}
                                            className="text-xs text-accent-cyan hover:text-accent-blue font-medium transition-colors"
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                </div>
                                <div className="divide-y divide-border-light">
                                    {notifications.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-text-muted text-sm flex flex-col items-center">
                                            <Bell className="w-8 h-8 opacity-20 mb-2" />
                                            No notifications
                                        </div>
                                    ) : (
                                        notifications.slice(0, 5).map((notification) => (
                                            <div key={notification.id} className={`px-4 py-3 hover:bg-surface-hover transition-colors ${notification.unread ? 'bg-accent-blue/5' : ''}`}>
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className={`text-sm ${notification.unread ? 'font-semibold text-text-main' : 'font-medium text-text-muted'}`}>
                                                        {notification.title}
                                                    </p>
                                                    <span className="text-[10px] text-text-muted whitespace-nowrap ml-2 opacity-75">
                                                        {notification.time}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-text-muted line-clamp-2">
                                                    {notification.message}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="px-4 py-2 border-t border-border-light text-center bg-surface sticky bottom-0">
                                    <button
                                        onClick={() => {
                                            navigate('/notifications');
                                            setShowNotifications(false);
                                        }}
                                        className="text-xs font-medium text-text-muted hover:text-text-main transition-colors"
                                    >
                                        View all notifications
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* User Menu */}
                <div className="relative ml-2">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-3 hover:bg-surface-hover rounded-xl px-2 py-1.5 transition-colors border border-transparent hover:border-border"
                    >
                        <div className="hidden md:block text-right">
                            <p className="text-sm font-semibold text-text-main leading-tight">
                                {user?.first_name} {user?.last_name}
                            </p>
                            <p className="text-xs text-text-muted font-medium">{user?.email}</p>
                        </div>
                        <Avatar
                            name={`${user?.first_name} ${user?.last_name}`}
                            size="md"
                        />
                    </button>

                    {showUserMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-10"
                                onClick={() => setShowUserMenu(false)}
                            />
                            <div className="absolute right-0 mt-2 w-56 bg-surface rounded-xl shadow-glass border border-border py-2 z-20 animate-scale-in">
                                <div className="px-4 py-2 mb-1 border-b border-border-light md:hidden">
                                     <p className="text-sm font-semibold text-text-main truncate">
                                        {user?.first_name} {user?.last_name}
                                    </p>
                                    <p className="text-xs text-text-muted truncate">{user?.email}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        navigate(user?.isPlatformOwner ? '/platform' : '/dashboard');
                                        setShowUserMenu(false);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-text-muted hover:text-text-main hover:bg-surface-hover flex items-center gap-3 transition-colors"
                                >
                                    <LayoutDashboard className="w-4 h-4" />
                                    Dashboard
                                </button>
                                <button
                                    onClick={() => {
                                        navigate('/profile');
                                        setShowUserMenu(false);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-text-muted hover:text-text-main hover:bg-surface-hover flex items-center gap-3 transition-colors"
                                >
                                    <User className="w-4 h-4" />
                                    Profile
                                </button>
                                <button
                                    onClick={() => {
                                        navigate('/settings');
                                        setShowUserMenu(false);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-text-muted hover:text-text-main hover:bg-surface-hover flex items-center gap-3 transition-colors"
                                >
                                    <Settings className="w-4 h-4" />
                                    Settings
                                </button>
                                <div className="my-1 border-t border-border-light" />
                                <button
                                    onClick={handleLogout}
                                    className="w-full px-4 py-2 text-left text-sm text-accent-red hover:bg-accent-red/10 flex items-center gap-3 transition-colors font-medium"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Logout
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};
