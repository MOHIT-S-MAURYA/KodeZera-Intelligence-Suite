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
        md: 'w-11 h-6 pr-1',
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
        lg: 'translate-x-[26px]',
    };

    return (
        <div className="flex items-start gap-4">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => !disabled && onChange(!checked)}
                className={clsx(
                    'relative inline-flex items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 focus:ring-offset-2 focus:ring-offset-background border hover-lift',
                    sizeClasses[size],
                    checked ? 'gradient-primary border-transparent shadow-glow-cyan/50' : 'bg-background-secondary border-border hover:border-border-light',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
            >
                <span
                    className={clsx(
                        'inline-block transform rounded-full bg-white shadow-glass transition-transform duration-300 ease-spring',
                        thumbSizeClasses[size],
                        checked ? translateClasses[size] : 'translate-x-0.5'
                    )}
                />
            </button>

            {(label || description) && (
                <div className="flex-1 mt-0.5">
                    {label && (
                        <label className={clsx('block font-medium text-text-main leading-tight', disabled && 'opacity-50')}>
                            {label}
                        </label>
                    )}
                    {description && (
                        <p className={clsx('text-sm text-text-muted mt-1 leading-snug', disabled && 'opacity-50')}>
                            {description}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
