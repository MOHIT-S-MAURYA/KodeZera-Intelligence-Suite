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
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-full border transition-colors';

    const variantStyles = {
        default: 'bg-background text-text-muted border-border-light',
        success: 'bg-accent-green/10 text-accent-green border-accent-green/20 relative shadow-[0_0_10px_rgba(34,197,94,0.1)]',
        warning: 'bg-accent-orange/10 text-accent-orange border-accent-orange/20 relative shadow-[0_0_10px_rgba(249,115,22,0.1)]',
        error: 'bg-accent-red/10 text-accent-red border-accent-red/20 relative shadow-[0_0_10px_rgba(239,68,68,0.1)]',
        info: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20 relative shadow-[0_0_10px_rgba(59,130,246,0.1)]',
        brand: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20 relative shadow-[0_0_10px_rgba(6,182,212,0.1)]',
    };

    const sizeStyles = {
        sm: 'px-2.5 py-0.5 text-[10px] tracking-wider uppercase',
        md: 'px-3 py-1 text-xs tracking-wide',
    };

    return (
        <span className={clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)}>
            {variant !== 'default' && <span className="absolute top-0 right-0 w-full h-full bg-current opacity-[0.02] rounded-full blur-[2px]" />}
            {children}
        </span>
    );
};
