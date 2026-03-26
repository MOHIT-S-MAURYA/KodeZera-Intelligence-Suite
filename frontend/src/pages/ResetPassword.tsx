import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Sparkles, Lock, KeyRound, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useUIStore } from '../store/ui.store';
import authService from '../services/auth.service';

function getErrorList(error: unknown): string[] {
    if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as { response?: { data?: { errors?: string[] } } }).response;
        return response?.data?.errors ?? [];
    }
    return [];
}

export const ResetPassword: React.FC = () => {
    const navigate = useNavigate();
    const { addToast } = useUIStore();
    const [searchParams] = useSearchParams();

    const [email, setEmail] = useState(searchParams.get('email') || '');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            addToast('error', 'Passwords do not match.');
            return;
        }
        if (newPassword.length < 8) {
            addToast('error', 'Password must be at least 8 characters.');
            return;
        }

        setLoading(true);
        try {
            await authService.resetPassword(email, otp, newPassword);
            addToast('success', 'Password reset successfully. Please log in.');
            navigate('/login');
        } catch (error: unknown) {
            const errors = getErrorList(error);
            const message = errors?.length
                ? errors.join(' ')
                : 'Failed to reset password. Please check your code.';
            addToast('error', message);
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
                        <h1 className="text-display-sm text-gray-900 mb-2">Reset Password</h1>
                        <p className="text-body-sm text-gray-600">Enter the code from your email and choose a new password</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            type="email"
                            label="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            required
                        />

                        <Input
                            type="text"
                            label="Reset Code"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            leftIcon={<KeyRound className="w-5 h-5" />}
                            placeholder="6-digit code"
                            maxLength={6}
                            required
                            autoFocus
                        />

                        <Input
                            type="password"
                            label="New Password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            leftIcon={<Lock className="w-5 h-5" />}
                            placeholder="At least 8 characters"
                            required
                        />

                        <Input
                            type="password"
                            label="Confirm Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            leftIcon={<Lock className="w-5 h-5" />}
                            placeholder="Repeat new password"
                            required
                        />

                        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                            Reset Password
                        </Button>
                    </form>

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
