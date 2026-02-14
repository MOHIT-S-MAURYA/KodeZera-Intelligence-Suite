import React from 'react';
import { FileText, Users, MessageSquare, HardDrive, TrendingUp, ArrowUpRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useAuthStore } from '../store/auth.store';

interface StatCardProps {
    title: string;
    value: string | number;
    trend?: string;
    icon: React.ReactNode;
    color: string;
    delay: number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, trend, icon, color, delay }) => {
    return (
        <Card
            hover
            className="relative overflow-hidden animate-fade-in"
            style={{ animationDelay: `${delay}ms` }}
        >
            {/* Gradient accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${color}`} />

            <CardContent className="pl-6">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm text-gray-600 mb-1">{title}</p>
                        <h3 className="text-3xl font-bold text-gray-900 mb-2">{value}</h3>
                        {trend && (
                            <div className="flex items-center gap-1 text-success-600">
                                <TrendingUp className="w-4 h-4" />
                                <span className="text-sm font-medium">{trend}</span>
                            </div>
                        )}
                    </div>
                    <div className={`w-12 h-12 rounded-lg ${color.replace('bg-gradient-to-b', 'bg')} bg-opacity-10 flex items-center justify-center`}>
                        {icon}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export const Dashboard: React.FC = () => {
    const { user } = useAuthStore();

    const stats = [
        {
            title: 'Total Documents',
            value: '1,234',
            trend: '+12% this month',
            icon: <FileText className="w-6 h-6 text-brand-600" />,
            color: 'bg-gradient-to-b from-brand-500 to-brand-600',
        },
        {
            title: 'Active Users',
            value: '45',
            trend: '+8% this week',
            icon: <Users className="w-6 h-6 text-success-600" />,
            color: 'bg-gradient-to-b from-success-500 to-success-600',
        },
        {
            title: 'Queries Today',
            value: '234',
            trend: '+23% vs yesterday',
            icon: <MessageSquare className="w-6 h-6 text-info-600" />,
            color: 'bg-gradient-to-b from-info-500 to-info-600',
        },
        {
            title: 'Storage Used',
            value: '89 GB',
            trend: undefined,
            icon: <HardDrive className="w-6 h-6 text-warning-600" />,
            color: 'bg-gradient-to-b from-warning-500 to-warning-600',
        },
    ];

    const recentActivities = [
        { user: 'John Doe', action: 'uploaded a document', resource: 'Q4 Report.pdf', time: '2 minutes ago' },
        { user: 'Jane Smith', action: 'queried', resource: 'Product Documentation', time: '15 minutes ago' },
        { user: 'Mike Johnson', action: 'created a role', resource: 'Content Editor', time: '1 hour ago' },
        { user: 'Sarah Williams', action: 'added a user', resource: 'tom@example.com', time: '2 hours ago' },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Welcome Section */}
            <div>
                <h1 className="text-display-sm text-gray-900 mb-2">
                    Welcome back, {user?.first_name}! 👋
                </h1>
                <p className="text-body-md text-gray-600">
                    Here's what's happening with your organization today.
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, index) => (
                    <StatCard key={stat.title} {...stat} delay={index * 100} />
                ))}
            </div>

            {/* Recent Activity & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentActivities.map((activity, index) => (
                                <div key={index} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                        {activity.user[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-900">
                                            <span className="font-medium">{activity.user}</span>{' '}
                                            <span className="text-gray-600">{activity.action}</span>{' '}
                                            <span className="font-medium text-brand-600">{activity.resource}</span>
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">{activity.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <button className="w-full flex items-center justify-between p-3 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 transition-colors group">
                                <span className="font-medium">Upload Document</span>
                                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                            <button className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors group">
                                <span className="font-medium">Start Chat</span>
                                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                            <button className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors group">
                                <span className="font-medium">View Reports</span>
                                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* System Status */}
            <Card>
                <CardHeader>
                    <CardTitle>System Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center justify-between p-4 bg-success-50 rounded-lg">
                            <div>
                                <p className="text-sm text-success-700 font-medium">API Status</p>
                                <p className="text-xs text-success-600 mt-1">All systems operational</p>
                            </div>
                            <Badge variant="success">Healthy</Badge>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-info-50 rounded-lg">
                            <div>
                                <p className="text-sm text-info-700 font-medium">Vector DB</p>
                                <p className="text-xs text-info-600 mt-1">Connected to Qdrant</p>
                            </div>
                            <Badge variant="info">Active</Badge>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-success-50 rounded-lg">
                            <div>
                                <p className="text-sm text-success-700 font-medium">Cache</p>
                                <p className="text-xs text-success-600 mt-1">Redis running</p>
                            </div>
                            <Badge variant="success">Online</Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
