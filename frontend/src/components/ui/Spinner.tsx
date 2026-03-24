import React from 'react';
import { Loader2 } from 'lucide-react';

export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
    const sizeStyles = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
    };

    return (
        <div className="flex items-center justify-center p-2">
            <Loader2 className={`${sizeStyles[size]} animate-spin text-accent-cyan`} />
        </div>
    );
};

export const PageLoader: React.FC = () => {
    return (
        <div className="flex items-center justify-center min-h-[50vh] w-full">
            <div className="text-center animate-fade-in flex flex-col items-center">
                <Spinner size="lg" />
                <p className="mt-4 text-sm font-medium text-text-muted tracking-wide animate-pulse">Loading workspace...</p>
            </div>
        </div>
    );
};
