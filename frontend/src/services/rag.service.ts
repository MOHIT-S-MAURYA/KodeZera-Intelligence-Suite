import api from './api';

export interface RAGSource {
    document_id: string;
    title: string;
    file_type: string;
    confidence: string;
    relevance_score: number;
}

export interface RAGMetadata {
    num_chunks: number;
    average_confidence: string;
    session_id?: string;
}

export interface RAGResponse {
    answer: string;
    sources: RAGSource[];
    metadata?: RAGMetadata;
}

export interface ChatFolder {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface ChatSession {
    id: string;
    title: string;
    folder: string | null;
    created_at: string;
    updated_at: string;
    latest_message?: {
        role: string;
        content: string;
        created_at: string;
    };
}

export interface ChatMessage {
    id: string;
    session: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: RAGSource[];
    blocks?: ChatMessageBlock[];
    created_at: Date | string;
}

export interface TextBlock {
    type: 'text';
    text: string;
}

export interface TableBlock {
    type: 'table';
    columns: string[];
    rows: Array<Array<string | number | null>>;
}

export interface ChartBlock {
    type: 'chart';
    chartType?: 'bar' | 'line' | 'area' | 'pie';
    title?: string;
    data: Array<Record<string, string | number>>;
    xKey: string;
    yKey: string;
}

export interface ImageBlock {
    type: 'image';
    url: string;
    alt?: string;
    caption?: string;
    refresh_token?: string;
}

export interface SourceListBlock {
    type: 'source_list';
    sources: RAGSource[];
}

export interface ActionCardBlock {
    type: 'action_card';
    action_id: string;
    action_type: string;
    summary: string;
    payload?: Record<string, unknown>;
}

export type ChatMessageBlock =
    | TextBlock
    | TableBlock
    | ChartBlock
    | ImageBlock
    | SourceListBlock
    | ActionCardBlock;

export interface StreamStartEvent {
    event: 'start';
    data: {
        request_id?: string;
        session_id?: string;
    };
}

export interface StreamMetadataEvent {
    event: 'metadata';
    data: {
        sources: RAGSource[];
        metadata: RAGMetadata;
    };
}

export interface StreamChunkEvent {
    event: 'chunk';
    data: {
        chunk: string;
    };
}

export interface StreamActionRequiredEvent {
    event: 'action_required';
    data: {
        action_id: string;
        action_type: string;
        summary: string;
        approval_token?: string;
        expires_in_seconds?: number;
        payload?: Record<string, unknown>;
    };
}

export interface StreamHeartbeatEvent {
    event: 'heartbeat';
    data: {
        ts?: string;
    };
}

export interface StreamErrorEvent {
    event: 'error';
    data: {
        code?: string;
        message: string;
    };
}

export interface StreamDoneEvent {
    event: 'done';
    data: {
        status?: 'completed' | 'failed' | 'awaiting_action';
        reason?: string;
        metadata?: RAGMetadata;
    };
}

export type ChatStreamEvent =
    | StreamStartEvent
    | StreamMetadataEvent
    | StreamChunkEvent
    | StreamActionRequiredEvent
    | StreamHeartbeatEvent
    | StreamErrorEvent
    | StreamDoneEvent;

export interface ActionDecisionResponse {
    status: string;
    action_id: string;
    decision: 'approve' | 'reject';
    outcome?: string;
    session_id?: string;
    assistant_message?: string;
    resolved?: boolean;
}
function defaultMetadata(sessionId?: string): RAGMetadata {
    return {
        num_chunks: 0,
        average_confidence: 'low',
        session_id: sessionId,
    };
}

function toStreamEvent(raw: unknown): ChatStreamEvent | null {
    if (!raw || typeof raw !== 'object') return null;

    const payload = raw as Record<string, unknown>;
    const event = payload.event;

    if (typeof event === 'string') {
        const data = (payload.data ?? {}) as Record<string, unknown>;

        switch (event) {
            case 'start':
                return {
                    event: 'start',
                    data: {
                        request_id: typeof data.request_id === 'string' ? data.request_id : undefined,
                        session_id: typeof data.session_id === 'string' ? data.session_id : undefined,
                    },
                };
            case 'metadata':
                return {
                    event: 'metadata',
                    data: {
                        sources: Array.isArray(data.sources) ? (data.sources as RAGSource[]) : [],
                        metadata: (data.metadata as RAGMetadata) || defaultMetadata(),
                    },
                };
            case 'chunk':
                return {
                    event: 'chunk',
                    data: {
                        chunk: typeof data.chunk === 'string' ? data.chunk : '',
                    },
                };
            case 'action_required':
                return {
                    event: 'action_required',
                    data: {
                        action_id: typeof data.action_id === 'string' ? data.action_id : '',
                        action_type: typeof data.action_type === 'string' ? data.action_type : 'unknown',
                        summary: typeof data.summary === 'string' ? data.summary : 'Action requires approval',
                        approval_token: typeof data.approval_token === 'string' ? data.approval_token : undefined,
                        expires_in_seconds: typeof data.expires_in_seconds === 'number' ? data.expires_in_seconds : undefined,
                        payload: (data.payload as Record<string, unknown> | undefined),
                    },
                };
            case 'heartbeat':
                return {
                    event: 'heartbeat',
                    data: {
                        ts: typeof data.ts === 'string' ? data.ts : undefined,
                    },
                };
            case 'error':
                return {
                    event: 'error',
                    data: {
                        code: typeof data.code === 'string' ? data.code : undefined,
                        message: typeof data.message === 'string' ? data.message : 'Unknown stream error',
                    },
                };
            case 'done':
                {
                    const rawStatus = typeof data.status === 'string' ? data.status : 'completed';
                    const normalizedStatus = rawStatus === 'failed'
                        ? 'failed'
                        : rawStatus === 'awaiting_action'
                            ? 'awaiting_action'
                            : 'completed';
                return {
                    event: 'done',
                    data: {
                        status: normalizedStatus,
                        reason: typeof data.reason === 'string' ? data.reason : undefined,
                        metadata: data.metadata as RAGMetadata | undefined,
                    },
                };
                }
            default:
                return null;
        }
    }

    // Legacy payload support for older backend nodes.
    if (typeof payload.error === 'string') {
        return {
            event: 'error',
            data: { message: payload.error },
        };
    }

    if (Array.isArray(payload.sources) || payload.metadata) {
        return {
            event: 'metadata',
            data: {
                sources: Array.isArray(payload.sources) ? (payload.sources as RAGSource[]) : [],
                metadata: (payload.metadata as RAGMetadata) || defaultMetadata(),
            },
        };
    }

    if (typeof payload.chunk === 'string') {
        return {
            event: 'chunk',
            data: {
                chunk: payload.chunk,
            },
        };
    }

    if (payload.done) {
        return {
            event: 'done',
            data: {
                status: 'completed',
                metadata: payload.metadata as RAGMetadata | undefined,
            },
        };
    }

    return null;
}

type StreamEventCallback = (event: ChatStreamEvent) => void;
type StreamChunkCallback = (chunk: string) => void;
type StreamMetadataCallback = (sources: RAGSource[], metadata: RAGMetadata) => void;
type StreamCompleteCallback = () => void;
type StreamErrorCallback = (error: string) => void;

type QueryStreamFn = {
    (
        question: string,
        sessionId: string | null,
        onChunk: StreamChunkCallback,
        onMetadata: StreamMetadataCallback,
        onComplete?: StreamCompleteCallback,
        onError?: StreamErrorCallback,
    ): Promise<void>;
    (question: string, sessionId: string | null, onEvent: StreamEventCallback): Promise<void>;
};

const queryStream: QueryStreamFn = async (
    question: string,
    sessionId: string | null,
    onChunkOrEvent: StreamChunkCallback | StreamEventCallback,
    onMetadata?: StreamMetadataCallback,
    onComplete?: StreamCompleteCallback,
    onError?: StreamErrorCallback,
) => {
    let sawTerminalEvent = false;
    const legacyMode = typeof onMetadata === 'function'
        || typeof onComplete === 'function'
        || typeof onError === 'function';
    let legacySawError = false;

    const emitEvent = (event: ChatStreamEvent) => {
        if (!legacyMode) {
            (onChunkOrEvent as StreamEventCallback)(event);
            return;
        }

        switch (event.event) {
            case 'metadata':
                onMetadata?.(event.data.sources, event.data.metadata);
                break;
            case 'chunk':
                (onChunkOrEvent as StreamChunkCallback)(event.data.chunk);
                break;
            case 'error':
                legacySawError = true;
                onError?.(event.data.message || 'Unknown stream error.');
                break;
            case 'done':
                if (event.data.status === 'failed') {
                    if (!legacySawError) {
                        onError?.(event.data.reason || 'Stream failed.');
                        legacySawError = true;
                    }
                } else {
                    onComplete?.();
                }
                break;
            default:
                break;
        }
    };

    try {
        const token = localStorage.getItem('accessToken');
        const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/rag/query/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                question,
                session_id: sessionId
            })
        });

        if (!response.ok) {
            emitEvent({
                event: 'error',
                data: {
                    code: 'http_error',
                    message: `HTTP error! status: ${response.status}`,
                },
            });
            emitEvent({
                event: 'done',
                data: {
                    status: 'failed',
                    reason: 'http_error',
                },
            });
            return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() || '';

                for (const part of parts) {
                    if (!part.startsWith('data: ')) {
                        continue;
                    }

                    try {
                        const dataStr = part.replace('data: ', '').trim();
                        if (!dataStr) continue;

                        const raw = JSON.parse(dataStr) as unknown;
                        const streamEvent = toStreamEvent(raw);

                        if (!streamEvent) {
                            continue;
                        }

                        emitEvent(streamEvent);

                        if (streamEvent.event === 'done') {
                            sawTerminalEvent = true;
                        }
                    } catch (error) {
                        emitEvent({
                            event: 'error',
                            data: {
                                code: 'parse_error',
                                message: 'Failed to parse streaming event payload.',
                            },
                        });
                        emitEvent({
                            event: 'done',
                            data: {
                                status: 'failed',
                                reason: 'parse_error',
                            },
                        });
                        sawTerminalEvent = true;
                        console.error('Error parsing SSE part:', part, error);
                        return;
                    }
                }
            }
        }

        if (!sawTerminalEvent) {
            emitEvent({
                event: 'error',
                data: {
                    code: 'missing_terminal_event',
                    message: 'Stream closed without a terminal event.',
                },
            });
            emitEvent({
                event: 'done',
                data: {
                    status: 'failed',
                    reason: 'missing_terminal_event',
                },
            });
        }
    } catch (error) {
        console.error('RAG Streaming Error:', error);
        emitEvent({
            event: 'error',
            data: {
                code: 'stream_runtime_error',
                message: error instanceof Error ? error.message : 'Unknown error occurred.',
            },
        });
        emitEvent({
            event: 'done',
            data: {
                status: 'failed',
                reason: 'stream_runtime_error',
            },
        });
    }
};

export const ragService = {
    // --- Session Management ---
    getSessions: async (): Promise<ChatSession[]> => {
        const response = await api.get('/rag/sessions/');
        return response.data.results || response.data;
    },

    createSession: async (title?: string): Promise<ChatSession> => {
        const response = await api.post('/rag/sessions/', { title });
        return response.data;
    },

    renameSession: async (id: string, title: string): Promise<ChatSession> => {
        const response = await api.patch(`/rag/sessions/${id}/rename/`, { title });
        return response.data;
    },

    deleteSession: async (id: string): Promise<void> => {
        await api.delete(`/rag/sessions/${id}/`);
    },

    updateSessionFolder: async (id: string, folderId: string | null): Promise<ChatSession> => {
        const response = await api.patch(`/rag/sessions/${id}/folder/`, { folder_id: folderId });
        return response.data;
    },

    bulkDeleteSessions: async (ids: string[]): Promise<{ deleted: number }> => {
        const response = await api.post('/rag/sessions/bulk-delete/', { session_ids: ids });
        return response.data;
    },

    bulkUpdateSessionFolder: async (ids: string[], folderId: string | null): Promise<{ updated: number }> => {
        const response = await api.post('/rag/sessions/bulk-folder/', { session_ids: ids, folder_id: folderId });
        return response.data;
    },

    submitActionDecision: async (
        actionId: string,
        decision: 'approve' | 'reject',
        approvalToken: string,
        reason?: string,
        sessionId?: string | null,
    ): Promise<ActionDecisionResponse> => {
        const response = await api.post('/rag/action-decision/', {
            action_id: actionId,
            decision,
            approval_token: approvalToken,
            reason,
            session_id: sessionId || null,
        });
        return response.data;
    },
    // --- Folder Management ---
    getFolders: async (): Promise<ChatFolder[]> => {
        const response = await api.get('/rag/folders/');
        return response.data.results || response.data;
    },

    createFolder: async (name: string): Promise<ChatFolder> => {
        const response = await api.post('/rag/folders/', { name });
        return response.data;
    },

    renameFolder: async (id: string, name: string): Promise<ChatFolder> => {
        const response = await api.patch(`/rag/folders/${id}/`, { name });
        return response.data;
    },

    deleteFolder: async (id: string): Promise<void> => {
        await api.delete(`/rag/folders/${id}/`);
    },

    getMessages: async (sessionId: string): Promise<ChatMessage[]> => {
        const response = await api.get(`/rag/sessions/${sessionId}/messages/`);
        return response.data.results || response.data;
    },

    // --- Streaming Query ---
    queryStream
};
