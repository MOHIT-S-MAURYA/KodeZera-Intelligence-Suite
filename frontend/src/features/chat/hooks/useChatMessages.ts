import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { ragService } from '../../../services/rag.service';
import type { ChatMessage, ChatMessageBlock, RAGSource } from '../../../services/rag.service';
import { useUIStore } from '../../../store/ui.store';

interface UseChatMessagesResult {
    messages: ChatMessage[];
    loadingMessages: boolean;
    messagesEndRef: RefObject<HTMLDivElement | null>;
    setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
    appendUserMessage: (sessionId: string, content: string) => void;
    createAssistantPlaceholder: (sessionId: string) => string;
    appendAssistantChunk: (messageId: string, chunk: string) => void;
    attachSources: (messageId: string, sources: RAGSource[]) => void;
    appendMessageBlock: (messageId: string, block: ChatMessageBlock) => void;
    appendAssistantError: (messageId: string, message: string) => void;
    appendAssistantMessage: (sessionId: string, content: string, sources?: RAGSource[]) => void;
    clearMessages: () => void;
}

function newTempId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useChatMessages(activeSessionId: string | null): UseChatMessagesResult {
    const { addToast } = useUIStore();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!activeSessionId) {
            setMessages([]);
            return;
        }

        let cancelled = false;

        const loadMessages = async () => {
            setLoadingMessages(true);
            try {
                const data = await ragService.getMessages(activeSessionId);
                if (!cancelled) {
                    setMessages(data);
                }
            } catch {
                if (!cancelled) {
                    addToast('error', 'Failed to load messages for the selected chat.');
                }
            } finally {
                if (!cancelled) {
                    setLoadingMessages(false);
                }
            }
        };

        void loadMessages();

        return () => {
            cancelled = true;
        };
    }, [activeSessionId, addToast]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages]);

    const appendUserMessage = useCallback((sessionId: string, content: string) => {
        const nextMessage: ChatMessage = {
            id: newTempId('temp-user'),
            session: sessionId,
            role: 'user',
            content,
            created_at: new Date(),
        };
        setMessages((prev) => [...prev, nextMessage]);
    }, []);

    const createAssistantPlaceholder = useCallback((sessionId: string) => {
        const placeholderId = newTempId('temp-assistant');
        const placeholder: ChatMessage = {
            id: placeholderId,
            session: sessionId,
            role: 'assistant',
            content: '',
            created_at: new Date(),
        };
        setMessages((prev) => [...prev, placeholder]);
        return placeholderId;
    }, []);

    const appendAssistantChunk = useCallback((messageId: string, chunk: string) => {
        setMessages((prev) => prev.map((item) => {
            if (item.id !== messageId) return item;
            return {
                ...item,
                content: `${item.content}${chunk}`,
            };
        }));
    }, []);

    const attachSources = useCallback((messageId: string, sources: RAGSource[]) => {
        setMessages((prev) => prev.map((item) => {
            if (item.id !== messageId) return item;
            return {
                ...item,
                sources,
            };
        }));
    }, []);

    const appendMessageBlock = useCallback((messageId: string, block: ChatMessageBlock) => {
        setMessages((prev) => prev.map((item) => {
            if (item.id !== messageId) return item;
            return {
                ...item,
                blocks: [...(item.blocks || []), block],
            };
        }));
    }, []);

    const appendAssistantError = useCallback((messageId: string, message: string) => {
        setMessages((prev) => prev.map((item) => {
            if (item.id !== messageId) return item;
            const current = item.content ? `${item.content}\n\n` : '';
            return {
                ...item,
                content: `${current}Warning: ${message}`,
            };
        }));
    }, []);

    const appendAssistantMessage = useCallback((sessionId: string, content: string, sources?: RAGSource[]) => {
        const nextMessage: ChatMessage = {
            id: newTempId('temp-assistant-decision'),
            session: sessionId,
            role: 'assistant',
            content,
            sources,
            created_at: new Date(),
        };
        setMessages((prev) => [...prev, nextMessage]);
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    return {
        messages,
        loadingMessages,
        messagesEndRef,
        setMessages,
        appendUserMessage,
        createAssistantPlaceholder,
        appendAssistantChunk,
        attachSources,
        appendMessageBlock,
        appendAssistantError,
        appendAssistantMessage,
        clearMessages,
    };
}
