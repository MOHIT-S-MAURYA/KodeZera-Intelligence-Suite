import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    MessageSquare,
    FileText,
    Users,
    Building2,
    Shield,
    FileSearch,
    X,
    Crown,
    BarChart3,
    ShieldAlert,
    Brain,
    Lock,
    Headphones,
} from 'lucide-react';
import clsx from 'clsx';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';

interface NavItem {
    name: string;
    path: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
}

const tenantNavItems: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { name: 'AI Chat', path: '/chat', icon: <MessageSquare className="w-5 h-5" /> },
    { name: 'Documents', path: '/documents', icon: <FileText className="w-5 h-5" /> },
    { name: 'Users', path: '/users', icon: <Users className="w-5 h-5" />, adminOnly: true },
    { name: 'Departments', path: '/departments', icon: <Building2 className="w-5 h-5" />, adminOnly: true },
    { name: 'Roles', path: '/roles', icon: <Shield className="w-5 h-5" />, adminOnly: true },
    { name: 'Audit Logs', path: '/audit-logs', icon: <FileSearch className="w-5 h-5" />, adminOnly: true },
];

const platformOwnerNavItems: NavItem[] = [
    { name: 'Dashboard', path: '/platform', icon: <Crown className="w-5 h-5" /> },
    { name: 'Tenants', path: '/platform/tenants', icon: <Building2 className="w-5 h-5" /> },
    { name: 'Usage Analytics', path: '/platform/analytics', icon: <BarChart3 className="w-5 h-5" /> },
    { name: 'Security', path: '/platform/security', icon: <ShieldAlert className="w-5 h-5" /> },
    { name: 'AI Configuration', path: '/platform/ai-config', icon: <Brain className="w-5 h-5" /> },
    { name: 'Permissions', path: '/platform/permissions', icon: <Lock className="w-5 h-5" /> },
    { name: 'Audit Logs', path: '/platform/audit-logs', icon: <FileSearch className="w-5 h-5" /> },
    { name: 'Support', path: '/platform/support', icon: <Headphones className="w-5 h-5" /> },
];

export const Sidebar: React.FC = () => {
    const { sidebarOpen, setSidebarOpen } = useUIStore();
    const { isPlatformOwner } = useAuthStore();

    // Determine which navigation items to show
    const navItems = isPlatformOwner ? platformOwnerNavItems : tenantNavItems;

    return (
        <>
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={clsx(
                    'fixed lg:sticky top-0 left-0 h-screen bg-gray-900 text-white transition-transform duration-300 z-50',
                    'w-64 flex flex-col',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                )}
            >
                {/* Mobile close button */}
                <div className="lg:hidden flex justify-end p-4">
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="text-gray-400 hover:text-white"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/platform' || item.path === '/dashboard'}
                            onClick={() => {
                                // Close sidebar on mobile after navigation
                                if (window.innerWidth < 1024) {
                                    setSidebarOpen(false);
                                }
                            }}
                            className={({ isActive }) =>
                                clsx(
                                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-150',
                                    isActive
                                        ? 'bg-brand-600 text-white shadow-lg'
                                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                                )
                            }
                        >
                            {item.icon}
                            <span className="font-medium">{item.name}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800">
                    <p className="text-xs text-gray-500 text-center">
                        © 2026 Kodezera Intelligence Suite
                    </p>
                </div>
            </aside>
        </>
    );
};
