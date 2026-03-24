import React, { useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
}

export const Input: React.FC<InputProps> = ({
    label,
    error,
    leftIcon,
    rightIcon,
    type = 'text',
    className,
    id,
    value,
    defaultValue,
    ...props
}) => {
    const [showPassword, setShowPassword] = useState(false);

    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        props.onChange?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        props.onBlur?.(e);
    };

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={inputId} className="block text-sm font-semibold text-text-main mb-1.5 flex items-center justify-between">
                    {label}
                </label>
            )}
            <div className="relative group">
                {leftIcon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-cyan transition-colors z-10">
                        {leftIcon}
                    </div>
                )}

                <input
                    id={inputId}
                    type={inputType}
                    value={value}
                    defaultValue={defaultValue}
                    placeholder={props.placeholder ?? label}
                    className={clsx(
                        'w-full h-11 px-4 rounded-xl border transition-all duration-200 bg-surface',
                        'text-text-main placeholder-text-muted/60',
                        'focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 focus:border-accent-cyan hover:border-border-light shadow-sm',
                        error ? 'border-accent-red focus:border-accent-red focus:ring-accent-red/20' : 'border-border',
                        leftIcon && 'pl-10',
                        (rightIcon || isPassword) && 'pr-10',
                        props.disabled && 'bg-background hover:border-border cursor-not-allowed opacity-60',
                        className
                    )}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChange={handleChange}
                    {...props}
                />

                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main hover:bg-surface-hover p-1 rounded-md transition-colors z-10"
                        tabIndex={-1}
                    >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                )}

                {rightIcon && !isPassword && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
                        {rightIcon}
                    </div>
                )}
            </div>

            {error && (
                <p className="mt-1.5 text-xs font-medium text-accent-red flex items-center gap-1 animate-slide-up">
                    <span className="w-1 h-1 rounded-full bg-accent-red"></span>
                    {error}
                </p>
            )}
        </div>
    );
};
