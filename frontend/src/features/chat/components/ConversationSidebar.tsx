import { useMemo, useState } from 'react';
import { FolderOpen, MessageSquare, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { ChatFolder, ChatSession } from '../../../services/rag.service';

interface ConversationSidebarProps {
    sessions: ChatSession[];
    folders: ChatFolder[];
    activeSessionId: string | null;
    loading: boolean;
    onSelectSession: (sessionId: string) => void;
    onNewChat: () => void;
    onRefresh: () => void;
}

export function ConversationSidebar({
    sessions,
    folders,
    activeSessionId,
    loading,
    onSelectSession,
    onNewChat,
    onRefresh,
}: ConversationSidebarProps) {
    const [search, setSearch] = useState('');

    const { filteredSessions, ungroupedSessions, groupedByFolder } = useMemo(() => {
        const query = search.trim().toLowerCase();
        const filtered = query
            ? sessions.filter((item) => item.title.toLowerCase().includes(query))
            : sessions;

        const grouped = new Map<string, ChatSession[]>();
        filtered.forEach((session) => {
            if (!session.folder) return;
            const list = grouped.get(session.folder) || [];
            list.push(session);
            grouped.set(session.folder, list);
        });

        return {
            filteredSessions: filtered,
            ungroupedSessions: filtered.filter((item) => !item.folder),
            groupedByFolder: grouped,
        };
    }, [search, sessions]);

    return (
        <div className="flex h-full flex-col">
            <div className="space-y-2 border-b border-border/60 p-3">
                <div className="flex items-center gap-2">
                    <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={onNewChat}
                    >
                        New Chat
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="px-3"
                        icon={<RefreshCw className="h-4 w-4" />}
                        onClick={onRefresh}
                    >
                        Refresh
                    </Button>
                </div>
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    leftIcon={<Search className="h-4 w-4" />}
                    placeholder="Search conversations"
                    className="h-10"
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {loading ? (
                    <div className="space-y-2 p-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="h-11 animate-pulse rounded-lg bg-surface-hover" />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {folders.map((folder) => {
                            const folderSessions = groupedByFolder.get(folder.id) || [];
                            if (search && folderSessions.length === 0 && !folder.name.toLowerCase().includes(search.trim().toLowerCase())) {
                                return null;
                            }

                            return (
                                <section key={folder.id} className="space-y-1">
                                    <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                                        <FolderOpen className="h-3.5 w-3.5" />
                                        <span className="truncate">{folder.name}</span>
                                        <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px]">{folderSessions.length}</span>
                                    </div>
                                    {folderSessions.map((session) => (
                                        <button
                                            key={session.id}
                                            onClick={() => onSelectSession(session.id)}
                                            className={[
                                                'w-full rounded-xl px-3 py-2 text-left transition-colors',
                                                activeSessionId === session.id
                                                    ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/25'
                                                    : 'border border-transparent text-text-main hover:bg-surface-hover',
                                            ].join(' ')}
                                        >
                                            <p className="truncate text-sm font-medium">{session.title}</p>
                                            {session.latest_message && (
                                                <p className="truncate text-xs text-text-muted">{session.latest_message.content}</p>
                                            )}
                                        </button>
                                    ))}
                                </section>
                            );
                        })}

                        {ungroupedSessions.length > 0 && (
                            <section className="space-y-1">
                                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                                    Ungrouped
                                </div>
                                {ungroupedSessions.map((session) => (
                                    <button
                                        key={session.id}
                                        onClick={() => onSelectSession(session.id)}
                                        className={[
                                            'w-full rounded-xl px-3 py-2 text-left transition-colors',
                                            activeSessionId === session.id
                                                ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/25'
                                                : 'border border-transparent text-text-main hover:bg-surface-hover',
                                        ].join(' ')}
                                    >
                                        <p className="truncate text-sm font-medium">{session.title}</p>
                                        {session.latest_message && (
                                            <p className="truncate text-xs text-text-muted">{session.latest_message.content}</p>
                                        )}
                                    </button>
                                ))}
                            </section>
                        )}

                        {filteredSessions.length === 0 && (
                            <div className="flex flex-col items-center gap-2 py-12 text-center text-text-muted">
                                <MessageSquare className="h-8 w-8 opacity-40" />
                                <p className="text-sm">No matching conversations</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
