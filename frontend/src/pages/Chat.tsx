import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Search, Bot, MessageSquare, Trash2, Edit2, Folder, FolderPlus, MoreVertical, X, ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useAuthStore } from '../store/auth.store';
import { ragService } from '../services/rag.service';
import type { ChatSession, ChatMessage, ChatFolder } from '../services/rag.service';

interface EditingState {
    id: string;
    type: 'session' | 'folder';
    value: string;
}

export const Chat: React.FC = () => {
    const { user } = useAuthStore();
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [folders, setFolders] = useState<ChatFolder[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    // UI States
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [editing, setEditing] = useState<EditingState | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const isCreatingRef = useRef<boolean>(false);

    useEffect(() => {
        loadData();
        const handleClickOutside = (e: MouseEvent) => {
            if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
                setActiveMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (activeSessionId) {
            if (!isCreatingRef.current) {
                loadMessages(activeSessionId);
            } else {
                // Reset standard fetching guard after lazy initialization
                isCreatingRef.current = false;
            }
        } else {
            setMessages([]);
        }
    }, [activeSessionId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const loadData = async () => {
        try {
            const [fetchedFolders, fetchedSessions] = await Promise.all([
                ragService.getFolders(),
                ragService.getSessions()
            ]);
            setFolders(fetchedFolders);
            setSessions(fetchedSessions);

            // Expand all folders by default initially
            if (expandedFolders.size === 0 && fetchedFolders.length > 0) {
                setExpandedFolders(new Set(fetchedFolders.map(f => f.id)));
            }

            if (fetchedSessions.length > 0 && !activeSessionId) {
                // Don't auto-select if there are no sessions, allow empty state
                setActiveSessionId(fetchedSessions[0].id);
            }
        } catch (error) {
            console.error('Failed to load chat data:', error);
        }
    };

    const loadMessages = async (sessionId: string) => {
        setLoading(true);
        try {
            const data = await ragService.getMessages(sessionId);
            setMessages(data);
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            setLoading(false);
        }
    };

    // --- Actions: New ---
    const handleNewChat = async () => {
        try {
            setActiveSessionId(null);
            setMessages([]);
        } catch (error) {
            console.error('Failed to prepare new chat:', error);
        }
    };

    const handleNewFolder = async () => {
        try {
            const newFolder = await ragService.createFolder("New Folder");
            setFolders([newFolder, ...folders]);
            setExpandedFolders(prev => new Set(prev).add(newFolder.id));
            setEditing({ id: newFolder.id, type: 'folder', value: newFolder.name });
        } catch (error) {
            console.error('Failed to create folder:', error);
        }
    };

    // --- Actions: Rename ---
    const submitRename = async () => {
        if (!editing || !editing.value.trim()) {
            setEditing(null);
            return;
        }

        try {
            if (editing.type === 'session') {
                const updated = await ragService.renameSession(editing.id, editing.value.trim());
                setSessions(sessions.map(s => s.id === updated.id ? updated : s));
            } else {
                const updated = await ragService.renameFolder(editing.id, editing.value.trim());
                setFolders(folders.map(f => f.id === updated.id ? updated : f));
            }
        } catch (error) {
            console.error('Failed to rename:', error);
        } finally {
            setEditing(null);
        }
    };

    // --- Actions: Delete ---
    const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this chat?')) return;

        try {
            await ragService.deleteSession(id);
            setSessions(sessions.filter(s => s.id !== id));
            if (activeSessionId === id) {
                setActiveSessionId(null);
            }
            setActiveMenuId(null);
        } catch (error) {
            console.error('Failed to delete session:', error);
        }
    };

    const handleDeleteFolder = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!window.confirm('Delete this folder? (Chats inside will be kept)')) return;

        try {
            await ragService.deleteFolder(id);
            setFolders(folders.filter(f => f.id !== id));
            // Sessions natively lose folder_id via backend SET_NULL
            setSessions(sessions.map(s => s.folder === id ? { ...s, folder: null } : s));
            setActiveMenuId(null);
        } catch (error) {
            console.error('Failed to delete folder:', error);
        }
    };

    // --- Actions: Move ---
    const handleMoveToFolder = async (e: React.MouseEvent, sessionId: string, folderId: string | null) => {
        e.stopPropagation();
        try {
            const updated = await ragService.updateSessionFolder(sessionId, folderId);
            setSessions(sessions.map(s => s.id === updated.id ? updated : s));
            if (folderId) setExpandedFolders(prev => new Set(prev).add(folderId));
            setActiveMenuId(null);
        } catch (error) {
            console.error('Failed to move session:', error);
        }
    };

    // --- Actions: Chat Send ---
    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const question = input.trim();
        setInput('');

        let currentSessionId = activeSessionId;

        // If no active session, we must create one FIRST before sending.
        // This makes the "New Chat" button fully state-driven.
        if (!currentSessionId) {
            try {
                const snippetTitle = question.length > 30 ? question.substring(0, 30) + '...' : question;
                const newSession = await ragService.createSession(snippetTitle);
                isCreatingRef.current = true;
                setSessions([newSession, ...sessions]);
                currentSessionId = newSession.id;
                setActiveSessionId(newSession.id);
            } catch (error) {
                console.error("Failed to lazily create session for new chat", error);
                alert("Failed to create a new chat session. Please try again.");
                return;
            }
        }

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            session: currentSessionId,
            role: 'user',
            content: question,
            created_at: new Date()
        };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        const aiMsgId = (Date.now() + 1).toString();

        setMessages(prev => [...prev, {
            id: aiMsgId,
            session: currentSessionId!,
            role: 'assistant',
            content: '',
            created_at: new Date()
        }]);

        await ragService.queryStream(
            question,
            currentSessionId,
            (chunk) => {
                setMessages(prev => prev.map(msg =>
                    msg.id === aiMsgId
                        ? { ...msg, content: msg.content + chunk }
                        : msg
                ));
            },
            (sources) => {
                setMessages(prev => prev.map(msg =>
                    msg.id === aiMsgId
                        ? { ...msg, sources }
                        : msg
                ));
            },
            () => {
                setLoading(false);
                ragService.getSessions().then(setSessions); // Refetch to update snippet/order
            },
            (errorMsg) => {
                setMessages(prev => prev.map(msg =>
                    msg.id === aiMsgId
                        ? { ...msg, content: msg.content + `\n\n**Error:** ${errorMsg}` }
                        : msg
                ));
                setLoading(false);
            }
        );
    };

    // --- Render Helpers ---
    const toggleFolder = (folderId: string) => {
        const next = new Set(expandedFolders);
        if (next.has(folderId)) next.delete(folderId);
        else next.add(folderId);
        setExpandedFolders(next);
    };

    const renderSessionNode = (session: ChatSession, isIndented = false) => {
        const isActive = activeSessionId === session.id;
        const isEditingThis = editing?.id === session.id;

        return (
            <div
                key={session.id}
                onClick={() => !isEditingThis && setActiveSessionId(session.id)}
                className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-100 text-gray-700'
                    } ${isIndented ? 'ml-4 border-l-2 border-gray-100 rounded-l-none' : ''}`}
            >
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                    {isIndented ? (
                        <CornerDownRight className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-brand-500' : 'text-gray-300'}`} />
                    ) : (
                        <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-brand-600' : 'text-gray-400'}`} />
                    )}

                    {isEditingThis ? (
                        <div className="flex-1 flex items-center gap-1">
                            <input
                                autoFocus
                                value={editing.value}
                                onChange={e => setEditing({ ...editing, value: e.target.value })}
                                onKeyDown={e => e.key === 'Enter' && submitRename()}
                                onBlur={submitRename}
                                className="w-full text-sm bg-white border border-brand-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-brand-500"
                            />
                        </div>
                    ) : (
                        <div className="truncate flex-1 pr-6">
                            <p className="font-medium text-sm truncate">{session.title}</p>
                            {session.latest_message && (
                                <p className="text-xs text-brand-600/70 truncate opacity-70">
                                    {session.latest_message.content}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {!isEditingThis && (
                    <div className={`absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-transparent ${isActive ? 'bg-brand-50' : 'group-hover:bg-gray-100'}`}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === session.id ? null : session.id); }}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {activeMenuId === session.id && (
                            <div className="absolute right-0 top-6 w-48 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setEditing({ id: session.id, type: 'session', value: session.title }); setActiveMenuId(null); }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <Edit2 className="w-4 h-4" /> Rename Chat
                                </button>

                                {folders.length > 0 && (
                                    <>
                                        <div className="border-t border-gray-100 my-1"></div>
                                        <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Move to Folder</div>
                                        {session.folder && (
                                            <button
                                                onClick={(e) => handleMoveToFolder(e, session.id, null)}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                            >
                                                <X className="w-4 h-4 text-gray-400" /> Remove from folder
                                            </button>
                                        )}
                                        {folders.map(f => (
                                            <button
                                                key={f.id}
                                                onClick={(e) => handleMoveToFolder(e, session.id, f.id)}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                            >
                                                <Folder className="w-4 h-4 text-blue-400" /> <span className="truncate">{f.name}</span>
                                            </button>
                                        ))}
                                    </>
                                )}

                                <div className="border-t border-gray-100 my-1"></div>
                                <button
                                    onClick={(e) => handleDeleteSession(e, session.id)}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" /> Delete Chat
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderFolderNode = (folder: ChatFolder) => {
        const isExpanded = expandedFolders.has(folder.id);
        const folderSessions = sessions.filter(s => s.folder === folder.id);
        const isEditingThis = editing?.id === folder.id;

        // Skip rendering empty folders if searching
        if (searchQuery && folderSessions.length === 0 && !folder.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return null;
        }

        return (
            <div key={folder.id} className="mb-1">
                <div
                    onClick={() => toggleFolder(folder.id)}
                    className="group flex items-center justify-between px-2 py-2 rounded-md hover:bg-gray-100 cursor-pointer text-gray-700 relative"
                >
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        <Folder className="w-4 h-4 text-blue-500 fill-blue-100" />

                        {isEditingThis ? (
                            <input
                                autoFocus
                                value={editing.value}
                                onChange={e => setEditing({ ...editing, value: e.target.value })}
                                onKeyDown={e => e.key === 'Enter' && submitRename()}
                                onBlur={submitRename}
                                onClick={e => e.stopPropagation()}
                                className="w-full text-sm font-semibold bg-white border border-brand-300 rounded px-1.5 outline-none"
                            />
                        ) : (
                            <span className="font-semibold text-sm truncate select-none">{folder.name}</span>
                        )}
                    </div>

                    {!isEditingThis && (
                        <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-gray-100">
                            <button
                                onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === folder.id ? null : folder.id); }}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>

                            {activeMenuId === folder.id && (
                                <div className="absolute right-0 top-6 w-40 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditing({ id: folder.id, type: 'folder', value: folder.name }); setActiveMenuId(null); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                    >
                                        <Edit2 className="w-4 h-4" /> Rename Folder
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteFolder(e, folder.id)}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                    >
                                        <Trash2 className="w-4 h-4" /> Delete Folder
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {isExpanded && (
                    <div className="mt-1">
                        {folderSessions.length > 0 ? (
                            folderSessions
                                .filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map(s => renderSessionNode(s, true))
                        ) : (
                            <div className="ml-8 text-xs text-gray-400 italic py-1">Empty folder</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Filter lists
    const ungroupedSessions = sessions.filter(s => !s.folder && s.title.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="h-[calc(100vh-8rem)] flex gap-6 animate-fade-in">
            {/* Conversation List Sidebar */}
            <div ref={sidebarRef} className="w-80 hidden lg:flex">
                <Card className="w-full flex flex-col">
                    <div className="p-4 border-b border-gray-200 flex gap-2">
                        <Button onClick={handleNewChat} variant="primary" className="flex-1" icon={<Plus className="w-4 h-4" />}>
                            New Chat
                        </Button>
                        <Button onClick={handleNewFolder} variant="secondary" className="px-3" title="New Folder">
                            <FolderPlus className="w-4 h-4 text-gray-600" />
                        </Button>
                    </div>

                    <div className="p-3 border-b border-gray-200">
                        <Input
                            placeholder="Search chats & folders..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            leftIcon={<Search className="w-4 h-4" />}
                            className="text-sm"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-3">
                        <div className="space-y-3">
                            {/* Folders */}
                            {folders.length > 0 && (
                                <div>
                                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Folders</div>
                                    {folders.map(renderFolderNode)}
                                </div>
                            )}

                            {/* Ungrouped Sessions */}
                            {ungroupedSessions.length > 0 && (
                                <div>
                                    {folders.length > 0 && <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2 px-2">Chats</div>}
                                    <div className="space-y-1">
                                        {ungroupedSessions.map(s => renderSessionNode(s, false))}
                                    </div>
                                </div>
                            )}

                            {sessions.length === 0 && folders.length === 0 && !searchQuery && (
                                <div className="text-center p-6 text-gray-400 text-sm">
                                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    No chats yet.<br />Start a new conversation!
                                </div>
                            )}
                            {searchQuery && ungroupedSessions.length === 0 && !folders.some(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())) && (
                                <div className="text-center p-6 text-gray-400 text-sm">
                                    No matches found.
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Chat Area */}
            <Card className="flex-1 flex flex-col relative z-0">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.length === 0 && !loading && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <Bot className="w-12 h-12 mb-4 opacity-50 text-brand-500" />
                            <h3 className="text-lg font-medium text-gray-800 mb-2">How can I help you today?</h3>
                            <p className="text-sm">Ask a question about any of your uploaded documents.</p>
                        </div>
                    )}

                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {message.role === 'assistant' && (
                                <div className="w-8 h-8 mt-1 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                            )}

                            <div className={`max-w-3xl ${message.role === 'user' ? 'order-first' : ''}`}>
                                <div
                                    className={`rounded-2xl px-5 py-4 ${message.role === 'user'
                                        ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-md'
                                        : 'bg-white border border-gray-100 shadow-sm text-gray-800'
                                        }`}
                                >
                                    <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                                        {message.content === '' && message.role === 'assistant' ? (
                                            <span className="flex items-center gap-2 text-gray-400">
                                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                                            </span>
                                        ) : (
                                            message.content
                                        )}
                                    </div>
                                </div>

                                {message.sources && message.sources.length > 0 && (
                                    <div className="mt-2.5 p-3.5 bg-gray-50 border border-gray-100 rounded-xl">
                                        <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-2">Sources Referenced</p>
                                        <div className="grid grid-cols-1 gap-2">
                                            {message.sources.map((source, idx) => (
                                                <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-gray-200">
                                                    <span className="text-xs font-medium text-gray-700 truncate">{source.title}</span>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                                                        {(source.relevance_score * 100).toFixed(0)}% MATCH
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {message.role === 'user' && (
                                <Avatar
                                    name={`${user?.first_name} ${user?.last_name}`}
                                    size="sm"
                                    className="mt-1 shadow-sm"
                                />
                            )}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Bar */}
                <div className="p-4 border-t border-gray-200 bg-gray-50/50 rounded-b-xl">
                    <div className="flex gap-2 relative max-w-4xl mx-auto">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Message AI Assistant..."
                            className="flex-1 px-5 py-3.5 pr-24 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent shadow-sm text-sm"
                            disabled={loading}
                        />
                        <div className="absolute right-2 top-2">
                            <Button
                                onClick={handleSend}
                                variant="primary"
                                size="md"
                                icon={<Send className="w-4 h-4 ml-1" />}
                                loading={loading}
                                disabled={!input.trim()}
                                className="rounded-lg shadow-md"
                            >
                                Send
                            </Button>
                        </div>
                    </div>
                    <p className="text-center text-[11px] text-gray-400 mt-3 hidden md:block">
                        AI can make mistakes. Verify critical information using the provided source citations.
                    </p>
                </div>
            </Card>
        </div>
    );
};
