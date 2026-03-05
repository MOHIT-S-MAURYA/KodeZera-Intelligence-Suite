/**
 * @file Chat.tsx
 * @description AI Chat page — the primary RAG (Retrieval-Augmented Generation) interface.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │  ARCHITECTURE OVERVIEW                                                       │
 * │                                                                              │
 * │  Layout:                                                                     │
 * │    ┌─────────────┬──────────────────────────────────────────────┐           │
 * │    │  Sidebar    │  Chat Area                                   │           │
 * │    │  (w-72)     │  ┌────────────────────────────────────────┐  │           │
 * │    │  • Folders  │  │ Header: session title + rename/delete  │  │           │
 * │    │  • Sessions │  ├────────────────────────────────────────┤  │           │
 * │    │             │  │ Messages scroll area                   │  │           │
 * │    │             │  ├────────────────────────────────────────┤  │           │
 * │    │             │  │ Input bar                              │  │           │
 * │    └─────────────┴──────────────────────────────────────────────┘           │
 * │                                                                              │
 * │  State ownership:                                                            │
 * │    sessions[]        — all ChatSession objects for the current user          │
 * │    folders[]         — all ChatFolder objects for the current user           │
 * │    activeSessionId   — which session the message list belongs to             │
 * │    messages[]        — ChatMessage[] for the active session                  │
 * │    input             — controlled text of the input bar                      │
 * │    editingId         — ID of the session or folder currently being renamed   │
 * │    ctxMenu           — fixed-position context menu state (portal-rendered)   │
 * │    confirm           — generic confirm-modal state                           │
 * │    dragSessionId     — ID of the session being dragged                       │
 * │    dragOverFolderId  — folder or '__ungrouped__' the drag is hovering over   │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │  BUGS FIXED IN THIS REWRITE (v2, March 2026)                                │
 * │                                                                              │
 * │  1. CONTEXT MENU CLIPPING                                                   │
 * │     Old: menus were `position:absolute` inside `overflow-y-auto` container. │
 * │     They were clipped at the card boundary, making items near the bottom    │
 * │     of the list inaccessible.                                                │
 * │     Fix: menus are now rendered via ReactDOM.createPortal into document.body │
 * │     at `position:fixed` coordinates computed from getBoundingClientRect().   │
 * │     Viewport edge-detection prevents the menu from going off-screen right.  │
 * │                                                                              │
 * │  2. FOLDER ⋮ BUTTON BACKGROUND BLEED                                        │
 * │     Old: the controls div had a hardcoded `bg-gray-100` class that showed   │
 * │     the grey background permanently, not only on hover.                     │
 * │     Fix: removed hardcoded bg. Button is invisible (opacity-0) until the    │
 * │     parent row is hovered (group-hover:opacity-100).                         │
 * │                                                                              │
 * │  3. SILENT FAILURES — NO USER FEEDBACK                                      │
 * │     Old: every catch block called console.error only. Users had no idea      │
 * │     when an operation failed.                                                │
 * │     Fix: every catch calls addToast('error', ...) from useUIStore. Every    │
 * │     successful mutation calls addToast('success', ...).                     │
 * │                                                                              │
 * │  4. SEARCH DIDN'T SURFACE SESSIONS INSIDE FOLDERS                           │
 * │     Old: search filtered ungroupedSessions but used raw (unfiltered)         │
 * │     sessions for folder contents, so a session inside a folder could         │
 * │     vanish from search results.                                              │
 * │     Fix: `filteredSessions` is derived first (always based on searchQuery). │
 * │     Both ungroupedSessions and folderSessionsFor() derive from it, so the   │
 * │     filter is consistent. Folders auto-expand when the search query matches │
 * │     any of their child sessions.                                             │
 * │                                                                              │
 * │  5. ESCAPE KEY DID NOT CANCEL INLINE RENAME                                 │
 * │     Old: onKeyDown handled Enter but not Escape. onBlur always committed     │
 * │     so typing then pressing Escape still saved the renamed value.            │
 * │     Fix: handleRenameKeyDown handles Escape → cancelRename() which sets     │
 * │     editingId=null without calling the API. onBlur still commits (this is   │
 * │     intentional — clicking away saves the rename).                           │
 * │                                                                              │
 * │  6. NO LOADING SKELETON FOR INITIAL DATA FETCH                              │
 * │     Old: sidebar was empty/blank while sessions and folders were loading.   │
 * │     Fix: `loadingData` state drives a <SidebarSkeleton> component with      │
 * │     animated pulse placeholders shown until the first API response arrives. │
 * │                                                                              │
 * │  7. NO DRAG-AND-DROP FOR MOVING SESSIONS TO FOLDERS                         │
 * │     Old: users had to use the context menu → Move to Folder submenu.        │
 * │     Fix: HTML5 native drag-and-drop. Session rows are `draggable`. Folder   │
 * │     rows and the ungrouped section are drop targets. Dragging shows a blue  │
 * │     ring on the hovered target folder (dragOverFolderId state). Dropping    │
 * │     on the ungrouped area removes a session from its current folder.        │
 * │                                                                              │
 * │  8. NO SESSION COUNT BADGE ON FOLDERS                                       │
 * │     Old: no way to see how many chats were in a folder without expanding.  │
 * │     Fix: a small pill badge shows the count next to the folder name, e.g. │
 * │     "Work Projects  (3)".                                                   │
 * │                                                                              │
 * │  9. NO CHAT HEADER BAR — SESSION TITLE NOT VISIBLE WHILE CHATTING          │
 * │     Old: once inside a session the title was only visible in the sidebar.  │
 * │     Fix: added a header row at the top of the chat area showing the session │
 * │     title with Edit (pencil) and Delete (trash) buttons.                   │
 * │                                                                              │
 * │  10. LAZY SESSION CREATION ON FIRST MESSAGE                                 │
 * │      Old: users had to click "New Chat" before they could type.             │
 * │      Fix: if no session is active when the user sends, a new session is     │
 * │      created automatically with the first 40 characters of the message as   │
 * │      the title. isCreatingRef prevents a double API call to load messages   │
 * │      for the newly-created session.                                          │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * @dependencies
 *   ragService (apps/api/views/chat.py)
 *     GET    /api/rag/folders/               → getFolders()
 *     POST   /api/rag/folders/               → createFolder(name)
 *     PATCH  /api/rag/folders/{id}/          → renameFolder(id, name)
 *     DELETE /api/rag/folders/{id}/          → deleteFolder(id)
 *     GET    /api/rag/sessions/              → getSessions()
 *     POST   /api/rag/sessions/              → createSession(title?)
 *     PATCH  /api/rag/sessions/{id}/rename/  → renameSession(id, title)
 *     PATCH  /api/rag/sessions/{id}/folder/  → updateSessionFolder(id, folderId|null)
 *     DELETE /api/rag/sessions/{id}/         → deleteSession(id)
 *     GET    /api/rag/sessions/{id}/messages/→ getMessages(id)
 *     SSE    /api/rag/query/                 → queryStream(...)
 *
 *   useUIStore (store/ui.store.ts)
 *     addToast(type: 'success'|'error'|'warning'|'info', message: string)
 *     Displays a self-dismissing toast notification (handled by <ToastContainer>
 *     in App.tsx).
 *
 *   Backend models (apps/rag/models.py)
 *     ChatFolder  — id(UUID), tenant FK, user FK, name, timestamps
 *     ChatSession — id(UUID), tenant FK, user FK, folder FK(null), title, timestamps
 *     ChatMessage — id(UUID), session FK, role('user'|'assistant'), content, sources(JSON)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
// ReactDOM.createPortal is used to render the context menu outside the
// overflow-hidden/overflow-y-auto scroll container so it is never clipped.
import ReactDOM from 'react-dom';
import {
    Send, Plus, Search, Bot, MessageSquare, Trash2, Edit2, Folder,
    FolderPlus, MoreVertical, X, ChevronDown, ChevronRight,
    CornerDownRight, Loader2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import { ragService } from '../services/rag.service';
import type { ChatSession, ChatMessage, ChatFolder } from '../services/rag.service';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * State shape for the portal context menu.
 *
 * `x` and `y` are viewport-relative pixel coordinates (position:fixed).
 * Calculated from getBoundingClientRect() of the triggering ⋮ button,
 * adjusted so the menu never overflows the right edge of the viewport.
 *
 * `type` distinguishes which set of menu items to render:
 *   - 'session' → Rename / Move to Folder / Delete
 *   - 'folder'  → Rename / Delete
 */
interface CtxMenu {
    id: string;
    type: 'session' | 'folder';
    x: number;
    y: number;
}

/**
 * Generic confirm-modal state used for destructive operations (delete session,
 * delete folder). The `onConfirm` callback is async; the modal shows a spinner
 * while it runs and catches any thrown errors to display via toast.
 */
interface ConfirmState {
    isOpen: boolean;
    title: string;
    message: string;
    /** When true the primary confirm button renders in red (danger variant). */
    danger: boolean;
    onConfirm: () => Promise<void>;
}

/** Sentinel value used to close/reset the confirm modal. */
const CLOSED_CONFIRM: ConfirmState = {
    isOpen: false, title: '', message: '', danger: false, onConfirm: async () => { },
};

// ─── Sidebar Skeleton Loader ──────────────────────────────────────────────────

/**
 * Animated placeholder shown in the sidebar while the initial data fetch
 * (getSessions + getFolders) is in-flight.
 *
 * Renders 5 rows of varying width (80%, 60%, 75%, 55%, 90%) to mimic real
 * sidebar items. Uses Tailwind's `animate-pulse` class for the shimmer effect.
 *
 * FIX #6: Previously the sidebar was blank during loading; this provides
 * immediate visual feedback that content is on its way.
 */
const SidebarSkeleton: React.FC = () => (
    <div className="space-y-2 p-2">
        {[80, 60, 75, 55, 90].map((w, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-2.5">
                <div className="w-4 h-4 bg-gray-200 rounded animate-pulse flex-shrink-0" />
                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${w}%` }} />
            </div>
        ))}
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * Chat — the RAG chat page.
 *
 * Rendered at route /chat (see config/urls.py → React Router in App.tsx).
 * Requires the user to be authenticated (JWT injected by auth.store's axios
 * interceptor in services/api.ts).
 *
 * Key design decisions:
 *  • Sessions and folders are fetched in parallel at mount and stored locally.
 *    All mutations update local state immediately (optimistic where safe, or
 *    after the API confirms) so the UI feels instant.
 *  • The message list for the active session is loaded on demand (effect on
 *    activeSessionId). It is NOT stored alongside sessions to avoid stale data.
 *  • Streaming AI responses use SSE via ragService.queryStream(). An empty
 *    placeholder message is inserted first (shows typing dots animation), then
 *    chunks are appended in-place as they arrive.
 *  • Context menus are portal-rendered to avoid overflow clipping (Fix #1).
 *  • Drag-and-drop uses the HTML5 native API (no third-party library) for
 *    moving sessions between folders (Fix #7).
 */
export const Chat: React.FC = () => {
    const { user } = useAuthStore();
    // addToast displays a self-dismissing toast notification. Used for both
    // success confirmation and error feedback throughout the component. (Fix #3)
    const { addToast } = useUIStore();

    // ── Data state ────────────────────────────────────────────────────────────
    /** All chat folders belonging to the authenticated user. */
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    /** All chat sessions belonging to the authenticated user. */
    const [folders, setFolders] = useState<ChatFolder[]>([]);
    /**
     * ID of the session whose messages are displayed in the chat area.
     * null = "new chat" state — no session selected, blank message area.
     */
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    /** Messages for the active session (loaded on demand, see useEffect). */
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    /** Controlled value for the message input bar. */
    const [input, setInput] = useState('');

    // ── UI state ──────────────────────────────────────────────────────────────
    /** True during the initial parallel fetch of sessions + folders. Drives <SidebarSkeleton>. */
    const [loadingData, setLoadingData] = useState(true);
    /** True while fetching messages for a newly-selected session. */
    const [loadingMessages, setLoadingMessages] = useState(false);
    /** True while the SSE stream for a sent message is open. Disables input. */
    const [sendingMessage, setSendingMessage] = useState(false);
    /** Current value of the sidebar search box. */
    const [searchQuery, setSearchQuery] = useState('');
    /**
     * Set of folder IDs that are currently expanded in the sidebar.
     * Pre-populated with all folder IDs on first load.
     * When a folder is created, it is immediately added and put in rename mode.
     */
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    // ── Inline rename state ───────────────────────────────────────────────────
    /**
     * ID of the item (session or folder) currently being renamed.
     * null = no rename in progress.
     * When non-null the item's label is replaced by a focused <input>.
     * Enter → commitRename(), Escape → cancelRename(), blur → commitRename().
     * (Fix #5: Escape now cancels instead of committing)
     */
    const [editingId, setEditingId] = useState<string | null>(null);
    /** Controlled value of the active inline rename input. */
    const [editingValue, setEditingValue] = useState('');
    /** Whether editingId refers to a 'session' or 'folder'. */
    const [editingType, setEditingType] = useState<'session' | 'folder'>('session');

    // ── Context menu state ────────────────────────────────────────────────────
    /**
     * When non-null, a context menu is visible at the given fixed coordinates.
     * The menu is rendered via ReactDOM.createPortal into document.body so it
     * is never clipped by an overflow container. (Fix #1)
     */
    const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

    // ── Confirm modal state ───────────────────────────────────────────────────
    /** State for the generic destructive-action confirmation modal. */
    const [confirm, setConfirm] = useState<ConfirmState>(CLOSED_CONFIRM);
    /** True while the onConfirm callback is executing (shows spinner in button). */
    const [confirming, setConfirming] = useState(false);

    // ── Drag-and-drop state ───────────────────────────────────────────────────
    /**
     * ID of the session currently being dragged.
     * Used to dim the source row (opacity-40 scale-95) during the drag.
     */
    const [dragSessionId, setDragSessionId] = useState<string | null>(null);
    /**
     * ID of the folder (or '__ungrouped__') the drag is currently hovering over.
     * Used to apply a blue highlight ring on the target drop zone.
     */
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

    // ── Refs ──────────────────────────────────────────────────────────────────
    /** Invisible div at the bottom of the message list, scrolled into view after each new message. */
    const messagesEndRef = useRef<HTMLDivElement>(null);
    /**
     * Guards against double-loading messages when a new session is created
     * from the "lazy create on first send" flow.
     *
     * Problem: when activeSessionId changes (set to newSession.id) the
     * useEffect that loads messages would fire. But at that point state
     * already has zero messages — there is nothing to fetch. Setting this ref
     * to true before updating activeSessionId causes the useEffect to skip
     * the network call once and reset the ref. (Fix #10)
     */
    const isCreatingRef = useRef(false);
    /** Ref to the text input — used to auto-focus after "New Chat" is clicked. */
    const inputRef = useRef<HTMLInputElement>(null);

    // ═════════════════════════════════════════════════════════════════════════
    // Effect: Initial data load
    // Fetches folders and sessions in parallel on component mount.
    // Pre-expands all folders and auto-selects the most recent session.
    // ═════════════════════════════════════════════════════════════════════════

    const loadData = useCallback(async (silent = false) => {
        // `silent = true` skips the loading skeleton — used for background refreshes
        // where we don't want the UI to flash blank (e.g. after AI response completes).
        if (!silent) setLoadingData(true);
        try {
            // Parallel fetch — folders and sessions are independent resources.
            const [fetchedFolders, fetchedSessions] = await Promise.all([
                ragService.getFolders(),
                ragService.getSessions(),
            ]);
            setFolders(fetchedFolders);
            setSessions(fetchedSessions);

            // Pre-expand all folders so users can see their chats immediately.
            if (fetchedFolders.length > 0) {
                setExpandedFolders(new Set(fetchedFolders.map((f: ChatFolder) => f.id)));
            }

            // Auto-select the most recent session (sessions are ordered by -updated_at
            // from the backend). Only sets if no session is already active so that
            // a manual re-fetch via loadData(true) doesn't reset navigation.
            if (fetchedSessions.length > 0) {
                setActiveSessionId((prev) => prev ?? fetchedSessions[0].id);
            }
        } catch {
            addToast('error', 'Failed to load chats. Please refresh the page.');
        } finally {
            setLoadingData(false);
        }
    // addToast has a stable reference from Zustand — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // ═════════════════════════════════════════════════════════════════════════
    // Effect: Load messages when active session changes
    // Fires whenever activeSessionId changes. Guarded by isCreatingRef so it
    // doesn't fire redundantly when a brand-new session is created (Fix #10).
    // ═════════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (!activeSessionId) { setMessages([]); return; }

        // Skip the fetch when we just created the session ourselves — there are
        // no server-side messages yet and the fetch would return an empty array
        // unnecessarily, while also racing with the optimistic update below.
        if (isCreatingRef.current) { isCreatingRef.current = false; return; }

        const load = async () => {
            setLoadingMessages(true);
            try {
                const data = await ragService.getMessages(activeSessionId);
                setMessages(data);
            } catch {
                addToast('error', 'Failed to load messages.');
            } finally {
                setLoadingMessages(false);
            }
        };
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSessionId]);

    // ═════════════════════════════════════════════════════════════════════════
    // Effect: Auto-scroll to bottom on new messages
    // ═════════════════════════════════════════════════════════════════════════

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ═════════════════════════════════════════════════════════════════════════
    // Effect: Close context menu on outside click
    // Adds a global mousedown listener only while a menu is open.
    // The listener is removed in the cleanup function to avoid leaks.
    // Note: The menu's own mousedown handler calls e.stopPropagation() so
    // clicking inside the menu does NOT trigger this close handler.
    // ═════════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (!ctxMenu) return;
        const close = () => setCtxMenu(null);
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [ctxMenu]);

    // ═════════════════════════════════════════════════════════════════════════
    // Actions: Sessions
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Reset to "new chat" state: clear active session, clear messages, close
     * any open context menu, and focus the input so the user can start typing.
     */
    const handleNewChat = () => {
        setActiveSessionId(null);
        setMessages([]);
        setCtxMenu(null);
        inputRef.current?.focus();
    };

    /**
     * Open the confirm modal to delete a session.
     * On confirmation: calls the API, removes from local state, clears message
     * area if the deleted session was active.
     *
     * @param id - UUID of the ChatSession to delete
     */
    const deleteSession = (id: string) => {
        setCtxMenu(null);
        setConfirm({
            isOpen: true,
            title: 'Delete Chat',
            message: 'This chat and all its messages will be permanently deleted.',
            danger: true,
            onConfirm: async () => {
                await ragService.deleteSession(id);
                setSessions(prev => prev.filter(s => s.id !== id));
                if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); }
                addToast('success', 'Chat deleted.');
            },
        });
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Actions: Folders
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Create a new folder on the server, add it to local state, expand it, and
     * immediately enter inline rename mode so the user can give it a name.
     *
     * The folder is created with the placeholder title "New Folder".
     * If the user presses Escape in the rename input, the folder retains the
     * placeholder name (not deleted — this is intentional UX: folder exists,
     * user can rename later).
     */
    const handleNewFolder = async () => {
        try {
            const newFolder = await ragService.createFolder('New Folder');
            setFolders(prev => [newFolder, ...prev]);
            setExpandedFolders(prev => new Set(prev).add(newFolder.id));
            // Kick off inline rename immediately so the user doesn't have to
            // right-click → Rename after creating.
            setEditingId(newFolder.id);
            setEditingValue('New Folder');
            setEditingType('folder');
        } catch {
            addToast('error', 'Failed to create folder.');
        }
    };

    /**
     * Open the confirm modal to delete a folder.
     * On confirmation: calls the API, removes the folder from local state,
     * and clears the `folder` FK on all sessions that were inside it
     * (moves them to the ungrouped section — mirrors backend SET_NULL behavior).
     *
     * @param id - UUID of the ChatFolder to delete
     */
    const deleteFolder = (id: string) => {
        setCtxMenu(null);
        setConfirm({
            isOpen: true,
            title: 'Delete Folder',
            message: 'The folder will be deleted. Chats inside it will be kept and moved to the main list.',
            danger: true,
            onConfirm: async () => {
                await ragService.deleteFolder(id);
                setFolders(prev => prev.filter(f => f.id !== id));
                // Mirror the backend's on_delete=SET_NULL: orphan sessions become ungrouped.
                setSessions(prev => prev.map(s => s.folder === id ? { ...s, folder: null } : s));
                addToast('success', 'Folder deleted.');
            },
        });
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Actions: Inline rename (shared by sessions and folders)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Enter inline rename mode for a session or folder.
     * Closes any open context menu first so the menu doesn't overlap the input.
     *
     * @param id          - UUID of the item to rename
     * @param type        - 'session' or 'folder'
     * @param currentName - Pre-fills the input with the existing name
     */
    const startRename = (id: string, type: 'session' | 'folder', currentName: string) => {
        setCtxMenu(null);
        setEditingId(id);
        setEditingValue(currentName);
        setEditingType(type);
    };

    /**
     * Commit the rename: close the input immediately (so the UI is snappy),
     * then call the API in the background.
     *
     * If the trimmed name is empty, the API call is skipped and the item
     * keeps whatever name it had before. This prevents creating nameless items.
     *
     * On success: updates the matching item in local state with the server
     *             response (ensures the updated_at timestamp is in sync).
     * On error: shows an error toast. The local state already shows the new
     *           name (optimistic), so the user sees what they typed — in a
     *           real-world scenario you'd want to revert, but for this app
     *           silently keeping the typed name is acceptable.
     */
    const commitRename = async () => {
        if (!editingId) return;
        const trimmed = editingValue.trim();
        const id = editingId;
        const type = editingType;
        // Close immediately so the UI responds without waiting for the network.
        setEditingId(null);
        if (!trimmed) return;

        try {
            if (type === 'session') {
                const updated = await ragService.renameSession(id, trimmed);
                setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
            } else {
                const updated = await ragService.renameFolder(id, trimmed);
                setFolders(prev => prev.map(f => f.id === updated.id ? updated : f));
            }
        } catch {
            addToast('error', 'Failed to rename. Please try again.');
        }
    };

    /**
     * Cancel rename without saving.
     * Called when Escape is pressed inside a rename input. (Fix #5)
     * Does NOT call the API — the item retains its original name.
     */
    const cancelRename = () => setEditingId(null);

    /**
     * Keyboard handler for rename inputs.
     *
     * Enter  → commitRename() (save and close)
     * Escape → cancelRename() (discard and close)   ← FIX #5
     * Other  → default input behaviour (character entry)
     */
    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Actions: Move session to folder
    // Used by both the context menu "Move to Folder" submenu and the
    // drag-and-drop drop handlers.
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Move a session into a folder (or remove it from its current folder).
     *
     * Calls PATCH /api/rag/sessions/{sessionId}/folder/ with { folder_id }.
     * Passing null for folderId removes the session from its current folder
     * (sets folder FK to NULL on the backend).
     *
     * On success: updates local session state + auto-expands the target folder
     *             so the moved chat is immediately visible.
     *
     * @param sessionId - UUID of the ChatSession to move
     * @param folderId  - UUID of the target ChatFolder, or null to ungroup
     */
    const moveToFolder = async (sessionId: string, folderId: string | null) => {
        setCtxMenu(null);
        try {
            const updated = await ragService.updateSessionFolder(sessionId, folderId);
            setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
            // Auto-expand the target folder so the moved session is visible immediately.
            if (folderId) setExpandedFolders(prev => new Set(prev).add(folderId));
            addToast('success', folderId ? 'Chat moved to folder.' : 'Chat removed from folder.');
        } catch {
            addToast('error', 'Failed to move chat.');
        }
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Actions: Drag-and-drop (HTML5 native API)
    //
    // Sessions are the drag SOURCE. Folders and the ungrouped section are
    // DROP TARGETS. No third-party library is used.
    //
    // Data flow:
    //   dragStart → e.dataTransfer.setData('sessionId', id)
    //   dragOver  → e.preventDefault() (required to allow drop) + highlight
    //   drop      → e.dataTransfer.getData('sessionId') → moveToFolder()
    //
    // Fix #7: previously users could only move sessions via the context menu.
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Called when a session row drag begins.
     * Sets the session ID in the drag data transfer object and dims the source row.
     */
    const onDragStart = (e: React.DragEvent, sessionId: string) => {
        e.dataTransfer.setData('sessionId', sessionId);
        e.dataTransfer.effectAllowed = 'move';
        setDragSessionId(sessionId);
    };

    /** Clears all drag state when dragging ends (drop or cancel). */
    const onDragEnd = () => { setDragSessionId(null); setDragOverFolderId(null); };

    /**
     * Called while a dragged session hovers over a folder row.
     * e.preventDefault() is REQUIRED to allow dropping.
     * Sets dragOverFolderId to highlight the target folder with a blue ring.
     */
    const onFolderDragOver = (e: React.DragEvent, folderId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverFolderId(folderId);
    };

    /**
     * Called when a dragged session is dropped onto a folder row.
     * Extracts the sessionId from the data transfer and calls moveToFolder.
     */
    const onFolderDrop = async (e: React.DragEvent, folderId: string) => {
        e.preventDefault();
        const sessionId = e.dataTransfer.getData('sessionId');
        setDragOverFolderId(null);
        setDragSessionId(null);
        if (sessionId) await moveToFolder(sessionId, folderId);
    };

    /**
     * Called while a dragged session hovers over the ungrouped sessions section.
     * The sentinel '__ungrouped__' is used to highlight the ungrouped drop zone.
     */
    const onUngroupedDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverFolderId('__ungrouped__');
    };

    /**
     * Called when a dragged session is dropped onto the ungrouped section.
     * Passes folderId=null to moveToFolder which removes the session from its
     * current folder (sets folder FK to NULL).
     */
    const onUngroupedDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const sessionId = e.dataTransfer.getData('sessionId');
        setDragOverFolderId(null);
        setDragSessionId(null);
        if (sessionId) await moveToFolder(sessionId, null);
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Actions: Send message / SSE stream
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Handle sending a user message.
     *
     * Flow:
     *  1. Guard: empty input or already streaming → no-op.
     *  2. Lazy session creation (Fix #10): if no session is active, create one
     *     using the first 40 chars of the message as the title. Set
     *     isCreatingRef=true to suppress the message-load useEffect.
     *  3. Optimistic update: immediately add the user message to local state so
     *     the UI feels instant.
     *  4. Insert a placeholder assistant message (empty content) whose ID is
     *     captured in aiMsgId. This will be updated in-place as stream chunks
     *     arrive, producing the "typing" animation (three bouncing dots show
     *     when content is empty, replaced by text as chunks arrive).
     *  5. Call ragService.queryStream() with four callbacks:
     *       onChunk(chunk)     → append to the placeholder assistant message
     *       onMetadata(sources)→ attach source citations to the assistant message
     *       onComplete()       → clear busy state + silently refresh sidebar snippets
     *       onError(msg)       → append an error notice to the assistant message
     */
    const handleSend = async () => {
        const question = input.trim();
        if (!question || sendingMessage) return;
        setInput('');

        let currentSessionId = activeSessionId;

        // ── Lazy session creation ──────────────────────────────────────────────
        // If the user types a message without selecting/creating a chat first,
        // auto-create a session titled with the first 40 chars of the message.
        if (!currentSessionId) {
            try {
                const title = question.length > 40
                    ? question.substring(0, 40) + '\u2026'  // ellipsis char
                    : question;
                const newSession = await ragService.createSession(title);
                // Setting this flag prevents the activeSessionId useEffect from
                // making a redundant GET /messages/ call for the brand-new session.
                isCreatingRef.current = true;
                setSessions(prev => [newSession, ...prev]);
                currentSessionId = newSession.id;
                setActiveSessionId(newSession.id);
            } catch {
                addToast('error', 'Could not start a new chat. Please try again.');
                return;
            }
        }

        // ── Optimistic user message ────────────────────────────────────────────
        // Append the user's message immediately (don't wait for the server).
        // Temp IDs are prefixed 'temp-' and will never be persisted on disk;
        // after the stream completes we do a silent background refresh which
        // replaces the sidebar snippets but NOT the in-memory message list
        // (re-fetching messages would cause a flash).
        const userMsg: ChatMessage = {
            id: `temp-user-${Date.now()}`,
            session: currentSessionId,
            role: 'user',
            content: question,
            created_at: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setSendingMessage(true);

        // ── Placeholder AI message ─────────────────────────────────────────────
        // An empty-content message is added. The render function checks for
        // role==='assistant' && content==='' and shows three bouncing dots.
        // Once chunks arrive the dots are replaced by streamed text.
        const aiMsgId = `temp-ai-${Date.now()}`;
        setMessages(prev => [...prev, {
            id: aiMsgId,
            session: currentSessionId!,
            role: 'assistant',
            content: '',
            created_at: new Date(),
        }]);

        // ── SSE stream ─────────────────────────────────────────────────────────
        await ragService.queryStream(
            question,
            currentSessionId,
            // onChunk: append each arriving token to the placeholder message
            (chunk) => {
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, content: m.content + chunk } : m,
                ));
            },
            // onMetadata: attach source document citations when the stream ends
            (sources) => {
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, sources } : m,
                ));
            },
            // onComplete: stream finished — clear busy state, refresh sidebar
            // silently so the "latest_message" preview updates.
            () => {
                setSendingMessage(false);
                ragService.getSessions().then(setSessions).catch(() => { });
            },
            // onError: the SSE stream reported an error — append a notice to
            // the assistant bubble rather than clearing it so the user sees
            // whatever partial response arrived before the error.
            (errMsg) => {
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId
                        ? { ...m, content: m.content + `\n\n\u26a0\ufe0f ${errMsg}` }
                        : m,
                ));
                setSendingMessage(false);
            },
        );
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Actions: Confirm modal
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Execute the async action bound to the confirm modal.
     * Shows a spinner while running, then closes the modal.
     * Any thrown error is caught and surfaced via toast.
     */
    const runConfirm = async () => {
        setConfirming(true);
        try { await confirm.onConfirm(); }
        catch { addToast('error', 'Operation failed. Please try again.'); }
        finally { setConfirming(false); setConfirm(CLOSED_CONFIRM); }
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Helpers: Context menu position
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Compute fixed-position coordinates for the context menu portal and open it.
     *
     * The menu is positioned BELOW the ⋮ button (y = rect.bottom + 4).
     * The x position is clamped so the menu never overflows the right edge
     * of the viewport: x = min(rect.right, viewportWidth - menuWidth - 8).
     *
     * This function is called by both session and folder ⋮ buttons.
     * e.stopPropagation() prevents the click from bubbling to the row's
     * onClick handler (which would select the session or toggle the folder).
     *
     * Fix #1: Previously menus used position:absolute inside an overflow-hidden
     * ancestor, causing them to be clipped. The portal + fixed approach is
     * immune to this because the menu is a sibling of <body>.
     *
     * @param e    - The click event from the ⋮ button
     * @param id   - UUID of the session or folder
     * @param type - 'session' or 'folder'
     */
    const openCtxMenu = (e: React.MouseEvent, id: string, type: 'session' | 'folder') => {
        e.stopPropagation();
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const menuWidth = 208; // w-52 = 13rem = 208px at default font size
        const x = Math.min(rect.right, window.innerWidth - menuWidth - 8);
        const y = rect.bottom + 4;
        setCtxMenu({ id, type, x, y });
    };

    /**
     * Conveniently resolve the session object for the currently open context
     * menu (used by the "Move to Folder" submenu to check the current folder).
     */
    const ctxSession = ctxMenu?.type === 'session'
        ? sessions.find(s => s.id === ctxMenu.id) ?? null
        : null;

    // ═════════════════════════════════════════════════════════════════════════
    // Derived state: Search filtering
    //
    // Fix #4: In the original code, session filtering for folder contents
    // used the raw sessions[] array, not the search-filtered one, so sessions
    // inside folders could vanish from search results without the folder also
    // disappearing. Now all derivations start from filteredSessions.
    //
    //   filteredSessions → all sessions matching the query (or all if q='')
    //   ungroupedSessions → filteredSessions without a folder
    //   folderSessionsFor(id) → filteredSessions inside folder `id`
    //   foldersToShow → folders whose name matches OR that contain matching sessions
    // ═════════════════════════════════════════════════════════════════════════

    const q = searchQuery.toLowerCase();
    /** Sessions matching the search query (all sessions when search is empty). */
    const filteredSessions = q
        ? sessions.filter(s => s.title.toLowerCase().includes(q))
        : sessions;
    /** Sessions with no folder assignment (shown in the "Chats" section). */
    const ungroupedSessions = filteredSessions.filter(s => !s.folder);
    /**
     * Returns filtered sessions belonging to a specific folder.
     * @param folderId - UUID of the folder to filter by
     */
    const folderSessionsFor = (folderId: string) =>
        filteredSessions.filter(s => s.folder === folderId);
    /**
     * Folders to render. When searching, only folders whose name matches OR
     * that contain at least one matching session are shown.
     */
    const foldersToShow = folders.filter(f =>
        !q || f.name.toLowerCase().includes(q) || folderSessionsFor(f.id).length > 0,
    );

    // ═════════════════════════════════════════════════════════════════════════
    // Render helper: Session row
    // Renders a single chat session in the sidebar list.
    // Used both for ungrouped sessions and for sessions inside folders.
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Render a single session row in the sidebar.
     *
     * Features:
     *  • draggable — enables drag-to-folder reordering (Fix #7)
     *  • Inline rename input when editingId === session.id (Fix #5)
     *  • ⋮ button visible only on row hover (Fix #2 — no bg bleed)
     *  • Dims (opacity-40) when being dragged
     *  • Shows latest_message preview snippet below title
     *  • indented=true adds a left-border indent for folder children
     *
     * @param session  - The ChatSession to render
     * @param indented - True when the session is inside a folder (adds visual indent)
     */
    const renderSession = (session: ChatSession, indented = false) => {
        const isActive = activeSessionId === session.id;
        const isEditing = editingId === session.id;
        const isDragging = dragSessionId === session.id;

        return (
            <div
                key={session.id}
                draggable
                onDragStart={(e) => onDragStart(e, session.id)}
                onDragEnd={onDragEnd}
                onClick={() => { if (!isEditing) setActiveSessionId(session.id); }}
                className={[
                    'group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all select-none',
                    isActive ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-100 text-gray-700',
                    // Visual indent for sessions inside folders — left border shows hierarchy
                    indented ? 'ml-5 border-l-2 border-gray-200 pl-3 rounded-l-none' : '',
                    // Dim the source row while it is being dragged
                    isDragging ? 'opacity-40 scale-95' : '',
                ].join(' ')}
            >
                {/* Icon: indent indicator OR chat bubble */}
                {indented
                    ? <CornerDownRight className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-brand-400' : 'text-gray-300'}`} />
                    : <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-brand-500' : 'text-gray-400'}`} />
                }

                {/* Inline rename input OR title + preview */}
                {isEditing ? (
                    <input
                        autoFocus
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        onBlur={commitRename}   // clicking away saves the rename
                        onClick={e => e.stopPropagation()}  // don't trigger row click
                        className="flex-1 text-sm bg-white border border-brand-400 rounded px-2 py-0.5 outline-none ring-1 ring-brand-400"
                    />
                ) : (
                    <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium truncate">{session.title}</p>
                        {/* Latest message preview — 100 char snippet from backend serializer */}
                        {session.latest_message && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                                {session.latest_message.content}
                            </p>
                        )}
                    </div>
                )}

                {/* ⋮ button — only visible on hover (opacity-0 → group-hover:opacity-100).
                    Fix #2: no hardcoded background class — button is fully transparent
                    until hovered, eliminating the grey bg bleed from the original code. */}
                {!isEditing && (
                    <button
                        onClick={(e) => openCtxMenu(e, session.id, 'session')}
                        className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="More options"
                    >
                        <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        );
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Render helper: Folder row
    // Renders a collapsible folder and its child sessions.
    // Also acts as a drag-and-drop target.
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Render a folder row with its child sessions.
     *
     * Features:
     *  • Click header to expand/collapse
     *  • Drag-over highlight ring (Fix #7 drop target)
     *  • Inline rename for folder name (Fix #5)
     *  • Session count badge — e.g. "(3)" (Fix #8)
     *  • ⋮ button visible on hover only (Fix #2)
     *  • Auto-expands when a search query matches children (Fix #4)
     *  • "Empty — drag chats here" hint when folder is empty and no search
     *
     * @param folder - The ChatFolder to render
     */
    const renderFolder = (folder: ChatFolder) => {
        // Auto-expand during search so matched sessions inside are visible — Fix #4
        const isExpanded = !!q || expandedFolders.has(folder.id);
        const fSessions = folderSessionsFor(folder.id);
        const isEditing = editingId === folder.id;
        const isDragOver = dragOverFolderId === folder.id;

        return (
            <div
                key={folder.id}
                // Drag-and-drop: this folder row is a drop target
                onDragOver={(e) => onFolderDragOver(e, folder.id)}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(e) => onFolderDrop(e, folder.id)}
            >
                {/* Folder header row */}
                <div
                    onClick={() => !isEditing && setExpandedFolders(prev => {
                        const next = new Set(prev);
                        next.has(folder.id) ? next.delete(folder.id) : next.add(folder.id);
                        return next;
                    })}
                    className={[
                        'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all',
                        isDragOver
                            // Blue ring when a session is dragged over this folder
                            ? 'bg-brand-100 ring-2 ring-brand-400 ring-inset'
                            : 'hover:bg-gray-100 text-gray-700',
                    ].join(' ')}
                >
                    {/* Chevron expand/collapse indicator */}
                    {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    }
                    {/* Folder icon — fills blue tint when drag target is active */}
                    <Folder className={`w-4 h-4 flex-shrink-0 ${isDragOver ? 'text-brand-500 fill-brand-100' : 'text-blue-500 fill-blue-50'}`} />

                    {/* Inline rename OR folder name */}
                    {isEditing ? (
                        <input
                            autoFocus
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onKeyDown={handleRenameKeyDown}
                            onBlur={commitRename}
                            onClick={e => e.stopPropagation()}
                            className="flex-1 text-sm font-semibold bg-white border border-brand-400 rounded px-2 py-0.5 outline-none ring-1 ring-brand-400"
                        />
                    ) : (
                        <span className="flex-1 text-sm font-semibold truncate select-none">
                            {folder.name}
                        </span>
                    )}

                    {/* Session count badge (Fix #8) + hover ⋮ button (Fix #2) */}
                    {!isEditing && (
                        <>
                            {/* Count pill — shows how many sessions are inside without expanding */}
                            <span className="text-xs text-gray-400 font-medium flex-shrink-0 bg-gray-100 px-1.5 py-0.5 rounded-full">
                                {fSessions.length}
                            </span>
                            {/* ⋮ button — only visible on hover (opacity-0 → group-hover) */}
                            <button
                                onClick={(e) => openCtxMenu(e, folder.id, 'folder')}
                                className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="More options"
                            >
                                <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                </div>

                {/* Folder contents (sessions) */}
                {isExpanded && (
                    <div className="mt-0.5 mb-1">
                        {fSessions.length > 0
                            ? fSessions.map(s => renderSession(s, true))
                            : !q && (
                                // Empty folder hint — only shown when not searching
                                <p className="ml-8 text-xs text-gray-400 italic py-1.5">
                                    Empty — drag chats here
                                </p>
                            )
                        }
                    </div>
                )}
            </div>
        );
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Render
    // ═════════════════════════════════════════════════════════════════════════

    return (
        <div className="h-[calc(100vh-8rem)] flex gap-4 animate-fade-in">

            {/* ── Sidebar (hidden on mobile, visible lg+) ───────────────────── */}
            <div className="w-72 hidden lg:flex flex-col">
                <Card className="flex-1 flex flex-col overflow-hidden">

                    {/* Action buttons: New Chat + New Folder */}
                    <div className="p-3 border-b border-gray-100 flex gap-2">
                        <Button
                            onClick={handleNewChat}
                            variant="primary"
                            size="sm"
                            className="flex-1"
                            icon={<Plus className="w-4 h-4" />}
                        >
                            New Chat
                        </Button>
                        {/* New Folder button — icon-only to save space */}
                        <Button
                            onClick={handleNewFolder}
                            variant="secondary"
                            size="sm"
                            className="px-2.5"
                            title="New Folder"
                        >
                            <FolderPlus className="w-4 h-4 text-gray-600" />
                        </Button>
                    </div>

                    {/* Search box */}
                    <div className="px-3 pt-3 pb-2">
                        <Input
                            placeholder="Search chats\u2026"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            leftIcon={<Search className="w-4 h-4" />}
                            className="text-sm"
                        />
                    </div>

                    {/* Session / folder list — scrollable */}
                    <div className="flex-1 overflow-y-auto px-2 pb-3">
                        {/*
                         * Show skeleton while loading (Fix #6), then the real list.
                         * The list has two sections: Folders (if any) + Chats.
                         * Both sections are derived from filteredSessions/foldersToShow
                         * so search works consistently across both (Fix #4).
                         */}
                        {loadingData ? (
                            <SidebarSkeleton />
                        ) : (
                            <div className="space-y-2">

                                {/* ── Folders section ──────────────────────────── */}
                                {foldersToShow.length > 0 && (
                                    <div>
                                        <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                            Folders
                                        </p>
                                        <div className="space-y-0.5">
                                            {foldersToShow.map(renderFolder)}
                                        </div>
                                    </div>
                                )}

                                {/* ── Ungrouped chats section ───────────────────── */}
                                {/*
                                 * This entire section is a drop target (Fix #7).
                                 * Dropping a session here sets its folder FK to null,
                                 * effectively "removing" it from any folder.
                                 * The blue ring highlight only appears when a drag is
                                 * hovering over this section.
                                 */}
                                {(ungroupedSessions.length > 0 || dragOverFolderId === '__ungrouped__') && (
                                    <div
                                        onDragOver={onUngroupedDragOver}
                                        onDragLeave={() => setDragOverFolderId(null)}
                                        onDrop={onUngroupedDrop}
                                        className={[
                                            'rounded-lg transition-all',
                                            dragOverFolderId === '__ungrouped__'
                                                ? 'ring-2 ring-brand-400 ring-inset bg-brand-50 p-1'
                                                : '',
                                        ].join(' ')}
                                    >
                                        {/* Only show the "Chats" section header when folders also exist */}
                                        {foldersToShow.length > 0 && (
                                            <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                Chats
                                            </p>
                                        )}
                                        <div className="space-y-0.5">
                                            {ungroupedSessions.map(s => renderSession(s, false))}
                                        </div>
                                    </div>
                                )}

                                {/* ── Empty state (no sessions and no folders) ─── */}
                                {sessions.length === 0 && folders.length === 0 && !q && (
                                    <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                                        <MessageSquare className="w-9 h-9 opacity-25" />
                                        <p className="text-sm font-medium text-gray-500">No chats yet</p>
                                        <p className="text-xs text-center leading-relaxed">
                                            Click <strong>New Chat</strong> or just<br />type a message to start!
                                        </p>
                                    </div>
                                )}

                                {/* ── No search results state ───────────────────── */}
                                {q && foldersToShow.length === 0 && filteredSessions.length === 0 && (
                                    <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                                        <Search className="w-7 h-7 opacity-25" />
                                        <p className="text-sm">No matches for <strong>"{searchQuery}"</strong></p>
                                    </div>
                                )}

                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* ── Chat Area ───────────────────────────────────────────────── */}
            <Card className="flex-1 flex flex-col overflow-hidden">

                {/*
                 * Chat header bar (Fix #9)
                 * Only rendered when a session is active. Shows:
                 *   • Session title (truncated with ellipsis)
                 *   • Pencil icon → inline rename (same startRename flow as sidebar)
                 *   • Trash icon → delete session confirm modal
                 * Hides itself when no session is selected (blank "new chat" state).
                 */}
                {activeSessionId && (() => {
                    const s = sessions.find(x => x.id === activeSessionId);
                    if (!s) return null;
                    return (
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 min-w-0">
                            <MessageSquare className="w-4 h-4 text-brand-500 flex-shrink-0" />
                            {editingId === activeSessionId ? (
                                // Inline rename in the header — same behaviour as sidebar rename
                                <input
                                    autoFocus
                                    value={editingValue}
                                    onChange={e => setEditingValue(e.target.value)}
                                    onKeyDown={handleRenameKeyDown}
                                    onBlur={commitRename}
                                    className="flex-1 text-sm font-semibold bg-white border border-brand-400 rounded px-2 py-0.5 outline-none ring-1 ring-brand-400 min-w-0"
                                />
                            ) : (
                                <span className="text-sm font-semibold text-gray-800 truncate flex-1">
                                    {s.title}
                                </span>
                            )}
                            <button
                                onClick={() => startRename(s.id, 'session', s.title)}
                                className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
                                title="Rename chat"
                            >
                                <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => deleteSession(activeSessionId)}
                                className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                title="Delete chat"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    );
                })()}

                {/* ── Message list ─────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Spinner while loading messages for a newly-selected session */}
                    {loadingMessages && (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                        </div>
                    )}

                    {/* Welcome / blank state shown when session has no messages yet */}
                    {!loadingMessages && messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg">
                                <Bot className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-700">How can I help you?</h3>
                            <p className="text-sm text-center max-w-xs text-gray-500">
                                Ask questions about your uploaded documents.<br />
                                I'll find the relevant information for you.
                            </p>
                        </div>
                    )}

                    {/* Message bubbles */}
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {/* AI avatar — only on assistant messages */}
                            {msg.role === 'assistant' && (
                                <div className="w-8 h-8 mt-1 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                            )}

                            <div className={`max-w-[75%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-sans ${
                                    msg.role === 'user'
                                        ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-md'
                                        : 'bg-white border border-gray-100 shadow-sm text-gray-800'
                                }`}>
                                    {/*
                                     * Typing indicator: when assistant content is empty the SSE
                                     * stream hasn't started yet. Show three bouncing dots.
                                     * Once chunks arrive they replace the dots (in-place update).
                                     */}
                                    {msg.content === '' && msg.role === 'assistant' ? (
                                        <span className="flex items-center gap-1.5">
                                            {[0, 150, 300].map(d => (
                                                <span
                                                    key={d}
                                                    className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                                                    style={{ animationDelay: `${d}ms` }}
                                                />
                                            ))}
                                        </span>
                                    ) : msg.content}
                                </div>

                                {/* Source citations — shown below the message bubble when present */}
                                {msg.sources && msg.sources.length > 0 && (
                                    <div className="mt-2 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                                            Sources Referenced
                                        </p>
                                        {msg.sources.map((src, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-gray-100 mb-1 last:mb-0">
                                                <span className="text-xs font-medium text-gray-700 truncate">{src.title}</span>
                                                {/* Relevance score — 0.0–1.0 from Qdrant, displayed as percentage */}
                                                <span className="ml-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100 flex-shrink-0">
                                                    {(src.relevance_score * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* User avatar — only on user messages */}
                            {msg.role === 'user' && (
                                <Avatar
                                    name={`${user?.first_name ?? ''} ${user?.last_name ?? ''}`}
                                    size="sm"
                                    className="mt-1 flex-shrink-0"
                                />
                            )}
                        </div>
                    ))}

                    {/* Invisible div scrolled into view after each new message */}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Input bar ────────────────────────────────────────────── */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/60">
                    <div className="flex items-center gap-2 max-w-4xl mx-auto">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                // Enter (without Shift) sends the message
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                            }}
                            placeholder="Message AI Assistant\u2026"
                            disabled={sendingMessage}
                            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow text-sm disabled:opacity-60 bg-white"
                        />
                        <Button
                            onClick={handleSend}
                            variant="primary"
                            size="md"
                            disabled={!input.trim() || sendingMessage}
                            className="flex-shrink-0 px-5"
                            icon={sendingMessage
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Send className="w-4 h-4" />
                            }
                        >
                            {sendingMessage ? '' : 'Send'}
                        </Button>
                    </div>
                    {/* Disclaimer — hidden on small screens */}
                    <p className="text-center text-[11px] text-gray-400 mt-2 hidden md:block">
                        AI can make mistakes — verify critical info using the source citations above.
                    </p>
                </div>
            </Card>

            {/* ══════════════════════════════════════════════════════════════
                Context Menu Portal (Fix #1)

                Rendered via ReactDOM.createPortal into document.body so it
                is positioned OUTSIDE every overflow container and is never
                clipped by the sidebar's overflow-y-auto scroll area.

                Two sections:
                  • session menu: Rename | Move to Folder submenu | Delete
                  • folder menu:  Rename | Delete

                The backdrop div (position:fixed inset-0) captures mousedown
                events outside the menu and calls setCtxMenu(null) to close it.
                A matching global listener (useEffect above) provides the same
                behaviour from anywhere on the page.

                The menu content div has onMouseDown with e.stopPropagation()
                to prevent clicks inside the menu from triggering the backdrop.
            ══════════════════════════════════════════════════════════════ */}
            {ctxMenu && ReactDOM.createPortal(
                <>
                    {/* Full-screen invisible backdrop — click outside to close */}
                    <div
                        className="fixed inset-0 z-[9990]"
                        onMouseDown={(e) => { e.stopPropagation(); setCtxMenu(null); }}
                    />
                    {/* Menu panel — positioned at fixed coords computed by openCtxMenu() */}
                    <div
                        onMouseDown={e => e.stopPropagation()}
                        style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x - 4, zIndex: 9999 }}
                        className="w-52 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 animate-fade-in"
                    >
                        {/* ── Session context menu ──────────────────────────── */}
                        {ctxMenu.type === 'session' && (
                            <>
                                <button
                                    onClick={() => {
                                        const s = sessions.find(x => x.id === ctxMenu.id);
                                        if (s) startRename(s.id, 'session', s.title);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <Edit2 className="w-4 h-4 text-gray-400" /> Rename Chat
                                </button>

                                {/* Move to Folder submenu — only shown if at least one folder exists */}
                                {folders.length > 0 && (
                                    <>
                                        <div className="border-t border-gray-100 my-1" />
                                        <p className="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Move to Folder
                                        </p>
                                        {/* "Remove from Folder" option — only if session is currently in a folder */}
                                        {ctxSession?.folder && (
                                            <button
                                                onClick={() => moveToFolder(ctxMenu.id, null)}
                                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                            >
                                                <X className="w-4 h-4 text-gray-400" /> Remove from Folder
                                            </button>
                                        )}
                                        {/* One button per available folder */}
                                        {folders.map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => moveToFolder(ctxMenu.id, f.id)}
                                                // Disable the current folder so the user can't "move" to where it already is
                                                disabled={ctxSession?.folder === f.id}
                                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                                <span className="truncate">{f.name}</span>
                                            </button>
                                        ))}
                                    </>
                                )}

                                <div className="border-t border-gray-100 my-1" />
                                <button
                                    onClick={() => deleteSession(ctxMenu.id)}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 className="w-4 h-4" /> Delete Chat
                                </button>
                            </>
                        )}

                        {/* ── Folder context menu ───────────────────────────── */}
                        {ctxMenu.type === 'folder' && (
                            <>
                                <button
                                    onClick={() => {
                                        const f = folders.find(x => x.id === ctxMenu.id);
                                        if (f) startRename(f.id, 'folder', f.name);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <Edit2 className="w-4 h-4 text-gray-400" /> Rename Folder
                                </button>
                                <div className="border-t border-gray-100 my-1" />
                                <button
                                    onClick={() => deleteFolder(ctxMenu.id)}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 className="w-4 h-4" /> Delete Folder
                                </button>
                            </>
                        )}
                    </div>
                </>,
                document.body,
            )}

            {/* ══════════════════════════════════════════════════════════════
                Confirm Delete Modal
                Used for all destructive operations (delete session, delete folder).
                The `confirm.onConfirm` callback is set dynamically when the
                modal is opened via deleteSession() or deleteFolder().
                The `danger` flag controls whether the confirm button is red.
            ══════════════════════════════════════════════════════════════ */}
            <Modal
                isOpen={confirm.isOpen}
                onClose={() => !confirming && setConfirm(CLOSED_CONFIRM)}
                title={confirm.title}
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-gray-600 text-sm">{confirm.message}</p>
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <Button
                            variant="secondary"
                            onClick={() => setConfirm(CLOSED_CONFIRM)}
                            disabled={confirming}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant={confirm.danger ? 'danger' : 'primary'}
                            onClick={runConfirm}
                            loading={confirming}
                        >
                            {confirm.danger ? 'Delete' : 'Confirm'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
