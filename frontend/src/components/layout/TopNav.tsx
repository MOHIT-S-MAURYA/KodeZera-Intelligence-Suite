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
    const { toggleSidebar } = useUIStore();
    const [showUserMenu, setShowUserMenu] = React.useState(false);

    const handleLogout = () => {
        authService.logout();
        logout();
        navigate('/login');
    };

    return (
        <nav className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between sticky top-0 z-40">
            {/* Left side */}
            <div className="flex items-center gap-4">
                <button
                    onClick={toggleSidebar}
                    className="lg:hidden text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <Menu className="w-6 h-6" />
                </button>

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                        <span className="text-white font-bold text-lg">K</span>
                    </div>
                    <div className="hidden sm:block">
                        <h1 className="text-lg font-semibold text-gray-900">Kodezera Intelligence</h1>
                        <p className="text-xs text-gray-500">{user?.tenant?.name || 'Platform Administration'}</p>
                    </div>
                </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-4">
                <button className="relative text-gray-600 hover:text-gray-900 transition-colors">
                    <Bell className="w-6 h-6" />
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-error-500 rounded-full text-xs text-white flex items-center justify-center">
                        3
                    </span>
                </button>

                <div className="relative">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors"
                    >
                        <Avatar
                            name={`${user?.first_name} ${user?.last_name}`}
                            size="sm"
                        />
                        <div className="hidden md:block text-left">
                            <p className="text-sm font-medium text-gray-900">
                                {user?.first_name} {user?.last_name}
                            </p>
                            <p className="text-xs text-gray-500">{user?.email}</p>
                        </div>
                    </button>

                    {showUserMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-10"
                                onClick={() => setShowUserMenu(false)}
                            />
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 animate-scale-in">
                                <button
                                    onClick={() => {
                                        navigate(user?.isPlatformOwner ? '/platform' : '/dashboard');
                                        setShowUserMenu(false);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <LayoutDashboard className="w-4 h-4" />
                                    Dashboard
                                </button>
                                <button
                                    onClick={() => {
                                        navigate('/profile');
                                        setShowUserMenu(false);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <User className="w-4 h-4" />
                                    Profile
                                </button>
                                <button
                                    onClick={() => {
                                        navigate('/settings');
                                        setShowUserMenu(false);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <Settings className="w-4 h-4" />
                                    Settings
                                </button>
                                <hr className="my-1 border-gray-200" />
                                <button
                                    onClick={handleLogout}
                                    className="w-full px-4 py-2 text-left text-sm text-error-600 hover:bg-error-50 flex items-center gap-2"
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
