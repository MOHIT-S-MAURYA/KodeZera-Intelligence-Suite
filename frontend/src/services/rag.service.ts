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
    created_at: Date | string;
}

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
    /**
     * Streams the RAG response piece-by-piece.
     * @param question The user's prompt.
     * @param sessionId Optional ongoing chat session.
     * @param onChunk Callback whenever a new text chunk is received.
     * @param onMetadata Callback for initial sources/metadata.
     * @param onComplete Callback when the stream finishes successfully.
     * @param onError Callback on stream breaks or backend errors.
     */
    queryStream: async (
        question: string,
        sessionId: string | null,
        onChunk: (chunk: string) => void,
        onMetadata: (sources: RAGSource[], metadata: RAGMetadata) => void,
        onComplete: () => void,
        onError: (error: string) => void
    ) => {
        try {
            const token = localStorage.getItem('accessToken');
            // api.defaults.baseURL is '/api/v1' (relative) in dev so fetch uses the
            // same origin and the Vite proxy forwards it to Django.
            // In production VITE_API_BASE_URL should be set to the full origin
            // (e.g. https://api.example.com/api/v1) which fetch resolves directly.
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
                throw new Error(`HTTP error! status: ${response.status}`);
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
                        if (part.startsWith('data: ')) {
                            try {
                                const dataStr = part.replace('data: ', '').trim();
                                if (!dataStr) continue;

                                const data = JSON.parse(dataStr);

                                if (data.error) {
                                    onError(data.error);
                                    return;
                                }

                                if (data.sources && data.metadata) {
                                    onMetadata(data.sources, data.metadata);
                                }

                                if (data.chunk) {
                                    onChunk(data.chunk);
                                }

                                if (data.done) {
                                    onComplete();
                                    return;
                                }
                            } catch (e) {
                                console.error('Error parsing SSE part:', part, e);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('RAG Streaming Error:', error);
            onError(error instanceof Error ? error.message : 'Unknown error occurred.');
        }
    }
};
