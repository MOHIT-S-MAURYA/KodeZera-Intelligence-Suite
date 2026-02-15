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
            <div className="relative">
                {leftIcon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10">
                        {leftIcon}
                    </div>
                )}

                <input
                    id={inputId}
                    type={inputType}
                    value={value}
                    defaultValue={defaultValue}
                    placeholder={label}
                    className={clsx(
                        'w-full h-12 px-4 rounded-lg border transition-all duration-150',
                        'text-gray-900 placeholder-gray-400',
                        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
                        error ? 'border-error-500' : 'border-gray-200',
                        leftIcon && 'pl-10',
                        (rightIcon || isPassword) && 'pr-10',
                        props.disabled && 'bg-gray-100 cursor-not-allowed',
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors z-10"
                        tabIndex={-1}
                    >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                )}

                {rightIcon && !isPassword && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {rightIcon}
                    </div>
                )}
            </div>

            {error && (
                <p className="mt-1 text-sm text-error-500">{error}</p>
            )}
        </div>
    );
};
