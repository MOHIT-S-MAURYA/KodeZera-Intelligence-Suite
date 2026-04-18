import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStream } from './useChatStream';
import { ragService } from '../../../services/rag.service';

const addToastMock = vi.fn();

vi.mock('../../../store/ui.store', () => ({
    useUIStore: () => ({
        addToast: addToastMock,
    }),
}));

vi.mock('../../../services/rag.service', () => ({
    ragService: {
        queryStream: vi.fn(),
        submitActionDecision: vi.fn(),
    },
}));

function createHookArgs() {
    return {
        activeSessionId: 'session-1',
        setActiveSessionId: vi.fn(),
        createSessionFromPrompt: vi.fn(),
        refreshSessions: vi.fn().mockResolvedValue(undefined),
        appendUserMessage: vi.fn(),
        createAssistantPlaceholder: vi.fn().mockReturnValue('assistant-msg-1'),
        appendAssistantChunk: vi.fn(),
        attachSources: vi.fn(),
        appendMessageBlock: vi.fn(),
        appendAssistantError: vi.fn(),
        appendAssistantMessage: vi.fn(),
    };
}

describe('useChatStream awaiting action integration', () => {
    const queryStreamMock = vi.mocked(ragService.queryStream);
    const submitActionDecisionMock = vi.mocked(ragService.submitActionDecision);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('transitions to awaiting_action when action_required stream event is received', async () => {
        const args = createHookArgs();

        queryStreamMock.mockImplementation(async (_question, _sessionId, onEvent) => {
            onEvent({
                event: 'start',
                data: { session_id: 'session-1', request_id: 'req-1' },
            });
            onEvent({
                event: 'metadata',
                data: {
                    sources: [],
                    metadata: {
                        num_chunks: 1,
                        average_confidence: 'high',
                        session_id: 'session-1',
                    },
                },
            });
            onEvent({
                event: 'action_required',
                data: {
                    action_id: 'action-1',
                    action_type: 'delete',
                    summary: 'Disable stale contractor account',
                    approval_token: 'approval-token-1',
                    expires_in_seconds: 300,
                    payload: {
                        session_id: 'session-1',
                    },
                },
            });
            onEvent({
                event: 'done',
                data: {
                    status: 'awaiting_action',
                    reason: 'awaiting_action',
                    metadata: {
                        num_chunks: 1,
                        average_confidence: 'high',
                        session_id: 'session-1',
                    },
                },
            });
        });

        const { result } = renderHook(() => useChatStream(args));

        await act(async () => {
            await result.current.sendMessage('action: disable stale contractor account');
        });

        expect(args.appendUserMessage).toHaveBeenCalledWith('session-1', 'action: disable stale contractor account');
        expect(args.createAssistantPlaceholder).toHaveBeenCalledWith('session-1');
        expect(args.appendMessageBlock).toHaveBeenCalledTimes(1);
        expect(result.current.streamStatus).toBe('awaiting_action');
        expect(result.current.pendingAction?.actionId).toBe('action-1');
        expect(result.current.pendingAction?.approvalToken).toBe('approval-token-1');
    });

    it('submits approve decision and resets pending state after resume', async () => {
        vi.useFakeTimers();

        const args = createHookArgs();

        queryStreamMock.mockImplementation(async (_question, _sessionId, onEvent) => {
            onEvent({
                event: 'action_required',
                data: {
                    action_id: 'action-2',
                    action_type: 'grant',
                    summary: 'Grant temporary endpoint access',
                    approval_token: 'approval-token-2',
                    expires_in_seconds: 180,
                    payload: {
                        session_id: 'session-1',
                    },
                },
            });
            onEvent({
                event: 'done',
                data: {
                    status: 'awaiting_action',
                    reason: 'awaiting_action',
                },
            });
        });

        submitActionDecisionMock.mockResolvedValue({
            status: 'resumed',
            action_id: 'action-2',
            decision: 'approve',
            outcome: 'approved',
            session_id: 'session-1',
            assistant_message: 'Action approved: Grant temporary endpoint access.',
            resolved: true,
        });

        const { result } = renderHook(() => useChatStream(args));

        await act(async () => {
            await result.current.sendMessage('action: grant temporary endpoint access');
        });

        await act(async () => {
            await result.current.approveAction('Approved by tenant admin');
        });

        expect(submitActionDecisionMock).toHaveBeenCalledWith(
            'action-2',
            'approve',
            'approval-token-2',
            'Approved by tenant admin',
            'session-1',
        );
        expect(args.appendAssistantMessage).toHaveBeenCalledWith(
            'session-1',
            'Action approved: Grant temporary endpoint access.',
        );
        expect(result.current.pendingAction).toBeNull();
        expect(result.current.streamStatus).toBe('completed');

        act(() => {
            vi.advanceTimersByTime(801);
        });

        expect(result.current.streamStatus).toBe('idle');
    });

    it('keeps pending action when decision submission fails', async () => {
        const args = createHookArgs();

        queryStreamMock.mockImplementation(async (_question, _sessionId, onEvent) => {
            onEvent({
                event: 'action_required',
                data: {
                    action_id: 'action-3',
                    action_type: 'delete',
                    summary: 'Disable temporary account',
                    approval_token: 'approval-token-3',
                    expires_in_seconds: 120,
                    payload: {
                        session_id: 'session-1',
                    },
                },
            });
            onEvent({
                event: 'done',
                data: {
                    status: 'awaiting_action',
                    reason: 'awaiting_action',
                },
            });
        });

        submitActionDecisionMock.mockRejectedValue(new Error('network failure'));

        const { result } = renderHook(() => useChatStream(args));

        await act(async () => {
            await result.current.sendMessage('action: disable temporary account');
        });

        await act(async () => {
            await result.current.rejectAction('Insufficient evidence');
        });

        expect(submitActionDecisionMock).toHaveBeenCalledWith(
            'action-3',
            'reject',
            'approval-token-3',
            'Insufficient evidence',
            'session-1',
        );
        expect(addToastMock).toHaveBeenCalledWith('error', 'Failed to reject action.');
        expect(result.current.pendingAction?.actionId).toBe('action-3');
        expect(result.current.streamStatus).toBe('awaiting_action');
        expect(args.appendAssistantMessage).not.toHaveBeenCalled();
    });
});
