import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Mail, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useUIStore } from '../store/ui.store';
import authService from '../services/auth.service';

export const ForgotPassword: React.FC = () => {
    const { addToast } = useUIStore();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await authService.forgotPassword(email);
            setSent(true);
            addToast('success', 'If an account exists, a reset code has been sent.');
        } catch {
            addToast('error', 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen gradient-mesh flex items-center justify-center p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl animate-pulse-slow" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
            </div>

            <div className="relative w-full max-w-md animate-scale-in">
                <div className="glass rounded-2xl shadow-2xl p-8">
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-primary">
                            <Sparkles className="w-8 h-8 text-white" />
                        </div>
                    </div>

                    <div className="text-center mb-8">
                        <h1 className="text-display-sm text-gray-900 mb-2">Forgot Password</h1>
                        <p className="text-body-sm text-gray-600">
                            {sent
                                ? 'Check your email for a reset code'
                                : 'Enter your email to receive a password reset code'}
                        </p>
                    </div>

                    {!sent ? (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <Input
                                type="email"
                                label="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                leftIcon={<Mail className="w-5 h-5" />}
                                placeholder="you@company.com"
                                required
                                autoFocus
                            />
                            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                                Send Reset Code
                            </Button>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                                A 6-digit code has been sent to <strong>{email}</strong>. Use it on the reset page.
                            </div>
                            <Link to={`/reset-password?email=${encodeURIComponent(email)}`}>
                                <Button variant="primary" size="lg" className="w-full">
                                    Enter Reset Code
                                </Button>
                            </Link>
                        </div>
                    )}

                    <div className="mt-6 text-center">
                        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                            <ArrowLeft className="w-4 h-4" />
                            Back to login
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
