import React, { useState } from 'react';
import { Send, Plus, Search, Bot } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useAuthStore } from '../store/auth.store';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: string[];
    timestamp: Date;
}

export const Chat: React.FC = () => {
    const { user } = useAuthStore();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Hello! I\'m your AI assistant. I can help you search through your documents and answer questions. What would you like to know?',
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        // TODO: Call RAG API
        setTimeout(() => {
            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'This is a placeholder response. The RAG API integration will provide actual answers based on your documents.',
                sources: ['Document 1.pdf', 'Document 2.pdf'],
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, aiMessage]);
            setLoading(false);
        }, 1000);
    };

    return (
        <div className="h-[calc(100vh-8rem)] flex gap-6 animate-fade-in">
            {/* Conversation List */}
            <Card className="w-80 flex flex-col hidden lg:flex">
                <div className="p-4 border-b border-gray-200">
                    <Button variant="primary" size="md" className="w-full" icon={<Plus className="w-5 h-5" />}>
                        New Chat
                    </Button>
                </div>

                <div className="p-4 border-b border-gray-200">
                    <Input
                        placeholder="Search conversations..."
                        leftIcon={<Search className="w-5 h-5" />}
                    />
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    <div className="space-y-1">
                        <button className="w-full text-left px-3 py-2 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
                            <p className="font-medium text-sm truncate">Current Conversation</p>
                            <p className="text-xs text-brand-600 truncate">Just now</p>
                        </button>
                    </div>
                </div>
            </Card>

            {/* Chat Area */}
            <Card className="flex-1 flex flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {message.role === 'assistant' && (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                            )}

                            <div className={`max-w-2xl ${message.role === 'user' ? 'order-first' : ''}`}>
                                <div
                                    className={`rounded-2xl px-4 py-3 ${message.role === 'user'
                                        ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white'
                                        : 'bg-gray-100 text-gray-900'
                                        }`}
                                >
                                    <p className="text-sm leading-relaxed">{message.content}</p>
                                </div>

                                {message.sources && message.sources.length > 0 && (
                                    <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                                        <p className="text-xs font-medium text-gray-700 mb-2">Sources:</p>
                                        <div className="space-y-1">
                                            {message.sources.map((source, idx) => (
                                                <p key={idx} className="text-xs text-gray-600">• {source}</p>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <p className="text-xs text-gray-500 mt-1">
                                    {message.timestamp.toLocaleTimeString()}
                                </p>
                            </div>

                            {message.role === 'user' && (
                                <Avatar
                                    name={`${user?.first_name} ${user?.last_name}`}
                                    size="sm"
                                />
                            )}
                        </div>
                    ))}

                    {loading && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                            <div className="bg-gray-100 rounded-2xl px-4 py-3">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Bar */}
                <div className="p-4 border-t border-gray-200">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Ask a question about your documents..."
                            className="flex-1 px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            disabled={loading}
                        />
                        <Button
                            onClick={handleSend}
                            variant="primary"
                            size="lg"
                            icon={<Send className="w-5 h-5" />}
                            loading={loading}
                            disabled={!input.trim()}
                        >
                            Send
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
