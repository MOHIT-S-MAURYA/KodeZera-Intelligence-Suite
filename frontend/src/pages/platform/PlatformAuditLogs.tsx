import React, { useEffect, useState } from 'react';
import { FileSearch, Filter } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import platformOwnerService from '../../services/platformOwner.service';
import type { AuditLog } from '../../services/platformOwner.service';

export const PlatformAuditLogs: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAuditLogs();
    }, []);

    const loadAuditLogs = async () => {
        try {
            const response = await platformOwnerService.getAuditLogs();
            setLogs(response.logs);
        } catch (error) {
            console.error('Failed to load audit logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const getActionColor = (action: string) => {
        if (action.includes('created')) return 'success';
        if (action.includes('deleted')) return 'error';
        if (action.includes('suspended')) return 'warning';
        return 'info';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">System Audit Logs</h1>
                    <p className="text-gray-600 mt-1">Track all platform-level actions</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    <Filter className="w-4 h-4" />
                    Filter
                </button>
            </div>

            {/* Audit Logs */}
            {loading ? (
                <Card>
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto"></div>
                        <p className="text-gray-600 mt-4">Loading audit logs...</p>
                    </div>
                </Card>
            ) : (
                <Card>
                    <div className="space-y-3">
                        {logs.length > 0 ? (
                            logs.map((log) => (
                                <div key={log.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant={getActionColor(log.action) as any}>
                                                    {log.action.replace(/_/g, ' ')}
                                                </Badge>
                                                <span className="text-sm text-gray-600">
                                                    by {log.performed_by}
                                                </span>
                                            </div>
                                            {log.tenant_affected && (
                                                <p className="text-sm text-gray-600">
                                                    Tenant: {log.tenant_affected}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-1">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12">
                                <FileSearch className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-600">No audit logs found</p>
                            </div>
                        )}
                    </div>
                </Card>
            )}
        </div>
    );
};
