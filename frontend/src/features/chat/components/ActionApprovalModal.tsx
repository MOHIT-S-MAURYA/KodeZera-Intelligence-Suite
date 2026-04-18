import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import type { PendingAction } from '../types';

interface ActionApprovalModalProps {
    pendingAction: PendingAction | null;
    onApprove: (reason: string) => Promise<void>;
    onReject: (reason: string) => Promise<void>;
}

export function ActionApprovalModal({
    pendingAction,
    onApprove,
    onReject,
}: ActionApprovalModalProps) {
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (pendingAction) {
            setReason('');
            setSubmitting(false);
        }
    }, [pendingAction]);

    const handleApprove = async () => {
        if (!pendingAction) return;
        setSubmitting(true);
        try {
            await onApprove(reason.trim());
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!pendingAction) return;
        setSubmitting(true);
        try {
            await onReject(reason.trim());
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={!!pendingAction}
            onClose={() => {}}
            title="Approval Required"
            size="md"
        >
            {pendingAction && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-accent-orange/30 bg-accent-orange/5 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-orange">Action Type</p>
                        <p className="mt-1 text-sm font-semibold text-text-main">{pendingAction.actionType}</p>
                        <p className="mt-2 text-sm text-text-main">{pendingAction.summary}</p>
                        {pendingAction.expiresInSeconds && (
                            <p className="mt-2 text-xs text-text-muted">
                                Approval token expires in about {Math.max(1, Math.floor(pendingAction.expiresInSeconds / 60))} minute(s).
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="action-reason" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                            Reason (optional)
                        </label>
                        <textarea
                            id="action-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-main outline-none focus:border-accent-cyan focus:ring-2 focus:ring-accent-cyan/20"
                            placeholder="Add approval or rejection context"
                        />
                    </div>

                    <div className="flex justify-end gap-2 border-t border-border pt-3">
                        <Button variant="secondary" onClick={handleReject} loading={submitting}>
                            Reject
                        </Button>
                        <Button variant="primary" onClick={handleApprove} loading={submitting}>
                            Approve
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
