import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, Mail, Lock, ShieldCheck, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import authService from '../services/auth.service';
import type { MFAChallengeResponse, LoginResponse } from '../services/auth.service';
import { getApiError } from '../utils/errors';

function getErrorData(error: unknown): { error?: string; detail?: string } {
    if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as { response?: { data?: { error?: string; detail?: string } } }).response;
        return response?.data ?? {};
    }
    return {};
}

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const { setUser, setMfaChallenge, mfaSession, mfaMethods, clearMfaChallenge } = useAuthStore();
    const { addToast } = useUIStore();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // MFA step
    const [mfaCode, setMfaCode] = useState('');
    const [mfaMethod, setMfaMethod] = useState<string>('');
    const [sendingEmail, setSendingEmail] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await authService.login({ email, password });

            if ('mfa_required' in response && response.mfa_required) {
                const mfa = response as MFAChallengeResponse;
                setMfaChallenge(mfa.mfa_session, mfa.methods);
                setMfaMethod(mfa.methods[0] || 'totp');
                addToast('info', 'Please enter your MFA code to continue.');
            } else {
                const login = response as LoginResponse;
                setUser(login.user);
                addToast('success', 'Login successful!');
                if (login.user.isPlatformOwner) {
                    navigate('/platform');
                } else if (login.user.force_password_change) {
                    navigate('/profile');
                    addToast('warning', 'You are required to change your password.');
                } else {
                    navigate('/dashboard');
                }
            }
        } catch (error: unknown) {
            const data = getErrorData(error);
            const message = data?.error || data?.detail || 'Login failed. Please check your credentials.';
            addToast('error', message);
        } finally {
            setLoading(false);
        }
    };

    const handleMFASubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mfaSession) return;
        setLoading(true);

        try {
            const response = await authService.verifyMFA(mfaSession, mfaMethod, mfaCode);
            setUser(response.user);
            addToast('success', 'Login successful!');
            if (response.user.isPlatformOwner) {
                navigate('/platform');
            } else {
                navigate('/dashboard');
            }
        } catch (error: unknown) {
            const message = getErrorData(error).error || getApiError(error, 'Invalid MFA code. Please try again.');
            addToast('error', message);
        } finally {
            setLoading(false);
        }
    };

    const handleSendEmailOTP = async () => {
        if (!mfaSession) return;
        setSendingEmail(true);
        try {
            await authService.sendMFAEmail(mfaSession);
            setMfaMethod('email');
            addToast('success', 'Verification code sent to your email.');
        } catch {
            addToast('error', 'Failed to send email code.');
        } finally {
            setSendingEmail(false);
        }
    };

    const handleBackToLogin = () => {
        clearMfaChallenge();
        setMfaCode('');
        setMfaMethod('');
    };

    return (
        <div className="min-h-screen gradient-mesh flex items-center justify-center p-4">
            {/* Animated background orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl animate-pulse-slow" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
            </div>

            {/* Login card */}
            <div className="relative w-full max-w-md animate-scale-in">
                <div className="glass rounded-2xl shadow-2xl p-8">
                    {/* Logo */}
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-primary hover:scale-105 transition-transform">
                            <Sparkles className="w-8 h-8 text-white" />
                        </div>
                    </div>

                    {/* Title */}
                    <div className="text-center mb-8">
                        <h1 className="text-display-sm text-gray-900 mb-2">
                            {mfaSession ? 'Verify Identity' : 'Welcome Back'}
                        </h1>
                        <p className="text-body-sm text-gray-600">
                            {mfaSession
                                ? 'Enter your verification code to continue'
                                : 'Sign in to Kodezera Intelligence Suite'}
                        </p>
                    </div>

                    {!mfaSession ? (
                        <>
                            {/* Login Form */}
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <Input
                                    type="email"
                                    label="Email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    leftIcon={<Mail className="w-5 h-5" />}
                                    required
                                />

                                <Input
                                    type="password"
                                    label="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    leftIcon={<Lock className="w-5 h-5" />}
                                    required
                                />

                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="lg"
                                    loading={loading}
                                    className="w-full"
                                >
                                    Sign In
                                </Button>
                            </form>

                            <div className="mt-6 text-center">
                                <Link
                                    to="/forgot-password"
                                    className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                                >
                                    Forgot your password?
                                </Link>
                            </div>
                        </>
                    ) : (
                        /* MFA Verification Form */
                        <form onSubmit={handleMFASubmit} className="space-y-4">
                            {mfaMethods.length > 1 && (
                                <div className="flex gap-2 mb-2">
                                    {mfaMethods.includes('totp') && (
                                        <button
                                            type="button"
                                            onClick={() => setMfaMethod('totp')}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                                                mfaMethod === 'totp'
                                                    ? 'bg-brand-100 text-brand-700 border border-brand-300'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            Authenticator App
                                        </button>
                                    )}
                                    {mfaMethods.includes('email') && (
                                        <button
                                            type="button"
                                            onClick={handleSendEmailOTP}
                                            disabled={sendingEmail}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                                                mfaMethod === 'email'
                                                    ? 'bg-brand-100 text-brand-700 border border-brand-300'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            {sendingEmail ? 'Sending...' : 'Email Code'}
                                        </button>
                                    )}
                                </div>
                            )}

                            <Input
                                type="text"
                                label={mfaMethod === 'totp' ? 'Authenticator Code' : 'Email Code'}
                                value={mfaCode}
                                onChange={(e) => setMfaCode(e.target.value)}
                                leftIcon={<ShieldCheck className="w-5 h-5" />}
                                placeholder="Enter 6-digit code"
                                maxLength={6}
                                required
                                autoFocus
                            />

                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                loading={loading}
                                className="w-full"
                            >
                                Verify
                            </Button>

                            <button
                                type="button"
                                onClick={handleBackToLogin}
                                className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 mt-2"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to login
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
