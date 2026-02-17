import React, { useState } from 'react';
import { Brain, Settings, Zap } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

interface RateLimitSettings {
    requests_per_minute: number;
    requests_per_hour: number;
    requests_per_day: number;
    burst_allowance: number;
}

interface TokenLimitSettings {
    max_tokens_per_request: number;
    max_tokens_per_day: number;
    max_tokens_per_month: number;
}

export const PlatformAIConfig: React.FC = () => {
    const [rateLimitModalOpen, setRateLimitModalOpen] = useState(false);
    const [tokenLimitModalOpen, setTokenLimitModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const [rateLimitSettings, setRateLimitSettings] = useState<RateLimitSettings>({
        requests_per_minute: 60,
        requests_per_hour: 1000,
        requests_per_day: 10000,
        burst_allowance: 10,
    });

    const [tokenLimitSettings, setTokenLimitSettings] = useState<TokenLimitSettings>({
        max_tokens_per_request: 4000,
        max_tokens_per_day: 100000,
        max_tokens_per_month: 2000000,
    });

    const handleRateLimitChange = (field: keyof RateLimitSettings, value: string) => {
        const numValue = parseInt(value) || 0;
        setRateLimitSettings(prev => ({ ...prev, [field]: numValue }));
    };

    const handleTokenLimitChange = (field: keyof TokenLimitSettings, value: string) => {
        const numValue = parseInt(value) || 0;
        setTokenLimitSettings(prev => ({ ...prev, [field]: numValue }));
    };

    const handleSaveRateLimits = async () => {
        setSaving(true);
        try {
            // TODO: Call backend API when endpoint is available
            // await platformOwnerService.updateRateLimits(rateLimitSettings);

            console.log('Rate limits saved:', rateLimitSettings);
            alert('Rate limits updated successfully!');
            setRateLimitModalOpen(false);
        } catch (error) {
            console.error('Failed to save rate limits:', error);
            alert('Failed to save rate limits. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveTokenLimits = async () => {
        setSaving(true);
        try {
            // TODO: Call backend API when endpoint is available
            // await platformOwnerService.updateTokenLimits(tokenLimitSettings);

            console.log('Token limits saved:', tokenLimitSettings);
            alert('Token limits updated successfully!');
            setTokenLimitModalOpen(false);
        } catch (error) {
            console.error('Failed to save token limits:', error);
            alert('Failed to save token limits. Please try again.');
        } finally {
            setSaving(false);
        }
    };

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
                    <div
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => setRateLimitModalOpen(true)}
                    >
                        <div>
                            <h3 className="font-medium text-gray-900">Rate Limiting</h3>
                            <p className="text-sm text-gray-600">Configure request limits per tenant</p>
                        </div>
                        <Settings className="w-5 h-5 text-gray-400" />
                    </div>

                    <div
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => setTokenLimitModalOpen(true)}
                    >
                        <div>
                            <h3 className="font-medium text-gray-900">Token Limits</h3>
                            <p className="text-sm text-gray-600">Set maximum tokens per request</p>
                        </div>
                        <Settings className="w-5 h-5 text-gray-400" />
                    </div>
                </div>
            </Card>

            {/* Rate Limiting Modal */}
            <Modal
                isOpen={rateLimitModalOpen}
                onClose={() => setRateLimitModalOpen(false)}
                title="Rate Limiting Settings"
                size="lg"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Configure the maximum number of API requests allowed per time period.
                    </p>

                    <Input
                        label="Requests per Minute"
                        type="number"
                        value={rateLimitSettings.requests_per_minute.toString()}
                        onChange={(e) => handleRateLimitChange('requests_per_minute', e.target.value)}
                        min="1"
                    />

                    <Input
                        label="Requests per Hour"
                        type="number"
                        value={rateLimitSettings.requests_per_hour.toString()}
                        onChange={(e) => handleRateLimitChange('requests_per_hour', e.target.value)}
                        min="1"
                    />

                    <Input
                        label="Requests per Day"
                        type="number"
                        value={rateLimitSettings.requests_per_day.toString()}
                        onChange={(e) => handleRateLimitChange('requests_per_day', e.target.value)}
                        min="1"
                    />

                    <Input
                        label="Burst Allowance"
                        type="number"
                        value={rateLimitSettings.burst_allowance.toString()}
                        onChange={(e) => handleRateLimitChange('burst_allowance', e.target.value)}
                        min="0"
                    />
                    <p className="text-xs text-gray-500">
                        Number of additional requests allowed in short bursts
                    </p>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => setRateLimitModalOpen(false)}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveRateLimits}
                            loading={saving}
                        >
                            Save Settings
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Token Limits Modal */}
            <Modal
                isOpen={tokenLimitModalOpen}
                onClose={() => setTokenLimitModalOpen(false)}
                title="Token Limits Settings"
                size="lg"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Configure the maximum number of tokens that can be used per request and time period.
                    </p>

                    <Input
                        label="Max Tokens per Request"
                        type="number"
                        value={tokenLimitSettings.max_tokens_per_request.toString()}
                        onChange={(e) => handleTokenLimitChange('max_tokens_per_request', e.target.value)}
                        min="1"
                    />
                    <p className="text-xs text-gray-500 -mt-2">
                        Maximum tokens allowed in a single API request
                    </p>

                    <Input
                        label="Max Tokens per Day"
                        type="number"
                        value={tokenLimitSettings.max_tokens_per_day.toString()}
                        onChange={(e) => handleTokenLimitChange('max_tokens_per_day', e.target.value)}
                        min="1"
                    />
                    <p className="text-xs text-gray-500 -mt-2">
                        Daily token usage limit per tenant
                    </p>

                    <Input
                        label="Max Tokens per Month"
                        type="number"
                        value={tokenLimitSettings.max_tokens_per_month.toString()}
                        onChange={(e) => handleTokenLimitChange('max_tokens_per_month', e.target.value)}
                        min="1"
                    />
                    <p className="text-xs text-gray-500 -mt-2">
                        Monthly token usage limit per tenant
                    </p>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => setTokenLimitModalOpen(false)}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveTokenLimits}
                            loading={saving}
                        >
                            Save Settings
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
