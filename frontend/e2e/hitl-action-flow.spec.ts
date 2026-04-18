import { expect, test } from '@playwright/test';

test.describe('HITL action flow', () => {
    test('shows approval modal and resumes conversation after approve', async ({ page }) => {
        const sessionId = 'session-e2e-1';
        const actionId = 'action-e2e-1';
        const approvalToken = 'token-e2e-1';
        const summary = 'Revoke contractor export access';

        const sessions: Array<Record<string, unknown>> = [];
        let queryPayload: Record<string, unknown> | null = null;
        let actionDecisionPayload: Record<string, unknown> | null = null;

        await page.addInitScript(() => {
            localStorage.setItem('accessToken', 'e2e-access-token');
            localStorage.setItem('refreshToken', 'e2e-refresh-token');
            localStorage.setItem('user', JSON.stringify({
                id: 'user-e2e-1',
                email: 'e2e@example.com',
                username: 'e2e_user',
                first_name: 'E2E',
                last_name: 'User',
                full_name: 'E2E User',
                is_tenant_admin: true,
                isPlatformOwner: false,
                tenant: {
                    id: 'tenant-e2e-1',
                    name: 'E2E Tenant',
                },
            }));
        });

        await page.route('**/api/v1/**', async (route) => {
            const request = route.request();
            const method = request.method();
            const url = new URL(request.url());
            const path = url.pathname;

            if (path.endsWith('/notifications/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        results: [],
                        total: 0,
                        limit: 50,
                        offset: 0,
                    }),
                });
                return;
            }

            if (path.endsWith('/rag/folders/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }

            if (path.endsWith('/rag/sessions/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ results: sessions }),
                });
                return;
            }

            if (path.endsWith('/rag/sessions/') && method === 'POST') {
                const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
                const created = {
                    id: sessionId,
                    title: String(payload.title || 'New Chat'),
                    folder: null,
                    created_at: '2026-04-15T12:00:00Z',
                    updated_at: '2026-04-15T12:00:00Z',
                };
                sessions.unshift(created);

                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify(created),
                });
                return;
            }

            if (/\/rag\/sessions\/[^/]+\/messages\/$/.test(path) && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }

            if (path.endsWith('/rag/query/') && method === 'POST') {
                queryPayload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;

                const streamBody = [
                    `data: ${JSON.stringify({ event: 'start', data: { request_id: 'req-e2e-1', session_id: sessionId } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'metadata', data: { sources: [], metadata: { session_id: sessionId, num_chunks: 0, average_confidence: 'low' } } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'action_required', data: { action_id: actionId, action_type: 'delete', summary, approval_token: approvalToken, expires_in_seconds: 300, payload: { session_id: sessionId } } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'chunk', data: { chunk: `Action request detected: ${summary}. Please approve or reject to continue.` } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'done', data: { status: 'awaiting_action', reason: 'awaiting_action', metadata: { session_id: sessionId } } })}\n\n`,
                ].join('');

                await route.fulfill({
                    status: 200,
                    headers: {
                        'content-type': 'text/event-stream',
                        'cache-control': 'no-cache',
                    },
                    body: streamBody,
                });
                return;
            }

            if (path.endsWith('/rag/action-decision/') && method === 'POST') {
                actionDecisionPayload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;

                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        status: 'resumed',
                        action_id: actionId,
                        decision: 'approve',
                        outcome: 'approved',
                        session_id: sessionId,
                        assistant_message: `Action approved: ${summary}. Execution has been accepted.`,
                        resolved: true,
                    }),
                });
                return;
            }

            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: `Unhandled mock route: ${method} ${path}` }),
            });
        });

        await page.goto('/chat');

        const composer = page.getByPlaceholder('Ask anything about your accessible documents');
        await expect(composer).toBeVisible();
        await composer.fill('action: revoke contractor export access');
        await page.getByRole('button', { name: 'Send' }).click();

        const approvalHeading = page.getByRole('heading', { name: 'Approval Required' });
        await expect(approvalHeading).toBeVisible();
        await expect(page.getByText(summary, { exact: true })).toBeVisible();

        await page.getByLabel('Reason (optional)').fill('Approved by E2E test');
        await page.getByRole('button', { name: 'Approve' }).click();

        await expect(approvalHeading).toBeHidden();
        await expect(page.getByText(`Action approved: ${summary}. Execution has been accepted.`, { exact: true })).toBeVisible();

        expect(queryPayload).not.toBeNull();
        expect(queryPayload).toMatchObject({
            question: 'action: revoke contractor export access',
            session_id: sessionId,
        });

        expect(actionDecisionPayload).not.toBeNull();
        expect(actionDecisionPayload).toMatchObject({
            action_id: actionId,
            decision: 'approve',
            approval_token: approvalToken,
            reason: 'Approved by E2E test',
            session_id: sessionId,
        });
    });

    test('submits rejection decision and appends rejection assistant message', async ({ page }) => {
        const sessionId = 'session-e2e-2';
        const actionId = 'action-e2e-2';
        const approvalToken = 'token-e2e-2';
        const summary = 'Suspend temporary finance export';

        const sessions: Array<Record<string, unknown>> = [];
        let actionDecisionPayload: Record<string, unknown> | null = null;

        await page.addInitScript(() => {
            localStorage.setItem('accessToken', 'e2e-access-token');
            localStorage.setItem('refreshToken', 'e2e-refresh-token');
            localStorage.setItem('user', JSON.stringify({
                id: 'user-e2e-1',
                email: 'e2e@example.com',
                username: 'e2e_user',
                first_name: 'E2E',
                last_name: 'User',
                full_name: 'E2E User',
                is_tenant_admin: true,
                isPlatformOwner: false,
                tenant: {
                    id: 'tenant-e2e-1',
                    name: 'E2E Tenant',
                },
            }));
        });

        await page.route('**/api/v1/**', async (route) => {
            const request = route.request();
            const method = request.method();
            const url = new URL(request.url());
            const path = url.pathname;

            if (path.endsWith('/notifications/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        results: [],
                        total: 0,
                        limit: 50,
                        offset: 0,
                    }),
                });
                return;
            }

            if (path.endsWith('/rag/folders/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }

            if (path.endsWith('/rag/sessions/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ results: sessions }),
                });
                return;
            }

            if (path.endsWith('/rag/sessions/') && method === 'POST') {
                const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
                const created = {
                    id: sessionId,
                    title: String(payload.title || 'New Chat'),
                    folder: null,
                    created_at: '2026-04-15T12:00:00Z',
                    updated_at: '2026-04-15T12:00:00Z',
                };
                sessions.unshift(created);

                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify(created),
                });
                return;
            }

            if (/\/rag\/sessions\/[^/]+\/messages\/$/.test(path) && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }

            if (path.endsWith('/rag/query/') && method === 'POST') {
                const streamBody = [
                    `data: ${JSON.stringify({ event: 'start', data: { request_id: 'req-e2e-2', session_id: sessionId } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'metadata', data: { sources: [], metadata: { session_id: sessionId, num_chunks: 0, average_confidence: 'low' } } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'action_required', data: { action_id: actionId, action_type: 'update', summary, approval_token: approvalToken, expires_in_seconds: 300, payload: { session_id: sessionId } } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'chunk', data: { chunk: `Action request detected: ${summary}. Please approve or reject to continue.` } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'done', data: { status: 'awaiting_action', reason: 'awaiting_action', metadata: { session_id: sessionId } } })}\n\n`,
                ].join('');

                await route.fulfill({
                    status: 200,
                    headers: {
                        'content-type': 'text/event-stream',
                        'cache-control': 'no-cache',
                    },
                    body: streamBody,
                });
                return;
            }

            if (path.endsWith('/rag/action-decision/') && method === 'POST') {
                actionDecisionPayload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;

                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        status: 'resumed',
                        action_id: actionId,
                        decision: 'reject',
                        outcome: 'rejected',
                        session_id: sessionId,
                        assistant_message: `Action rejected: ${summary}. Reason: Rejected by E2E test.`,
                        resolved: true,
                    }),
                });
                return;
            }

            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: `Unhandled mock route: ${method} ${path}` }),
            });
        });

        await page.goto('/chat');

        const composer = page.getByPlaceholder('Ask anything about your accessible documents');
        await expect(composer).toBeVisible();
        await composer.fill('action: suspend temporary finance export');
        await page.getByRole('button', { name: 'Send' }).click();

        const approvalHeading = page.getByRole('heading', { name: 'Approval Required' });
        await expect(approvalHeading).toBeVisible();
        await expect(page.getByText(summary, { exact: true })).toBeVisible();

        await page.getByLabel('Reason (optional)').fill('Rejected by E2E test');
        await page.getByRole('button', { name: 'Reject' }).click();

        await expect(approvalHeading).toBeHidden();
        await expect(page.getByText(`Action rejected: ${summary}. Reason: Rejected by E2E test.`, { exact: true })).toBeVisible();

        expect(actionDecisionPayload).not.toBeNull();
        expect(actionDecisionPayload).toMatchObject({
            action_id: actionId,
            decision: 'reject',
            approval_token: approvalToken,
            reason: 'Rejected by E2E test',
            session_id: sessionId,
        });
    });

    test('keeps approval modal open when decision fails with invalid token', async ({ page }) => {
        const sessionId = 'session-e2e-3';
        const actionId = 'action-e2e-3';
        const approvalToken = 'token-invalid-e2e';
        const summary = 'Disable external sharing';

        const sessions: Array<Record<string, unknown>> = [];
        let actionDecisionPayload: Record<string, unknown> | null = null;

        await page.addInitScript(() => {
            localStorage.setItem('accessToken', 'e2e-access-token');
            localStorage.setItem('refreshToken', 'e2e-refresh-token');
            localStorage.setItem('user', JSON.stringify({
                id: 'user-e2e-1',
                email: 'e2e@example.com',
                username: 'e2e_user',
                first_name: 'E2E',
                last_name: 'User',
                full_name: 'E2E User',
                is_tenant_admin: true,
                isPlatformOwner: false,
                tenant: {
                    id: 'tenant-e2e-1',
                    name: 'E2E Tenant',
                },
            }));
        });

        await page.route('**/api/v1/**', async (route) => {
            const request = route.request();
            const method = request.method();
            const url = new URL(request.url());
            const path = url.pathname;

            if (path.endsWith('/notifications/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        results: [],
                        total: 0,
                        limit: 50,
                        offset: 0,
                    }),
                });
                return;
            }

            if (path.endsWith('/rag/folders/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }

            if (path.endsWith('/rag/sessions/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ results: sessions }),
                });
                return;
            }

            if (path.endsWith('/rag/sessions/') && method === 'POST') {
                const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
                const created = {
                    id: sessionId,
                    title: String(payload.title || 'New Chat'),
                    folder: null,
                    created_at: '2026-04-15T12:00:00Z',
                    updated_at: '2026-04-15T12:00:00Z',
                };
                sessions.unshift(created);

                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify(created),
                });
                return;
            }

            if (/\/rag\/sessions\/[^/]+\/messages\/$/.test(path) && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }

            if (path.endsWith('/rag/query/') && method === 'POST') {
                const streamBody = [
                    `data: ${JSON.stringify({ event: 'start', data: { request_id: 'req-e2e-3', session_id: sessionId } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'metadata', data: { sources: [], metadata: { session_id: sessionId, num_chunks: 0, average_confidence: 'low' } } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'action_required', data: { action_id: actionId, action_type: 'update', summary, approval_token: approvalToken, expires_in_seconds: 300, payload: { session_id: sessionId } } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'chunk', data: { chunk: `Action request detected: ${summary}. Please approve or reject to continue.` } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'done', data: { status: 'awaiting_action', reason: 'awaiting_action', metadata: { session_id: sessionId } } })}\n\n`,
                ].join('');

                await route.fulfill({
                    status: 200,
                    headers: {
                        'content-type': 'text/event-stream',
                        'cache-control': 'no-cache',
                    },
                    body: streamBody,
                });
                return;
            }

            if (path.endsWith('/rag/action-decision/') && method === 'POST') {
                actionDecisionPayload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;

                await route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    body: JSON.stringify({ detail: 'Invalid approval token.' }),
                });
                return;
            }

            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: `Unhandled mock route: ${method} ${path}` }),
            });
        });

        await page.goto('/chat');

        const composer = page.getByPlaceholder('Ask anything about your accessible documents');
        await expect(composer).toBeVisible();
        await composer.fill('action: disable external sharing');
        await page.getByRole('button', { name: 'Send' }).click();

        const approvalHeading = page.getByRole('heading', { name: 'Approval Required' });
        await expect(approvalHeading).toBeVisible();
        await expect(page.getByText(summary, { exact: true })).toBeVisible();

        await page.getByLabel('Reason (optional)').fill('Approval attempt with invalid token');
        await page.getByRole('button', { name: 'Approve' }).click();

        await expect(page.getByText('Failed to approve action.')).toBeVisible();
        await expect(approvalHeading).toBeVisible();

        expect(actionDecisionPayload).not.toBeNull();
        expect(actionDecisionPayload).toMatchObject({
            action_id: actionId,
            decision: 'approve',
            approval_token: approvalToken,
            reason: 'Approval attempt with invalid token',
            session_id: sessionId,
        });
    });

    test('keeps approval modal open when decision fails with expired token', async ({ page }) => {
        const sessionId = 'session-e2e-4';
        const actionId = 'action-e2e-4';
        const approvalToken = 'token-expired-e2e';
        const summary = 'Archive stale compliance record';

        const sessions: Array<Record<string, unknown>> = [];
        let actionDecisionPayload: Record<string, unknown> | null = null;

        await page.addInitScript(() => {
            localStorage.setItem('accessToken', 'e2e-access-token');
            localStorage.setItem('refreshToken', 'e2e-refresh-token');
            localStorage.setItem('user', JSON.stringify({
                id: 'user-e2e-1',
                email: 'e2e@example.com',
                username: 'e2e_user',
                first_name: 'E2E',
                last_name: 'User',
                full_name: 'E2E User',
                is_tenant_admin: true,
                isPlatformOwner: false,
                tenant: {
                    id: 'tenant-e2e-1',
                    name: 'E2E Tenant',
                },
            }));
        });

        await page.route('**/api/v1/**', async (route) => {
            const request = route.request();
            const method = request.method();
            const url = new URL(request.url());
            const path = url.pathname;

            if (path.endsWith('/notifications/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        results: [],
                        total: 0,
                        limit: 50,
                        offset: 0,
                    }),
                });
                return;
            }

            if (path.endsWith('/rag/folders/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }

            if (path.endsWith('/rag/sessions/') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ results: sessions }),
                });
                return;
            }

            if (path.endsWith('/rag/sessions/') && method === 'POST') {
                const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
                const created = {
                    id: sessionId,
                    title: String(payload.title || 'New Chat'),
                    folder: null,
                    created_at: '2026-04-15T12:00:00Z',
                    updated_at: '2026-04-15T12:00:00Z',
                };
                sessions.unshift(created);

                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify(created),
                });
                return;
            }

            if (/\/rag\/sessions\/[^/]+\/messages\/$/.test(path) && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
                return;
            }

            if (path.endsWith('/rag/query/') && method === 'POST') {
                const streamBody = [
                    `data: ${JSON.stringify({ event: 'start', data: { request_id: 'req-e2e-4', session_id: sessionId } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'metadata', data: { sources: [], metadata: { session_id: sessionId, num_chunks: 0, average_confidence: 'low' } } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'action_required', data: { action_id: actionId, action_type: 'delete', summary, approval_token: approvalToken, expires_in_seconds: 60, payload: { session_id: sessionId } } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'chunk', data: { chunk: `Action request detected: ${summary}. Please approve or reject to continue.` } })}\n\n`,
                    `data: ${JSON.stringify({ event: 'done', data: { status: 'awaiting_action', reason: 'awaiting_action', metadata: { session_id: sessionId } } })}\n\n`,
                ].join('');

                await route.fulfill({
                    status: 200,
                    headers: {
                        'content-type': 'text/event-stream',
                        'cache-control': 'no-cache',
                    },
                    body: streamBody,
                });
                return;
            }

            if (path.endsWith('/rag/action-decision/') && method === 'POST') {
                actionDecisionPayload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;

                await route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    body: JSON.stringify({ detail: 'Approval token expired.' }),
                });
                return;
            }

            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: `Unhandled mock route: ${method} ${path}` }),
            });
        });

        await page.goto('/chat');

        const composer = page.getByPlaceholder('Ask anything about your accessible documents');
        await expect(composer).toBeVisible();
        await composer.fill('action: archive stale compliance record');
        await page.getByRole('button', { name: 'Send' }).click();

        const approvalHeading = page.getByRole('heading', { name: 'Approval Required' });
        await expect(approvalHeading).toBeVisible();
        await expect(page.getByText(summary, { exact: true })).toBeVisible();

        await page.getByLabel('Reason (optional)').fill('Rejection attempt with expired token');
        await page.getByRole('button', { name: 'Reject' }).click();

        await expect(page.getByText('Failed to reject action.')).toBeVisible();
        await expect(approvalHeading).toBeVisible();

        expect(actionDecisionPayload).not.toBeNull();
        expect(actionDecisionPayload).toMatchObject({
            action_id: actionId,
            decision: 'reject',
            approval_token: approvalToken,
            reason: 'Rejection attempt with expired token',
            session_id: sessionId,
        });
    });
});
