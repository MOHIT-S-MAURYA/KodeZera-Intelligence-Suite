import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionApprovalModal } from './ActionApprovalModal';

const pendingAction = {
    actionId: 'action-7',
    actionType: 'delete',
    summary: 'Remove stale contractor access',
    approvalToken: 'approval-token-7',
    expiresInSeconds: 240,
    payload: {
        session_id: 'session-1',
    },
};

describe('ActionApprovalModal decision handling', () => {
    it('does not render content when there is no pending action', () => {
        render(
            <ActionApprovalModal
                pendingAction={null}
                onApprove={vi.fn()}
                onReject={vi.fn()}
            />,
        );

        expect(screen.queryByText('Approval Required')).not.toBeInTheDocument();
    });

    it('submits trimmed reason on approve', async () => {
        const onApprove = vi.fn().mockResolvedValue(undefined);
        const onReject = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();

        render(
            <ActionApprovalModal
                pendingAction={pendingAction}
                onApprove={onApprove}
                onReject={onReject}
            />,
        );

        await user.type(screen.getByLabelText(/Reason/i), '  Needed for incident rollback  ');
        await user.click(screen.getByRole('button', { name: 'Approve' }));

        await waitFor(() => {
            expect(onApprove).toHaveBeenCalledWith('Needed for incident rollback');
        });
        expect(onReject).not.toHaveBeenCalled();
    });

    it('submits trimmed reason on reject', async () => {
        const onApprove = vi.fn().mockResolvedValue(undefined);
        const onReject = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();

        render(
            <ActionApprovalModal
                pendingAction={pendingAction}
                onApprove={onApprove}
                onReject={onReject}
            />,
        );

        await user.type(screen.getByLabelText(/Reason/i), '  Missing required approval evidence  ');
        await user.click(screen.getByRole('button', { name: 'Reject' }));

        await waitFor(() => {
            expect(onReject).toHaveBeenCalledWith('Missing required approval evidence');
        });
        expect(onApprove).not.toHaveBeenCalled();
    });
});
