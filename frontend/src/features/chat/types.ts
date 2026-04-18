import type {
    ActionCardBlock,
    ChatMessage,
    ChatSession,
    ChatFolder,
    RAGMetadata,
    StreamActionRequiredEvent,
} from '../../services/rag.service';

export type ChatStreamStatus = 'idle' | 'connecting' | 'streaming' | 'awaiting_action' | 'completed' | 'error';

export interface PendingAction {
    actionId: string;
    actionType: string;
    summary: string;
    approvalToken?: string;
    expiresInSeconds?: number;
    payload?: Record<string, unknown>;
}

export interface ChatViewState {
    sessions: ChatSession[];
    folders: ChatFolder[];
    activeSessionId: string | null;
    messages: ChatMessage[];
    loadingData: boolean;
    loadingMessages: boolean;
    sendingMessage: boolean;
    streamStatus: ChatStreamStatus;
    lastMetadata: RAGMetadata | null;
    pendingAction: PendingAction | null;
}

export function actionEventToBlock(event: StreamActionRequiredEvent): ActionCardBlock {
    return {
        type: 'action_card',
        action_id: event.data.action_id,
        action_type: event.data.action_type,
        summary: event.data.summary,
        payload: event.data.payload,
    };
}
