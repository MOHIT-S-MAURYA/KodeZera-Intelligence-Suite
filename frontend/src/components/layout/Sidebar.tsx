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
    ToggleLeft,
    CreditCard,
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
    { name: 'My Analytics', path: '/my-analytics', icon: <BarChart3 className="w-5 h-5" /> },
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
    { name: 'Subscriptions', path: '/platform/subscriptions', icon: <CreditCard className="w-5 h-5" /> },
    { name: 'Feature Flags', path: '/platform/feature-flags', icon: <ToggleLeft className="w-5 h-5" /> },
    { name: 'Permissions', path: '/platform/permissions', icon: <Lock className="w-5 h-5" /> },
    { name: 'Audit Logs', path: '/platform/audit-logs', icon: <FileSearch className="w-5 h-5" /> },
    { name: 'Support', path: '/platform/support', icon: <Headphones className="w-5 h-5" /> },
];

export const Sidebar: React.FC = () => {
    const { sidebarOpen, setSidebarOpen } = useUIStore();
    const { isPlatformOwner, user } = useAuthStore();

    // Determine which navigation items to show;
    // for tenant users filter out adminOnly items unless the user is a tenant admin.
    const allItems = isPlatformOwner ? platformOwnerNavItems : tenantNavItems;
    const navItems = isPlatformOwner
        ? allItems
        : allItems.filter(item => !item.adminOnly || !!user?.is_tenant_admin);

    return (
        <>
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden transition-opacity duration-300"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={clsx(
                    'fixed lg:sticky top-0 left-0 h-screen bg-background-secondary border-r border-border text-text-main transition-transform duration-300 ease-in-out z-50',
                    'w-64 flex flex-col shadow-lg lg:shadow-none',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                )}
            >
                {/* Brand header — visible on all screen sizes */}
                <div className="flex items-center justify-between px-5 h-16 flex-shrink-0 border-b border-border">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-accent-cyan text-white flex-shrink-0 flex items-center justify-center shadow-sm">
                            <span className="font-bold text-sm">K</span>
                        </div>
                        <span className="text-text-main font-bold text-sm truncate tracking-tight">Kodezera</span>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden text-text-muted hover:text-text-main transition-colors flex-shrink-0 hover:bg-surface-hover p-1.5 rounded-md"
                        aria-label="Close sidebar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
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
                                    'flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-medium',
                                    isActive
                                        ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 shadow-sm'
                                        : 'text-text-muted hover:bg-surface-hover hover:text-text-main hover:pl-5 hover-lift'
                                )
                            }
                        >
                            <span className={clsx("transition-transform duration-200", ({ isActive }: { isActive: boolean }) => isActive ? 'scale-110' : '')}>
                                {item.icon}
                            </span>
                            <span className="text-sm">{item.name}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-border mt-auto">
                    <div className="bg-surface rounded-xl p-3 border border-border-light text-center">
                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                            Enterprise Edition
                        </p>
                        <p className="text-[10px] text-text-muted opacity-70">
                            © 2026 Kodezera
                        </p>
                    </div>
                </div>
            </aside>
        </>
    );
};
