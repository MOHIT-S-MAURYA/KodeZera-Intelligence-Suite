import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ragService } from '../../../services/rag.service';
import type { ChatFolder, ChatSession } from '../../../services/rag.service';
import { useUIStore } from '../../../store/ui.store';

interface UseChatSessionsResult {
    sessions: ChatSession[];
    folders: ChatFolder[];
    activeSessionId: string | null;
    loadingData: boolean;
    setActiveSessionId: (sessionId: string | null) => void;
    setSessions: Dispatch<SetStateAction<ChatSession[]>>;
    refreshSessions: () => Promise<void>;
    createSessionFromPrompt: (prompt: string) => Promise<ChatSession>;
    handleNewChat: () => void;
}

function titleFromPrompt(prompt: string): string {
    const trimmed = prompt.trim();
    if (!trimmed) {
        return 'New Chat';
    }
    return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed;
}

export function useChatSessions(): UseChatSessionsResult {
    const { addToast } = useUIStore();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [folders, setFolders] = useState<ChatFolder[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [loadingData, setLoadingData] = useState(true);

    const loadData = useCallback(async (silent = false) => {
        if (!silent) {
            setLoadingData(true);
        }

        try {
            const [fetchedFolders, fetchedSessions] = await Promise.all([
                ragService.getFolders(),
                ragService.getSessions(),
            ]);
            setFolders(fetchedFolders);
            setSessions(fetchedSessions);
            setActiveSessionId((prev) => prev ?? fetchedSessions[0]?.id ?? null);
        } catch {
            addToast('error', 'Failed to load chat sessions and folders.');
        } finally {
            setLoadingData(false);
        }
    }, [addToast]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const refreshSessions = useCallback(async () => {
        try {
            const fetchedSessions = await ragService.getSessions();
            setSessions(fetchedSessions);
            setActiveSessionId((prev) => {
                if (!prev) return fetchedSessions[0]?.id ?? null;
                const stillExists = fetchedSessions.some((item) => item.id === prev);
                return stillExists ? prev : fetchedSessions[0]?.id ?? null;
            });
        } catch {
            addToast('error', 'Failed to refresh chat list.');
        }
    }, [addToast]);

    const createSessionFromPrompt = useCallback(async (prompt: string) => {
        const newSession = await ragService.createSession(titleFromPrompt(prompt));
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        return newSession;
    }, []);

    const handleNewChat = useCallback(() => {
        setActiveSessionId(null);
    }, []);

    return {
        sessions,
        folders,
        activeSessionId,
        loadingData,
        setActiveSessionId,
        setSessions,
        refreshSessions,
        createSessionFromPrompt,
        handleNewChat,
    };
}
