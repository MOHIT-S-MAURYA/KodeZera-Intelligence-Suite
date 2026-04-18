import type { RefObject } from 'react';
import { Bot } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import type { ChatMessage } from '../../../services/rag.service';
import { BlockRenderer } from './BlockRenderer';
import { SourcesPanel } from './SourcesPanel';

interface MessageViewportProps {
    messages: ChatMessage[];
    loadingMessages: boolean;
    userName: string;
    messagesEndRef: RefObject<HTMLDivElement | null>;
}

export function MessageViewport({ messages, loadingMessages, userName, messagesEndRef }: MessageViewportProps) {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
            <div className="mx-auto flex w-full flex-col gap-4" style={{ maxWidth: 'clamp(320px, 72vw, 980px)' }}>
                {loadingMessages && (
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="h-16 animate-pulse rounded-xl bg-surface" />
                        ))}
                    </div>
                )}

                {!loadingMessages && messages.length === 0 && (
                    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface/50 text-center">
                        <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 p-3 text-white">
                            <Bot className="h-7 w-7" />
                        </div>
                        <div>
                            <p className="text-base font-semibold text-text-main">Start a conversation</p>
                            <p className="text-sm text-text-muted">Ask questions about your documents and get cited answers.</p>
                        </div>
                    </div>
                )}

                {messages.map((message) => {
                    const isUser = message.role === 'user';
                    const showTyping = !isUser && !message.content && (!message.blocks || message.blocks.length === 0);

                    return (
                        <div key={message.id} className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                            {!isUser && (
                                <div className="mt-1 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 p-2 text-white shadow-sm">
                                    <Bot className="h-4 w-4" />
                                </div>
                            )}

                            <div className={`w-full max-w-[92%] md:max-w-[80%] lg:max-w-[70%] ${isUser ? 'order-1' : ''}`}>
                                <div
                                    className={[
                                        'rounded-2xl px-4 py-3 text-sm',
                                        isUser
                                            ? 'bg-accent-cyan text-white shadow-sm'
                                            : 'border border-border bg-surface text-text-main shadow-sm',
                                    ].join(' ')}
                                >
                                    {showTyping ? (
                                        <span className="flex items-center gap-1.5">
                                            {[0, 150, 300].map((delay) => (
                                                <span
                                                    key={delay}
                                                    className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
                                                    style={{ animationDelay: `${delay}ms` }}
                                                />
                                            ))}
                                        </span>
                                    ) : (
                                        <>
                                            {message.content && <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>}
                                            {message.blocks && message.blocks.length > 0 && (
                                                <div className="mt-3 space-y-3">
                                                    {message.blocks.map((block, index) => (
                                                        <BlockRenderer key={`${message.id}-block-${index}`} block={block} />
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {!isUser && message.sources && message.sources.length > 0 && (
                                    <SourcesPanel sources={message.sources} />
                                )}
                            </div>

                            {isUser && (
                                <Avatar
                                    name={userName}
                                    size="sm"
                                    className="mt-1"
                                />
                            )}
                        </div>
                    );
                })}

                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
