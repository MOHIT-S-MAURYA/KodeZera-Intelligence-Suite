import React from 'react';
import clsx from 'clsx';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand';
    size?: 'sm' | 'md';
    className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
    children,
    variant = 'default',
    size = 'md',
    className,
}) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-full';

    const variantStyles = {
        default: 'bg-gray-100 text-gray-700',
        success: 'bg-success-100 text-success-700',
        warning: 'bg-warning-100 text-warning-700',
        error: 'bg-error-100 text-error-700',
        info: 'bg-info-100 text-info-700',
        brand: 'bg-brand-100 text-brand-700',
    };

    const sizeStyles = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-sm',
    };

    return (
        <span className={clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)}>
            {children}
        </span>
    );
};
