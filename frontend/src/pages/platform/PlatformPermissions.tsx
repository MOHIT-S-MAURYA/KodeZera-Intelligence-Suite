import React from 'react';
import { Lock, Shield, Users, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const PlatformPermissions: React.FC = () => {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Global Permissions Policy</h1>
                <p className="text-gray-600 mt-1">Configure platform-wide access controls</p>
            </div>

            {/* Placeholder banner */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                    <span className="font-semibold">Configurable permissions coming soon.</span>{' '}
                    The policy rules shown below are informational only and are enforced at the API level.
                </p>
            </div>

            {/* Permission Categories */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Lock className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Data Access</p>
                            <p className="text-lg font-semibold text-gray-900">Restricted</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                            <Shield className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">API Access</p>
                            <p className="text-lg font-semibold text-gray-900">Enabled</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                            <Users className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">User Management</p>
                            <p className="text-lg font-semibold text-gray-900">Delegated</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Permission Rules */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Permission Rules</h2>
                <div className="space-y-3">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start gap-3">
                            <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                                <h3 className="font-medium text-gray-900">Platform Owner Data Privacy</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    Platform owners cannot access tenant documents or chat messages. This is enforced at the API level.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start gap-3">
                            <Lock className="w-5 h-5 text-green-600 mt-0.5" />
                            <div>
                                <h3 className="font-medium text-gray-900">Tenant Isolation</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    All tenant data is isolated. Users can only access data within their organization.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};
