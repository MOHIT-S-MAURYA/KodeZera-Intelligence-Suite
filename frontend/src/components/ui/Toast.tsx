import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
    id: string;
    type: ToastType;
    message: string;
    onClose: (id: string) => void;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
    id,
    type,
    message,
    onClose,
    duration = 5000,
}) => {
    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                onClose(id);
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [id, duration, onClose]);

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-accent-green" />,
        error: <XCircle className="w-5 h-5 text-accent-red" />,
        warning: <AlertCircle className="w-5 h-5 text-accent-orange" />,
        info: <Info className="w-5 h-5 text-accent-blue" />,
    };

    const styles = {
        success: 'border-l-accent-green shadow-[0_0_15px_rgba(34,197,94,0.05)]',
        error: 'border-l-accent-red shadow-[0_0_15px_rgba(239,68,68,0.05)]',
        warning: 'border-l-accent-orange shadow-[0_0_15px_rgba(249,115,22,0.05)]',
        info: 'border-l-accent-blue shadow-[0_0_15px_rgba(59,130,246,0.05)]',
    };

    return (
        <div
            className={clsx(
                'flex items-center gap-3 p-4 rounded-xl border-l-[3px] border-t border-r border-b border-border shadow-glass animate-slide-down',
                'min-w-[300px] max-w-md bg-surface',
                styles[type]
            )}
        >
            {icons[type]}
            <p className="flex-1 text-sm font-medium text-text-main">{message}</p>
            <button
                onClick={() => onClose(id)}
                className="text-text-muted hover:text-text-main hover:bg-surface-hover p-1 rounded-md transition-colors"
                aria-label="Close"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

interface ToastContainerProps {
    toasts: Array<{
        id: string;
        type: ToastType;
        message: string;
    }>;
    onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
            {toasts.map((toast) => (
                <Toast key={toast.id} {...toast} onClose={onClose} />
            ))}
        </div>
    );
};
