import { useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface MessageComposerProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    disabled: boolean;
}

export function MessageComposer({ value, onChange, onSend, disabled }: MessageComposerProps) {
    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
        }
    }, [onSend]);

    return (
        <div className="border-t border-border/60 bg-surface/85 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm md:px-5">
            <div className="mx-auto" style={{ maxWidth: 'clamp(320px, 72vw, 980px)' }}>
                <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm">
                    <textarea
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask anything about your accessible documents"
                        disabled={disabled}
                        rows={1}
                        className="max-h-40 min-h-[44px] flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm text-text-main outline-none placeholder:text-text-muted"
                    />
                    <Button
                        onClick={onSend}
                        variant="primary"
                        size="md"
                        disabled={disabled || !value.trim()}
                        icon={disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    >
                        Send
                    </Button>
                </div>
                <p className="mt-2 text-center text-[11px] text-text-muted">
                    Responses are grounded in your permitted documents and may require verification.
                </p>
            </div>
        </div>
    );
}
