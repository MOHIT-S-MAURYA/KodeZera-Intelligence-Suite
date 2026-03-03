import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Mail, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import authService from '../services/auth.service';

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const { setUser } = useAuthStore();
    const { addToast } = useUIStore();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await authService.login({ email, password });
            setUser(response.user);
            addToast('success', 'Login successful!');

            // Redirect based on user type
            // Check if user is platform owner
            if (response.user.isPlatformOwner) {
                navigate('/platform');
            } else {
                navigate('/dashboard');
            }
        } catch (error: any) {
            addToast('error', error.response?.data?.detail || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    const fillDemoCredentials = (role: 'admin' | 'developer' | 'owner') => {
        if (role === 'admin') {
            setEmail('admin@demo.com');
            setPassword('Admin1234!');
        } else if (role === 'developer') {
            setEmail('developer@demo.com');
            setPassword('Dev1234!');
        } else if (role === 'owner') {
            setEmail('owner@kodezera.com');
            setPassword('Admin1234!');
        }
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
                        <h1 className="text-display-sm text-gray-900 mb-2">Welcome Back</h1>
                        <p className="text-body-sm text-gray-600">Sign in to Kodezera Intelligence Suite</p>
                    </div>

                    {/* Form */}
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

                        <div className="flex items-center justify-between text-sm">
                            <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
                                <input type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                                Remember me
                            </label>
                            <a href="#" className="text-brand-600 hover:text-brand-700 font-medium">
                                Forgot password?
                            </a>
                        </div>

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

                    {/* Demo credentials */}
                    <div className="mt-8 pt-6 border-t border-gray-200">
                        <p className="text-sm text-gray-600 text-center mb-3">Demo Credentials:</p>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => fillDemoCredentials('owner')}
                                className="px-3 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg"
                            >
                                Platform Owner
                            </button>
                            <button
                                type="button"
                                onClick={() => fillDemoCredentials('admin')}
                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                            >
                                Admin
                            </button>
                            <button
                                type="button"
                                onClick={() => fillDemoCredentials('developer')}
                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                            >
                                Developer
                            </button>
                        </div>
                        <div className="mt-3 text-xs text-gray-500 space-y-1">
                            <p>• Platform Owner: owner@kodezera.com / Admin1234!</p>
                            <p>• Admin: admin@demo.com / Admin1234!</p>
                            <p>• Developer: developer@demo.com / Dev1234!</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
