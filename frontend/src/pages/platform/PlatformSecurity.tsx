import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const PlatformSecurity: React.FC = () => {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Security & Abuse Monitoring</h1>
                <p className="text-gray-600 mt-1">Monitor security threats and abuse patterns</p>
            </div>

            {/* Security Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Security Score</p>
                            <p className="text-2xl font-bold text-gray-900">98%</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Active Alerts</p>
                            <p className="text-2xl font-bold text-gray-900">0</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                            <ShieldAlert className="w-6 h-6 text-red-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Blocked Attempts (24h)</p>
                            <p className="text-2xl font-bold text-gray-900">0</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Security Events */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Security Events</h2>
                <div className="text-center py-12">
                    <ShieldAlert className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No security events to display</p>
                </div>
            </Card>
        </div>
    );
};
