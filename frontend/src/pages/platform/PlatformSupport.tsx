import React from 'react';
import { Headphones, AlertCircle, CheckCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

export const PlatformSupport: React.FC = () => {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Support & Emergency Access</h1>
                <p className="text-gray-600 mt-1">Manage support requests and emergency access</p>
            </div>

            {/* Support Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Headphones className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Open Tickets</p>
                            <p className="text-2xl font-bold text-gray-900">0</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Resolved Today</p>
                            <p className="text-2xl font-bold text-gray-900">0</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                            <AlertCircle className="w-6 h-6 text-red-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Emergency Access</p>
                            <p className="text-2xl font-bold text-gray-900">Disabled</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Emergency Access */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Emergency Access</h2>
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-gray-900">Emergency Access Protocol</h3>
                            <p className="text-sm text-gray-600 mt-1">
                                Emergency access allows temporary access to tenant data for critical support issues.
                                All emergency access is logged and requires justification.
                            </p>
                            <Badge variant="error" className="mt-2">Currently Disabled</Badge>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Support Tickets */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Support Tickets</h2>
                <div className="text-center py-12">
                    <Headphones className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No support tickets</p>
                </div>
            </Card>
        </div>
    );
};
