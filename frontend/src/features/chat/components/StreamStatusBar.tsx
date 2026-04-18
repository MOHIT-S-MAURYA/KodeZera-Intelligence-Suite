import { Loader2, AlertCircle, CheckCircle2, Activity } from 'lucide-react';
import type { RAGMetadata } from '../../../services/rag.service';
import type { ChatStreamStatus } from '../types';

interface StreamStatusBarProps {
    status: ChatStreamStatus;
    metadata: RAGMetadata | null;
}

function statusLabel(status: ChatStreamStatus): string {
    switch (status) {
        case 'connecting':
            return 'Connecting stream';
        case 'streaming':
            return 'Generating response';
        case 'awaiting_action':
            return 'Awaiting approval';
        case 'completed':
            return 'Response completed';
        case 'error':
            return 'Stream error';
        case 'idle':
        default:
            return 'Ready';
    }
}

export function StreamStatusBar({ status, metadata }: StreamStatusBarProps) {
    const chunkLabel = metadata ? `${metadata.num_chunks} chunks` : 'No retrieval yet';
    const confidenceLabel = metadata?.average_confidence || 'n/a';

    return (
        <div className="mx-auto flex w-full items-center justify-between" style={{ maxWidth: 'clamp(320px, 72vw, 980px)' }}>
            <div className="flex items-center gap-2 text-xs text-text-muted">
                {status === 'connecting' || status === 'streaming' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-cyan" />
                ) : status === 'awaiting_action' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-accent-orange" />
                ) : status === 'completed' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />
                ) : status === 'error' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-accent-red" />
                ) : (
                    <Activity className="h-3.5 w-3.5 text-text-muted" />
                )}
                <span className="font-medium">{statusLabel(status)}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted">
                <span>{chunkLabel}</span>
                <span className="capitalize">Confidence: {confidenceLabel}</span>
            </div>
        </div>
    );
}
