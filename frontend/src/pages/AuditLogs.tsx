import React from 'react';
import { Search, Calendar } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';

export const AuditLogs: React.FC = () => {
    const logs = [
        { id: 1, user: 'John Doe', action: 'Document Upload', resource: 'Q4 Report.pdf', timestamp: '2026-02-15 10:30:00', status: 'success' },
        { id: 2, user: 'Jane Smith', action: 'User Created', resource: 'tom@example.com', timestamp: '2026-02-15 09:15:00', status: 'success' },
        { id: 3, user: 'Mike Johnson', action: 'Login Failed', resource: 'Invalid credentials', timestamp: '2026-02-15 08:45:00', status: 'error' },
        { id: 4, user: 'Sarah Williams', action: 'Role Updated', resource: 'Developer Role', timestamp: '2026-02-14 16:20:00', status: 'success' },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-display-sm text-gray-900 mb-2">Audit Logs</h1>
                <p className="text-body-md text-gray-600">Track all system activities and changes</p>
            </div>

            <Card>
                <div className="flex gap-4 mb-6">
                    <div className="flex-1">
                        <Input placeholder="Search logs..." leftIcon={<Search className="w-5 h-5" />} />
                    </div>
                    <div className="flex gap-2">
                        <Input type="date" leftIcon={<Calendar className="w-5 h-5" />} />
                        <select className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500">
                            <option>All Actions</option>
                            <option>Login</option>
                            <option>Document Upload</option>
                            <option>User Created</option>
                            <option>Role Updated</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-200">
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Timestamp</th>
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">User</th>
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Action</th>
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Resource</th>
                                <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="py-3 px-4 text-gray-600 text-sm font-mono">{log.timestamp}</td>
                                    <td className="py-3 px-4 text-gray-900">{log.user}</td>
                                    <td className="py-3 px-4 text-gray-900">{log.action}</td>
                                    <td className="py-3 px-4 text-gray-600">{log.resource}</td>
                                    <td className="py-3 px-4">
                                        <Badge variant={log.status === 'success' ? 'success' : 'error'}>
                                            {log.status}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
