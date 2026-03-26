import React from 'react';

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

/**
 * Catches any unhandled render errors in the component tree.
 * Prevents the entire app from going blank when a single page fails.
 *
 * Auto-resets on navigation (popstate) so clicking a sidebar link
 * after an error recovers without a full page reload.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, info);
    }

    componentDidMount() {
        // Reset error state whenever the user navigates (click, popstate, pushState)
        this._onNavChange = () => {
            if (this.state.hasError) {
                this.setState({ hasError: false, error: null });
            }
        };

        window.addEventListener('popstate', this._onNavChange);

        // Monkey-patch pushState/replaceState so React-Router link clicks also reset
        const origPush = history.pushState.bind(history);
        const origReplace = history.replaceState.bind(history);

        history.pushState = (...args: Parameters<typeof origPush>) => {
            origPush(...args);
            this._onNavChange?.();
        };
        history.replaceState = (...args: Parameters<typeof origReplace>) => {
            origReplace(...args);
            this._onNavChange?.();
        };

        this._origPush = origPush;
        this._origReplace = origReplace;
    }

    componentWillUnmount() {
        if (this._onNavChange) {
            window.removeEventListener('popstate', this._onNavChange);
        }
        // Restore original history methods
        if (this._origPush) history.pushState = this._origPush;
        if (this._origReplace) history.replaceState = this._origReplace;
    }

    private _onNavChange?: () => void;
    private _origPush?: typeof history.pushState;
    private _origReplace?: typeof history.replaceState;

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
                    <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-6">
                        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
                    <p className="text-sm text-gray-500 mb-2 max-w-sm">
                        This page encountered an error and couldn't load.
                    </p>
                    <p className="text-xs font-mono text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-6 max-w-md break-all">
                        {this.state.error?.message}
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={this.handleReset}
                            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={() => window.history.back()}
                            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
