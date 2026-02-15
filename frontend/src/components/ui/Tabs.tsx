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
                    variant === 'default' && 'border-b border-gray-200',
                    variant === 'pills' && 'bg-gray-100 p-1 rounded-lg'
                )}
            >
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2.5 font-medium text-sm transition-all duration-150',
                            variant === 'default' && [
                                'border-b-2 -mb-px',
                                activeTab === tab.id
                                    ? 'border-brand-600 text-brand-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                            ],
                            variant === 'pills' && [
                                'rounded-md',
                                activeTab === tab.id
                                    ? 'bg-white text-brand-600 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900',
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
