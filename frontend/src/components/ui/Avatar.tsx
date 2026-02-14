import React from 'react';
import clsx from 'clsx';

interface AvatarProps {
    src?: string;
    alt?: string;
    name?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
    src,
    alt,
    name,
    size = 'md',
    className,
}) => {
    const sizeStyles = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-12 h-12 text-base',
        xl: 'w-16 h-16 text-lg',
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <div
            className={clsx(
                'rounded-full flex items-center justify-center overflow-hidden',
                'bg-gradient-to-br from-brand-400 to-brand-600 text-white font-semibold',
                sizeStyles[size],
                className
            )}
        >
            {src ? (
                <img src={src} alt={alt || name} className="w-full h-full object-cover" />
            ) : (
                <span>{name ? getInitials(name) : '?'}</span>
            )}
        </div>
    );
};
