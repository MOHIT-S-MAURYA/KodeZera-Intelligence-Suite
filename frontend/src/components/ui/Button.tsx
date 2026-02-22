import React from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    children: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconPosition = 'left',
    children,
    className,
    disabled,
    ...props
}) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ripple-effect';

    const variantStyles = {
        primary: 'bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-600 hover:to-brand-700 focus:ring-brand-500 shadow-sm hover:shadow-md',
        secondary: 'border-2 border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500',
        ghost: 'text-gray-600 hover:bg-gray-100 focus:ring-gray-500',
        danger: 'bg-error-500 text-white hover:bg-error-600 focus:ring-error-500 shadow-sm hover:shadow-md',
        outline: 'border border-brand-500 text-brand-600 hover:bg-brand-50 focus:ring-brand-500',
    };

    const sizeStyles = {
        sm: 'h-8 px-3 text-sm gap-1.5',
        md: 'h-10 px-4 text-base gap-2',
        lg: 'h-12 px-6 text-lg gap-2.5',
    };

    const iconSizeStyles = {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6',
    };

    return (
        <button
            className={clsx(
                baseStyles,
                variantStyles[variant],
                sizeStyles[size],
                className
            )}
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
