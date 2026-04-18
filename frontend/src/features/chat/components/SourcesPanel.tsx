import type { RAGSource } from '../../../services/rag.service';

interface SourcesPanelProps {
    sources: RAGSource[];
}

export function SourcesPanel({ sources }: SourcesPanelProps) {
    if (!sources.length) return null;

    return (
        <div className="mt-2 rounded-xl border border-border bg-surface-hover/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Sources</p>
            <div className="space-y-1">
                {sources.map((source) => (
                    <div key={source.document_id} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-2.5 py-1.5">
                        <span className="truncate text-xs text-text-main">{source.title}</span>
                        <span className="shrink-0 rounded-full bg-accent-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-accent-cyan">
                            {(source.relevance_score * 100).toFixed(0)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
