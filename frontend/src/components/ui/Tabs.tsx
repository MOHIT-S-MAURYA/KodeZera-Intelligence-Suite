import React, { useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';

interface Tab {
    id: string;
    label: string;
    icon?: ReactNode;
    content: ReactNode;
}

interface TabsProps {
    tabs: Tab[];
    defaultTab?: string;
    onChange?: (tabId: string) => void;
    variant?: 'default' | 'pills';
}

export const Tabs: React.FC<TabsProps> = ({
    tabs,
    defaultTab,
    onChange,
    variant = 'default',
}) => {
    const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

    const handleTabChange = (tabId: string) => {
        setActiveTab(tabId);
        onChange?.(tabId);
    };

    const activeTabContent = tabs.find((tab) => tab.id === activeTab)?.content;

    return (
        <div className="w-full">
            {/* Tab Headers */}
            <div
                className={clsx(
                    'flex gap-1',
                    variant === 'default' && 'border-b border-border',
                    variant === 'pills' && 'bg-surface-hover p-1 rounded-xl w-fit'
                )}
            >
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2.5 text-sm transition-all duration-200 w-full sm:w-auto',
                            variant === 'default' && [
                                'border-b-2 -mb-px',
                                activeTab === tab.id
                                    ? 'border-accent-cyan text-accent-cyan font-bold shadow-glow-cyan/10'
                                    : 'border-transparent text-text-muted hover:text-text-main hover:border-border-light font-medium',
                            ],
                            variant === 'pills' && [
                                'rounded-lg pb-2',
                                activeTab === tab.id
                                    ? 'bg-surface text-accent-cyan shadow-glass border border-border font-bold'
                                    : 'text-text-muted hover:text-text-main font-medium hover:bg-surface-hover',
                            ]
                        )}
                    >
                        {tab.icon && <span className="w-5 h-5">{tab.icon}</span>}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="mt-6 animate-fade-in">{activeTabContent}</div>
        </div>
    );
};
