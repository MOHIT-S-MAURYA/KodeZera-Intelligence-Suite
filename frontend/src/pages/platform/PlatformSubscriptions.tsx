import React from 'react';
import { CreditCard, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

export const PlatformSubscriptions: React.FC = () => {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Subscriptions & Billing</h1>
                <p className="text-gray-600 mt-1">Manage subscription plans and billing</p>
            </div>

            {/* Revenue Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                            <DollarSign className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Monthly Revenue</p>
                            <p className="text-2xl font-bold text-gray-900">$0</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Active Subscriptions</p>
                            <p className="text-2xl font-bold text-gray-900">0</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Trial Accounts</p>
                            <p className="text-2xl font-bold text-gray-900">1</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                            <CreditCard className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Churn Rate</p>
                            <p className="text-2xl font-bold text-gray-900">0%</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Subscription Plans */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Subscription Plans</h2>
                <div className="space-y-4">
                    {['Basic', 'Pro', 'Enterprise'].map((plan) => (
                        <div key={plan} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                            <div>
                                <h3 className="font-semibold text-gray-900">{plan}</h3>
                                <p className="text-sm text-gray-600">Configure plan limits and pricing</p>
                            </div>
                            <Badge variant="info">Coming Soon</Badge>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};
