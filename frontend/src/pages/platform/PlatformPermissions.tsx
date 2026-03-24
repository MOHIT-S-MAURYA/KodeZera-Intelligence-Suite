import React, { useEffect, useState } from 'react';
import { Lock, Shield, Users, ToggleLeft } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import platformOwnerService from '../../services/platformOwner.service';
import type { FeatureFlag } from '../../services/platformOwner.service';

export const PlatformPermissions: React.FC = () => {
    const [flags, setFlags] = useState<FeatureFlag[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        platformOwnerService.getFeatureFlags()
            .then(setFlags)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

    const securityFlags = flags.filter(f => ['mfa_enforcement', 'api_access'].includes(f.key));
    const dataFlags = flags.filter(f => ['advanced_rag', 'document_ocr', 'bulk_upload', 'audit_log_export', 'chat_export'].includes(f.key));
    const uiFlags = flags.filter(f => ['custom_branding', 'analytics_dashboard', 'priority_support'].includes(f.key));

    const renderFlagGroup = (title: string, icon: React.ReactNode, items: FeatureFlag[]) => (
        <Card>
            <div className="flex items-center gap-3 mb-4">
                {icon}
                <h2 className="text-lg font-semibold text-text-main">{title}</h2>
            </div>
            {items.length === 0 ? (
                <p className="text-sm text-text-muted">No flags in this category.</p>
            ) : (
                <div className="space-y-3">
                    {items.map(flag => (
                        <div key={flag.key} className="flex items-center justify-between p-3 border border-border rounded-lg bg-surface">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm text-text-main">{flag.name}</span>
                                    <code className="text-xs bg-surface-hover px-1.5 py-0.5 rounded text-text-muted opacity-80">{flag.key}</code>
                                </div>
                                <p className="text-xs text-text-muted mt-0.5">{flag.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant={flag.default_enabled ? 'success' : 'default'} size="sm">
                                    {flag.default_enabled ? 'Enabled' : 'Disabled'}
                                </Badge>
                                {flag.override_count > 0 && (
                                    <Badge variant="info" size="sm">{flag.override_count} override{flag.override_count > 1 ? 's' : ''}</Badge>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-text-main">Global Permissions Policy</h1>
                <p className="text-text-muted mt-1">Platform-wide access controls governed by feature flags and plan gates</p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <ToggleLeft className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Total Feature Flags</p>
                            <p className="text-2xl font-bold text-text-main">{flags.length}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <Shield className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">Enabled by Default</p>
                            <p className="text-2xl font-bold text-text-main">{flags.filter(f => f.default_enabled).length}</p>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <Users className="w-6 h-6 text-orange-500" />
                        </div>
                        <div>
                            <p className="text-sm text-text-muted">With Tenant Overrides</p>
                            <p className="text-2xl font-bold text-text-main">{flags.filter(f => f.override_count > 0).length}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {renderFlagGroup('Security & Access', <Lock className="w-5 h-5 text-blue-500" />, securityFlags)}
            {renderFlagGroup('Data & Documents', <Shield className="w-5 h-5 text-green-500" />, dataFlags)}
            {renderFlagGroup('UI & Branding', <Users className="w-5 h-5 text-purple-500" />, uiFlags)}

            {/* Privacy Policy */}
            <Card>
                <h2 className="text-lg font-semibold text-text-main mb-3">Enforced Policies</h2>
                <div className="space-y-3">
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <h3 className="font-medium text-sm text-text-main">Platform Owner Data Privacy</h3>
                        <p className="text-xs text-text-muted mt-1">
                            Platform owners cannot access tenant documents or chat messages. Enforced at API level.
                        </p>
                    </div>
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <h3 className="font-medium text-sm text-text-main">Tenant Isolation</h3>
                        <p className="text-xs text-text-muted mt-1">
                            All tenant data isolated via middleware. Cross-tenant access prevented.
                        </p>
                    </div>
                </div>
            </Card>
        </div>
    );
};
