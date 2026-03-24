import React from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    children: ReactNode;
}

// Variant inline styles — hardcoded hex so they always render regardless of CSS variable resolution
const VARIANT_STYLE: Record<ButtonVariant, React.CSSProperties> = {
    primary:   { backgroundColor: '#007aff', color: '#ffffff' },
    secondary: { backgroundColor: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0' },
    ghost:     { backgroundColor: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0' },
    danger:    { backgroundColor: '#ef4444', color: '#ffffff' },
    outline:   { backgroundColor: '#ffffff', color: '#007aff', border: '1px solid #007aff' },
    glass:     { backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
};

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconPosition = 'left',
    children,
    className,
    disabled,
    style,
    ...props
}) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-px';

    const sizeStyles: Record<ButtonSize, string> = {
        sm: 'h-8 px-3 text-xs gap-1.5',
        md: 'h-10 px-4 text-sm gap-2',
        lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
    };

    const iconSizeStyles: Record<ButtonSize, string> = {
        sm: 'w-3.5 h-3.5',
        md: 'w-4 h-4',
        lg: 'w-5 h-5',
    };

    return (
        <button
            className={clsx(baseStyles, sizeStyles[size], className)}
            style={{ ...VARIANT_STYLE[variant], ...style }}
            disabled={disabled || loading}
            {...props}
        >
            {loading && (
                <Loader2 className={clsx('animate-spin', iconSizeStyles[size])} />
            )}
            {!loading && icon && iconPosition === 'left' && (
                <span className={iconSizeStyles[size]}>{icon}</span>
            )}
            {children}
            {!loading && icon && iconPosition === 'right' && (
                <span className={iconSizeStyles[size]}>{icon}</span>
            )}
        </button>
    );
};
