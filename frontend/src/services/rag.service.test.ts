import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ragService } from './rag.service';

type ReaderResult = {
    done: boolean;
    value?: Uint8Array;
};

function createSseReader(chunks: string[]) {
    const encoder = new TextEncoder();
    let index = 0;

    return {
        read: vi.fn(async (): Promise<ReaderResult> => {
            if (index >= chunks.length) {
                return { done: true };
            }
            const value = encoder.encode(chunks[index]);
            index += 1;
            return { done: false, value };
        }),
    };
}

describe('ragService.queryStream terminal error handling', () => {
    beforeEach(() => {
        localStorage.setItem('accessToken', 'test-token');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('emits parse_error and done fallback when SSE payload cannot be parsed', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const reader = createSseReader(['data: {invalid-json}\n\n']);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            body: {
                getReader: () => reader,
            },
        }));

        const events: Array<{ event: string; data: Record<string, unknown> }> = [];

        await ragService.queryStream('action: rotate access key', 'session-1', (event) => {
            events.push(event as { event: string; data: Record<string, unknown> });
        });

        expect(events).toHaveLength(2);
        expect(events[0].event).toBe('error');
        expect(events[0].data.code).toBe('parse_error');
        expect(events[1]).toMatchObject({
            event: 'done',
            data: {
                status: 'failed',
                reason: 'parse_error',
            },
        });
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('emits stream_runtime_error and done fallback when fetch throws', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

        const events: Array<{ event: string; data: Record<string, unknown> }> = [];

        await ragService.queryStream('show audit summary', 'session-2', (event) => {
            events.push(event as { event: string; data: Record<string, unknown> });
        });

        expect(events).toHaveLength(2);
        expect(events[0].event).toBe('error');
        expect(events[0].data.code).toBe('stream_runtime_error');
        expect(events[0].data.message).toBe('network down');
        expect(events[1]).toMatchObject({
            event: 'done',
            data: {
                status: 'failed',
                reason: 'stream_runtime_error',
            },
        });
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('emits missing_terminal_event fallback when stream closes without done', async () => {
        const reader = createSseReader([
            'data: {"event":"start","data":{"request_id":"req-1","session_id":"session-3"}}\n\n',
        ]);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            body: {
                getReader: () => reader,
            },
        }));

        const events: Array<{ event: string; data: Record<string, unknown> }> = [];

        await ragService.queryStream('show latest audit events', 'session-3', (event) => {
            events.push(event as { event: string; data: Record<string, unknown> });
        });

        expect(events[0].event).toBe('start');
        expect(events[1]).toMatchObject({
            event: 'error',
            data: {
                code: 'missing_terminal_event',
                message: 'Stream closed without a terminal event.',
            },
        });
        expect(events[2]).toMatchObject({
            event: 'done',
            data: {
                status: 'failed',
                reason: 'missing_terminal_event',
            },
        });
    });
});
