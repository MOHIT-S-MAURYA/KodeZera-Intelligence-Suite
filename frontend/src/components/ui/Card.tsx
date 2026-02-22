import React from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export type CardVariant = 'default' | 'glass' | 'elevated';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: CardVariant;
    hover?: boolean;
    children: ReactNode;
}

export const Card: React.FC<CardProps> = ({
    variant = 'default',
    hover = false,
    children,
    className,
    ...props
}) => {
    const baseStyles = 'rounded-xl p-6';

    const variantStyles = {
        default: 'bg-white border border-gray-200 shadow-sm',
        glass: 'glass shadow-md',
        elevated: 'bg-white shadow-lg',
    };

    return (
        <div
            className={clsx(
                baseStyles,
                variantStyles[variant],
                hover && 'hover-lift cursor-pointer',
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
};

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className, ...props }) => {
    return (
        <div className={clsx('mb-4', className)} {...props}>
            {children}
        </div>
    );
};

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
    children: ReactNode;
}

export const CardTitle: React.FC<CardTitleProps> = ({ children, className, ...props }) => {
    return (
        <h3 className={clsx('text-title-md font-semibold text-gray-900', className)} {...props}>
            {children}
        </h3>
    );
};

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
}

export const CardContent: React.FC<CardContentProps> = ({ children, className, ...props }) => {
    return (
        <div className={className} {...props}>
            {children}
        </div>
    );
};

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, className, ...props }) => {
    return (
        <div className={clsx('mt-4 pt-4 border-t border-gray-200', className)} {...props}>
            {children}
        </div>
    );
};
