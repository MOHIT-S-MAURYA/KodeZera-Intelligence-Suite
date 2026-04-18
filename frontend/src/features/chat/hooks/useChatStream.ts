import { useCallback, useState } from 'react';
import { ragService } from '../../../services/rag.service';
import type { ChatSession, RAGMetadata, RAGSource } from '../../../services/rag.service';
import { useUIStore } from '../../../store/ui.store';
import type { PendingAction, ChatStreamStatus } from '../types';
import { actionEventToBlock } from '../types';

interface UseChatStreamArgs {
    activeSessionId: string | null;
    setActiveSessionId: (sessionId: string | null) => void;
    createSessionFromPrompt: (prompt: string) => Promise<ChatSession>;
    refreshSessions: () => Promise<void>;
    appendUserMessage: (sessionId: string, content: string) => void;
    createAssistantPlaceholder: (sessionId: string) => string;
    appendAssistantChunk: (messageId: string, chunk: string) => void;
    attachSources: (messageId: string, sources: RAGSource[]) => void;
    appendMessageBlock: (messageId: string, block: ReturnType<typeof actionEventToBlock>) => void;
    appendAssistantError: (messageId: string, message: string) => void;
    appendAssistantMessage: (sessionId: string, content: string, sources?: RAGSource[]) => void;
}

interface UseChatStreamResult {
    sendingMessage: boolean;
    streamStatus: ChatStreamStatus;
    lastMetadata: RAGMetadata | null;
    pendingAction: PendingAction | null;
    sendMessage: (input: string) => Promise<void>;
    approveAction: (reason: string) => Promise<void>;
    rejectAction: (reason: string) => Promise<void>;
}

function normalizeActionPending(
    actionId: string,
    actionType: string,
    summary: string,
    approvalToken?: string,
    expiresInSeconds?: number,
    payload?: Record<string, unknown>,
): PendingAction {
    return {
        actionId,
        actionType,
        summary,
        approvalToken,
        expiresInSeconds,
        payload,
    };
}

export function useChatStream({
    activeSessionId,
    setActiveSessionId,
    createSessionFromPrompt,
    refreshSessions,
    appendUserMessage,
    createAssistantPlaceholder,
    appendAssistantChunk,
    attachSources,
    appendMessageBlock,
    appendAssistantError,
    appendAssistantMessage,
}: UseChatStreamArgs): UseChatStreamResult {
    const { addToast } = useUIStore();
    const [sendingMessage, setSendingMessage] = useState(false);
    const [streamStatus, setStreamStatus] = useState<ChatStreamStatus>('idle');
    const [lastMetadata, setLastMetadata] = useState<RAGMetadata | null>(null);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    const sendMessage = useCallback(async (input: string) => {
        const question = input.trim();
        if (!question || sendingMessage) return;

        let currentSessionId = activeSessionId;
        setStreamStatus('connecting');

        if (!currentSessionId) {
            try {
                const newSession = await createSessionFromPrompt(question);
                currentSessionId = newSession.id;
                setActiveSessionId(newSession.id);
            } catch {
                addToast('error', 'Could not create a chat session.');
                setStreamStatus('error');
                return;
            }
        }

        appendUserMessage(currentSessionId, question);
        const assistantMessageId = createAssistantPlaceholder(currentSessionId);

        setSendingMessage(true);

        try {
            await ragService.queryStream(question, currentSessionId, (event) => {
                switch (event.event) {
                    case 'start': {
                        if (!activeSessionId && event.data.session_id) {
                            setActiveSessionId(event.data.session_id);
                        }
                        break;
                    }
                    case 'metadata': {
                        setLastMetadata(event.data.metadata);
                        attachSources(assistantMessageId, event.data.sources);
                        break;
                    }
                    case 'chunk': {
                        setStreamStatus('streaming');
                        appendAssistantChunk(assistantMessageId, event.data.chunk);
                        break;
                    }
                    case 'action_required': {
                        const action = normalizeActionPending(
                            event.data.action_id,
                            event.data.action_type,
                            event.data.summary,
                            event.data.approval_token,
                            event.data.expires_in_seconds,
                            event.data.payload,
                        );
                        setPendingAction(action);
                        setStreamStatus('awaiting_action');
                        appendMessageBlock(assistantMessageId, actionEventToBlock(event));
                        break;
                    }
                    case 'error': {
                        setStreamStatus('error');
                        appendAssistantError(assistantMessageId, event.data.message);
                        break;
                    }
                    case 'done': {
                        setSendingMessage(false);
                        if (event.data.status === 'failed') {
                            setStreamStatus('error');
                        } else if (event.data.status === 'awaiting_action') {
                            setStreamStatus('awaiting_action');
                        } else {
                            setStreamStatus('completed');
                            setTimeout(() => setStreamStatus('idle'), 800);
                        }
                        if (event.data.metadata) {
                            setLastMetadata(event.data.metadata);
                        }
                        break;
                    }
                    case 'heartbeat':
                    default:
                        break;
                }
            });
        } finally {
            setSendingMessage(false);
            void refreshSessions();
        }
    }, [
        activeSessionId,
        addToast,
        appendAssistantChunk,
        appendAssistantError,
        appendMessageBlock,
        appendUserMessage,
        attachSources,
        createAssistantPlaceholder,
        createSessionFromPrompt,
        refreshSessions,
        sendingMessage,
        setActiveSessionId,
    ]);

    const submitActionDecision = useCallback(async (decision: 'approve' | 'reject', reason: string) => {
        if (!pendingAction) return;

        if (!pendingAction.approvalToken) {
            addToast('error', 'Missing approval token. Please submit the action request again.');
            return;
        }

        try {
            const result = await ragService.submitActionDecision(
                pendingAction.actionId,
                decision,
                pendingAction.approvalToken,
                reason,
                activeSessionId,
            );
            const resolvedSessionId = result.session_id || activeSessionId || undefined;
            if (resolvedSessionId && result.assistant_message) {
                appendAssistantMessage(resolvedSessionId, result.assistant_message);
            }
            addToast('success', decision === 'approve' ? 'Action approved successfully.' : 'Action rejected successfully.');
            setPendingAction(null);
            setStreamStatus('completed');
            setTimeout(() => setStreamStatus('idle'), 800);
            void refreshSessions();
        } catch {
            addToast('error', `Failed to ${decision} action.`);
        }
    }, [activeSessionId, addToast, appendAssistantMessage, pendingAction, refreshSessions]);

    const approveAction = useCallback(async (reason: string) => {
        await submitActionDecision('approve', reason);
    }, [submitActionDecision]);

    const rejectAction = useCallback(async (reason: string) => {
        await submitActionDecision('reject', reason);
    }, [submitActionDecision]);

    return {
        sendingMessage,
        streamStatus,
        lastMetadata,
        pendingAction,
        sendMessage,
        approveAction,
        rejectAction,
    };
}
