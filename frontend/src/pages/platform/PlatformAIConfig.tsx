import React from 'react';
import { Brain, Settings, Zap } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

export const PlatformAIConfig: React.FC = () => {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">AI Configuration</h1>
                <p className="text-gray-600 mt-1">Configure AI models and usage policies</p>
            </div>

            {/* AI Models */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Active AI Models</h2>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                                <Brain className="w-6 h-6 text-purple-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">GPT-4</h3>
                                <p className="text-sm text-gray-600">Primary language model</p>
                            </div>
                        </div>
                        <Badge variant="success">Active</Badge>
                    </div>

                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Zap className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">Text Embedding</h3>
                                <p className="text-sm text-gray-600">Document vectorization</p>
                            </div>
                        </div>
                        <Badge variant="success">Active</Badge>
                    </div>
                </div>
            </Card>

            {/* Usage Policies */}
            <Card>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage Policies</h2>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                            <h3 className="font-medium text-gray-900">Rate Limiting</h3>
                            <p className="text-sm text-gray-600">Configure request limits per tenant</p>
                        </div>
                        <Settings className="w-5 h-5 text-gray-400" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                            <h3 className="font-medium text-gray-900">Token Limits</h3>
                            <p className="text-sm text-gray-600">Set maximum tokens per request</p>
                        </div>
                        <Settings className="w-5 h-5 text-gray-400" />
                    </div>
                </div>
            </Card>
        </div>
    );
};
