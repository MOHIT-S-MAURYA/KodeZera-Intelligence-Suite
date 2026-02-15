import React from 'react';
import clsx from 'clsx';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    description?: string;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

export const Switch: React.FC<SwitchProps> = ({
    checked,
    onChange,
    label,
    description,
    disabled = false,
    size = 'md',
}) => {
    const sizeClasses = {
        sm: 'w-8 h-4',
        md: 'w-11 h-6',
        lg: 'w-14 h-8',
    };

    const thumbSizeClasses = {
        sm: 'w-3 h-3',
        md: 'w-5 h-5',
        lg: 'w-6 h-6',
    };

    const translateClasses = {
        sm: 'translate-x-4',
        md: 'translate-x-5',
        lg: 'translate-x-6',
    };

    return (
        <div className="flex items-start gap-3">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => !disabled && onChange(!checked)}
                className={clsx(
                    'relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                    sizeClasses[size],
                    checked ? 'bg-brand-600' : 'bg-gray-200',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
            >
                <span
                    className={clsx(
                        'inline-block transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out',
                        thumbSizeClasses[size],
                        checked ? translateClasses[size] : 'translate-x-0.5'
                    )}
                />
            </button>

            {(label || description) && (
                <div className="flex-1">
                    {label && (
                        <label className={clsx('block font-medium text-gray-900', disabled && 'opacity-50')}>
                            {label}
                        </label>
                    )}
                    {description && (
                        <p className={clsx('text-sm text-gray-500 mt-0.5', disabled && 'opacity-50')}>
                            {description}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
