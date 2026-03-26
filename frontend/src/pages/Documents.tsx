/**
 * Documents.tsx — Redesigned Document Management page.
 *
 * Features:
 *  - Folder sidebar with nested tree navigation
 *  - Grid / list view toggle
 *  - Document detail drawer (metadata, versions, access, tags)
 *  - Soft-delete with trash view + restore
 *  - Upload modal with drag-and-drop, progress bar
 *  - Per-document processing-progress badge
 *  - Tag & version-number display on each card/row
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
    FileText, Folder as FolderIcon, Upload, Download, Trash2, 
    Search, ChevronRight, ChevronDown, 
    RotateCcw, X, FilePlus2, History, RefreshCw, LayoutGrid, List, FolderPlus
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useUIStore } from '../store/ui.store';

import { documentService } from '../services/document.service';
import type {
    Document, DocumentVersion, DocumentFolder, DocumentTag,
} from '../services/document.service';

// ── Helpers ────────────────────────────────────────────────────────────────

type VisType = 'public' | 'private' | 'restricted';

const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const statusBadge = (s: string) => {
    const map: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
        completed: 'success', processing: 'warning', pending: 'default', failed: 'error',
    };
    return <Badge variant={map[s] ?? 'default'}>{s}</Badge>;
};

const visBadge = (v: string) => {
    const map: Record<string, 'success' | 'warning' | 'error'> = {
        public: 'success', restricted: 'warning', private: 'error',
    };
    return <Badge variant={map[v] ?? 'default'}>{v}</Badge>;
};

// ── Skeleton row ──────────────────────────────────────────────────────────

const SkeletonRow: React.FC = () => (
    <tr className="border-b border-border">
        {[180, 60, 60, 120, 90, 80, 90].map((w, i) => (
            <td key={i} className="py-3 px-4">
                <div className="h-4 bg-background-secondary rounded animate-pulse" style={{ width: w }} />
            </td>
        ))}
    </tr>
);

const EmptyState: React.FC<{ hasFilter: boolean }> = ({ hasFilter }) => (
    <tr>
        <td colSpan={8} className="py-20 text-center">
            <FilePlus2 className="w-12 h-12 text-text-muted opacity-40 mx-auto mb-4" />
            <p className="text-text-main font-semibold text-lg mb-1 tracking-tight">
                {hasFilter ? 'No documents match your filter' : 'No documents yet'}
            </p>
            <p className="text-text-muted text-sm font-medium">
                {hasFilter ? 'Try clearing your search or filters.' : 'Upload your first document to get started.'}
            </p>
        </td>
    </tr>
);

// ── Folder Tree (recursive) ──────────────────────────────────────────────

interface FolderNodeProps {
    folder: DocumentFolder;
    allFolders: DocumentFolder[];
    selected: string | null;
    onSelect: (id: string | null) => void;
}

const FolderNode: React.FC<FolderNodeProps> = ({ folder, allFolders, selected, onSelect }) => {
    const [open, setOpen] = useState(false);
    const children = allFolders.filter(f => f.parent === folder.id);
    const isSelected = selected === folder.id;

    return (
        <div>
            <button
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    isSelected ? 'bg-accent-cyan/10 text-accent-cyan font-semibold border-l-2 border-accent-cyan' : 'text-text-main hover:bg-surface-hover border-l-2 border-transparent'
                }`}
                onClick={() => onSelect(isSelected ? null : folder.id)}
            >
                {children.length > 0 ? (
                    <span onClick={e => { e.stopPropagation(); setOpen(!open); }} className="cursor-pointer">
                        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </span>
                ) : <span className="w-3.5" />}
                <FolderIcon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-accent-cyan' : 'text-text-muted'}`} />
                <span className="truncate tracking-wide">{folder.name}</span>
                <span className="ml-auto text-xs text-text-muted font-medium bg-background-secondary px-1.5 py-0.5 rounded">{folder.document_count}</span>
            </button>
            {open && children.length > 0 && (
                <div className="pl-4 mt-1 space-y-0.5 border-l border-border/40 ml-4">
                    {children.map(c => (
                        <FolderNode key={c.id} folder={c} allFolders={allFolders}
                            selected={selected} onSelect={onSelect} />
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Document Detail Drawer ───────────────────────────────────────────────

const DocumentDrawer: React.FC<{ 
    doc: Document; 
    onClose: () => void;
    onDownload: (doc: Document) => void;
    onReprocess: (doc: Document) => void;
}> = ({ doc, onClose, onDownload, onReprocess }) => {
    const [versions, setVersions] = useState<DocumentVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(true);

    useEffect(() => {
        if (!doc) return;
        documentService.getVersions(doc.id)
            .then(setVersions)
            .catch(() => setVersions([]))
            .finally(() => setLoadingVersions(false));
    }, [doc?.id]);

    if (!doc) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-surface shadow-xl border-l border-border z-50 flex flex-col animate-slide-in-right overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-surface sticky top-0 z-10">
                <h2 className="font-bold text-text-main truncate text-lg tracking-tight">{doc.title}</h2>
                <button onClick={onClose} className="p-1.5 hover:bg-surface-hover text-text-muted hover:text-text-main rounded-md transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-8 flex-1">
                {/* Metadata */}
                <section>
                    <h3 className="text-xs font-bold text-accent-cyan tracking-wider uppercase mb-3 text-shadow-sm">Metadata</h3>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm bg-background-secondary p-4 rounded-xl border border-border">
                        <span className="text-text-muted font-medium">Type</span><span className="text-text-main font-semibold uppercase">{doc.file_type || 'N/A'}</span>
                        <span className="text-text-muted font-medium">Size</span><span className="text-text-main font-medium">{fmtSize(doc.file_size)}</span>
                        <span className="text-text-muted font-medium">Pages</span><span className="text-text-main font-medium">{doc.page_count || '—'}</span>
                        <span className="text-text-muted font-medium mt-1">Status</span><span className="mt-1">{statusBadge(doc.status)}</span>
                        <span className="text-text-muted font-medium mt-1">Visibility</span><span className="mt-1">{visBadge(doc.visibility_type)}</span>
                        <span className="text-text-muted font-medium mt-1">Classification</span><span className="text-text-main font-medium mt-1">Level {doc.classification_level}</span>
                        <span className="text-text-muted font-medium">Uploaded by</span><span className="text-text-main font-medium">{doc.uploaded_by_name}</span>
                        <span className="text-text-muted font-medium">Created</span><span className="text-text-main font-medium">{new Date(doc.created_at).toLocaleDateString()}</span>
                        {doc.folder_name && (<><span className="text-text-muted font-medium">Folder</span><span className="text-text-main font-medium">{doc.folder_name}</span></>)}
                    </div>
                    {doc.description && <p className="mt-3 text-sm text-text-muted leading-relaxed">{doc.description}</p>}
                </section>

                {/* Tags */}
                {doc.tags && doc.tags.length > 0 && (
                    <section>
                        <h3 className="text-xs font-bold text-accent-cyan tracking-wider uppercase mb-3 text-shadow-sm">Tags</h3>
                        <div className="flex flex-wrap gap-2">
                            {doc.tags.map(t => (
                                <span key={t} className="px-2.5 py-1 bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan rounded-md text-xs font-semibold shadow-[0_0_10px_rgba(6,182,212,0.1)]">{t}</span>
                            ))}
                        </div>
                    </section>
                )}

                {/* Processing progress */}
                {(doc.status === 'processing' || doc.status === 'pending') && (
                    <section>
                        <h3 className="text-xs font-bold text-accent-cyan tracking-wider uppercase mb-3 text-shadow-sm">Processing</h3>
                        <div className="w-full bg-background-secondary rounded-full h-2 overflow-hidden border border-border shadow-inner">
                            <div className="bg-accent-cyan h-2 rounded-full transition-all duration-300 relative" style={{ width: `${doc.processing_progress}%` }}>
                                <div className="absolute inset-0 bg-white/20 animate-pulse" />
                            </div>
                        </div>
                        <p className="text-xs text-text-muted font-medium mt-1.5">{doc.processing_progress}% complete</p>
                    </section>
                )}

                {/* Versions */}
                <section>
                    <h3 className="text-xs font-bold text-accent-cyan tracking-wider uppercase mb-3 flex items-center text-shadow-sm">
                        <History className="w-3.5 h-3.5 mr-1.5" /> Versions
                    </h3>
                    {loadingVersions ? (
                        <p className="text-sm text-text-muted animate-pulse">Loading history…</p>
                    ) : versions.length === 0 ? (
                        <p className="text-sm text-text-muted">No prior versions found.</p>
                    ) : (
                        <div className="space-y-2">
                            {versions.map(v => (
                                <div key={v.id} className="flex items-center justify-between text-sm bg-surface hover:bg-surface-hover border border-border transition-colors rounded-xl px-4 py-3 shadow-sm hover:border-border-light group">
                                    <div>
                                        <span className="font-bold text-text-main">v{v.version_number}</span>
                                        {v.change_note && <span className="text-text-muted ml-2">— {v.change_note}</span>}
                                        <p className="text-[11px] font-medium text-text-muted mt-1.5 tracking-wider uppercase">{v.uploaded_by_name} · {new Date(v.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <button
                                        className="p-2 hover:bg-background rounded-md text-text-muted hover:text-accent-cyan transition-colors"
                                        title="Download this version"
                                        onClick={() => documentService.downloadVersion(doc.id, v.version_number, `${doc.title}_v${v.version_number}`)}
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-6 py-5 border-t border-border bg-surface sticky bottom-0">
                <Button variant="primary" className="flex-1 shadow-sm" icon={<Download className="w-4 h-4" />}
                    onClick={() => onDownload(doc)}>Download File</Button>
                {doc.status === 'failed' && (
                    <Button variant="secondary" className="flex-1" icon={<RefreshCw className="w-4 h-4" />}
                        onClick={() => onReprocess(doc)}>Reprocess</Button>
                )}
            </div>
        </div>
    );
};

// ── Main Component ───────────────────────────────────────────────────────

export const Documents: React.FC = () => {
    const { addToast } = useUIStore();

    // Data
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isForbidden, setIsForbidden] = useState(false);

    // Folders & tags
    const [folders, setFolders] = useState<DocumentFolder[]>([]);
    const [tags, setTags] = useState<DocumentTag[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [showTrash, setShowTrash] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [visibilityFilter, setVisibilityFilter] = useState('all');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

    // Upload modal
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [documentTitle, setDocumentTitle] = useState('');
    const [documentVisibility, setDocumentVisibility] = useState<VisType>('restricted');
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Create-folder modal
    const [folderModalOpen, setFolderModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    // Delete
    const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Detail drawer
    const [drawerDoc, setDrawerDoc] = useState<Document | null>(null);

    // ── Data loading ──────────────────────────────────────────────────

    const loadDocuments = useCallback(async () => {
        setLoading(true);
        setError(null);
        setIsForbidden(false);
        try {
            let data: Document[];
            if (showTrash) {
                data = await documentService.getTrash();
            } else {
                const params: Record<string, string> = {};
                if (selectedFolder) params.folder = selectedFolder;
                data = await documentService.getDocuments(params);
            }
            setDocuments(data);
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } }).response?.status;
            if (status === 403) {
                setIsForbidden(true);
            } else {
                setError('Failed to load documents.');
                addToast('error', 'Failed to load documents.');
            }
        } finally {
            setLoading(false);
        }
    }, [addToast, selectedFolder, showTrash]);

    const loadFoldersAndTags = useCallback(async () => {
        try {
            const [f, t] = await Promise.all([documentService.getFolders(), documentService.getTags()]);
            setFolders(f);
            setTags(t);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { loadDocuments(); }, [loadDocuments]);
    useEffect(() => { loadFoldersAndTags(); }, [loadFoldersAndTags]);

    // ── File validation ───────────────────────────────────────────────

    const validateAndSetFile = (file: File) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'text/csv', 'text/markdown',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/msword',
        ];
        if (!allowedTypes.includes(file.type) && file.type !== '') {
            addToast('error', 'File type not allowed.');
            return false;
        }
        if (file.size > 50 * 1024 * 1024) {
            addToast('error', 'File size must be less than 50 MB.');
            return false;
        }
        setSelectedFile(file);
        if (!documentTitle) setDocumentTitle(file.name.replace(/\.[^.]+$/, ''));
        return true;
    };

    // ── Handlers ──────────────────────────────────────────────────────

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) validateAndSetFile(file);
    };
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) validateAndSetFile(file);
    };

    const handleUpload = async () => {
        if (!selectedFile) { addToast('error', 'Please select a file.'); return; }
        if (!documentTitle.trim()) { addToast('error', 'Please enter a title.'); return; }
        setIsUploading(true); setUploadProgress(0);
        try {
            const uploaded = await documentService.uploadDocument(
                selectedFile, documentTitle.trim(), documentVisibility,
                e => { if (e.total) setUploadProgress(Math.round((e.loaded * 100) / e.total)); },
                { folder: selectedFolder || undefined },
            );
            setDocuments(prev => [uploaded, ...prev]);
            addToast('success', `"${uploaded.title}" uploaded.`);
            closeUploadModal();
        } catch { addToast('error', 'Upload failed.'); }
        finally { setIsUploading(false); }
    };

    const handleDownload = async (doc: Document) => {
        try {
            const ext = doc.file_type || '';
            const fn = doc.title.endsWith(ext) ? doc.title : `${doc.title}${ext}`;
            await documentService.downloadDocument(doc.id, fn);
        } catch { addToast('error', 'Download failed.'); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await documentService.deleteDocument(deleteTarget.id);
            setDocuments(prev => prev.filter(d => d.id !== deleteTarget.id));
            addToast('success', `"${deleteTarget.title}" moved to trash.`);
            setDeleteTarget(null);
        } catch { addToast('error', 'Delete failed.'); }
        finally { setIsDeleting(false); }
    };

    const handleRestore = async (doc: Document) => {
        try {
            await documentService.restoreDocument(doc.id);
            setDocuments(prev => prev.filter(d => d.id !== doc.id));
            addToast('success', `"${doc.title}" restored.`);
        } catch { addToast('error', 'Restore failed.'); }
    };

    const handleReprocess = async (doc: Document) => {
        try {
            const updated = await documentService.reprocessDocument(doc.id);
            setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
            addToast('success', 'Reprocessing started.');
        } catch { addToast('error', 'Reprocess failed.'); }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const f = await documentService.createFolder({
                name: newFolderName.trim(),
                parent: selectedFolder,
            });
            setFolders(prev => [...prev, f]);
            setNewFolderName('');
            setFolderModalOpen(false);
            addToast('success', `Folder "${f.name}" created.`);
        } catch { addToast('error', 'Failed to create folder.'); }
    };

    // ── Filtering ─────────────────────────────────────────────────────

    const hasFilter = !!(searchQuery || typeFilter !== 'all' || visibilityFilter !== 'all');
    const filteredDocuments = documents.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || doc.file_type === typeFilter;
        const matchesVis = visibilityFilter === 'all' || doc.visibility_type === visibilityFilter;
        return matchesSearch && matchesType && matchesVis;
    });

    const closeUploadModal = () => {
        if (isUploading) return;
        setUploadModalOpen(false); setSelectedFile(null);
        setDocumentTitle(''); setDocumentVisibility('restricted');
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Render ────────────────────────────────────────────────────────

    const rootFolders = folders.filter(f => !f.parent);

    return (
        <div className="flex flex-col md:flex-row gap-6 animate-fade-in h-[calc(100vh-8rem)]">
            {/* ── Folder Sidebar ─────────────────────────────────────── */}
            <aside className="w-full md:w-64 flex-shrink-0 space-y-2 bg-surface border border-border rounded-2xl p-4 shadow-sm overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-accent-cyan tracking-wider uppercase">Folders</span>
                    <button onClick={() => setFolderModalOpen(true)}
                        className="p-1.5 hover:bg-surface-hover hover:text-accent-cyan text-text-muted rounded-md transition-colors shadow-sm" title="New folder">
                        <FolderPlus className="w-4 h-4" />
                    </button>
                </div>

                <button
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all shadow-sm ${
                        !selectedFolder && !showTrash ? 'bg-accent-cyan/10 text-accent-cyan font-bold border border-accent-cyan/20' : 'text-text-main hover:bg-surface-hover border border-transparent'
                    }`}
                    onClick={() => { setSelectedFolder(null); setShowTrash(false); }}
                >
                    <FileText className="w-4 h-4" /> All Documents
                </button>

                <div className="pt-2">
                {rootFolders.map(f => (
                    <FolderNode key={f.id} folder={f} allFolders={folders}
                        selected={selectedFolder}
                        onSelect={id => { setSelectedFolder(id); setShowTrash(false); }} />
                ))}
                </div>

                <hr className="my-4 border-border" />

                <button
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all shadow-sm ${
                        showTrash ? 'bg-accent-red/10 text-accent-red font-bold border border-accent-red/20' : 'text-text-muted hover:text-text-main hover:bg-surface-hover border border-transparent'
                    }`}
                    onClick={() => { setShowTrash(!showTrash); setSelectedFolder(null); }}
                >
                    <Trash2 className="w-4 h-4 text-accent-red/80" /> Trash
                </button>

                {tags.length > 0 && (
                    <div className="pt-4">
                        <span className="text-xs font-bold text-text-muted tracking-wider uppercase px-2 mb-2 block">Tags</span>
                        <div className="space-y-0.5">
                        {tags.map(t => (
                            <span key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-main hover:bg-surface-hover rounded-lg transition-colors cursor-pointer">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: t.color }} />
                                {t.name}
                            </span>
                        ))}
                        </div>
                    </div>
                )}
            </aside>

            {/* ── Main content ───────────────────────────────────────── */}
            <div className="flex-1 space-y-4 min-w-0 flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-text-main mb-1.5 flex items-center">
                            {showTrash ? 'Trash' : 'Documents'}
                        </h1>
                        <p className="text-sm font-medium text-text-muted">
                            {showTrash ? 'Soft-deleted documents — restore or permanently delete' : 'Manage and search your document library'}
                        </p>
                    </div>
                    {!showTrash && (
                        <Button variant="primary" size="lg" icon={<Upload className="w-5 h-5" />}
                            onClick={() => setUploadModalOpen(true)} disabled={isForbidden}>
                            Upload Document
                        </Button>
                    )}
                </div>

                {/* Error / forbidden */}
                {isForbidden && (
                    <div className="rounded-xl bg-accent-orange/10 border border-accent-orange/20 text-accent-orange px-5 py-4 text-sm flex items-start gap-3 shadow-inner">
                        <span className="text-xl leading-none">🔒</span>
                        <div>
                            <p className="font-bold text-base">Access Restricted</p>
                            <p className="mt-1 font-medium">Contact your administrator to get access.</p>
                        </div>
                    </div>
                )}

                {error && !isForbidden && (
                    <div className="rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red px-5 py-4 text-sm flex items-center justify-between shadow-inner">
                        <span className="font-medium">{error}</span>
                        <Button variant="ghost" size="sm" onClick={loadDocuments}>Retry</Button>
                    </div>
                )}

                {/* Search / Filters / View toggle */}
                {!isForbidden && (
                    <Card variant="default" className="p-1">
                        <div className="flex flex-wrap gap-3 items-center p-2">
                            <div className="flex-1 min-w-[200px]">
                                <Input placeholder="Search documents…" value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    leftIcon={<Search className="w-5 h-5" />} />
                            </div>
                            <select className="px-4 py-2.5 rounded-xl border border-border bg-surface text-text-main text-sm font-medium focus:ring-2 focus:ring-accent-cyan focus:outline-none transition-colors shadow-sm"
                                value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                                <option value="all">All Types</option>
                                <option value=".pdf">PDF</option><option value=".docx">DOCX</option>
                                <option value=".txt">TXT</option><option value=".csv">CSV</option>
                                <option value=".xlsx">XLSX</option>
                            </select>
                            <select className="px-4 py-2.5 rounded-xl border border-border bg-surface text-text-main text-sm font-medium focus:ring-2 focus:ring-accent-cyan focus:outline-none transition-colors shadow-sm"
                                value={visibilityFilter} onChange={e => setVisibilityFilter(e.target.value)}>
                                <option value="all">All Visibility</option>
                                <option value="public">Public</option><option value="private">Private</option>
                                <option value="restricted">Restricted</option>
                            </select>
                            <div className="flex border border-border bg-background-secondary rounded-xl overflow-hidden shadow-inner p-1">
                                <button className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-surface text-accent-cyan shadow-sm font-bold' : 'text-text-muted hover:text-text-main'}`}
                                    onClick={() => setViewMode('list')} title="List view">
                                    <List className="w-4 h-4" />
                                </button>
                                <button className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-surface text-accent-cyan shadow-sm font-bold' : 'text-text-muted hover:text-text-main'}`}
                                    onClick={() => setViewMode('grid')} title="Grid view">
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Document List / Grid */}
                {!isForbidden && viewMode === 'list' && (
                    <Card variant="default" className="flex-1 overflow-hidden flex flex-col">
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-background-secondary sticky top-0 z-10 border-b border-border">
                                    <tr>
                                        <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Document</th>
                                        <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Type</th>
                                        <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Size</th>
                                        <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Uploaded By</th>
                                        <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Date</th>
                                        <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Status</th>
                                        <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider">Visibility</th>
                                        <th className="py-4 px-5 text-xs font-bold text-text-muted uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                    {loading ? (
                                        Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                                    ) : filteredDocuments.length === 0 ? (
                                        <EmptyState hasFilter={hasFilter} />
                                    ) : (
                                        filteredDocuments.map(doc => (
                                            <tr key={doc.id} className="hover:bg-surface-hover/80 transition-colors cursor-pointer group"
                                                onClick={() => setDrawerDoc(doc)}>
                                                <td className="py-4 px-5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex flex-shrink-0 items-center justify-center shadow-sm group-hover:bg-accent-cyan border-transparent transition-colors">
                                                            <FileText className="w-5 h-5 text-accent-cyan group-hover:text-white transition-colors" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="font-semibold text-text-main truncate block max-w-[250px] group-hover:text-accent-cyan transition-colors">{doc.title}</span>
                                                            <span className="text-xs font-medium text-text-muted mt-0.5 block">
                                                                v{doc.current_version_number}
                                                                {doc.tags?.length > 0 && <span className="text-accent-blue font-semibold"> · {doc.tags.slice(0, 2).join(', ')}</span>}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-5 text-text-muted text-sm font-semibold uppercase tracking-wider">{doc.file_type}</td>
                                                <td className="py-4 px-5 text-text-muted text-sm font-medium">{fmtSize(doc.file_size)}</td>
                                                <td className="py-4 px-5 text-text-main text-sm font-medium">{doc.uploaded_by_name}</td>
                                                <td className="py-4 px-5 text-text-muted text-sm font-medium">{new Date(doc.created_at).toLocaleDateString()}</td>
                                                <td className="py-4 px-5">{statusBadge(doc.status)}</td>
                                                <td className="py-4 px-5">{visBadge(doc.visibility_type)}</td>
                                                <td className="py-4 px-5 text-right" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button title="Download" className="p-2 text-text-muted hover:text-accent-cyan hover:bg-surface rounded-lg transition-all"
                                                            onClick={() => handleDownload(doc)}><Download className="w-4 h-4" /></button>
                                                        {showTrash ? (
                                                            <button title="Restore" className="p-2 text-text-muted hover:text-accent-green hover:bg-surface rounded-lg transition-all"
                                                                onClick={() => handleRestore(doc)}><RotateCcw className="w-4 h-4" /></button>
                                                        ) : (
                                                            <button title="Delete" className="p-2 text-text-muted hover:text-accent-red hover:bg-surface rounded-lg transition-all"
                                                                onClick={() => setDeleteTarget(doc)}><Trash2 className="w-4 h-4" /></button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {!loading && (
                            <div className="p-4 border-t border-border bg-background-secondary">
                                <p className="text-xs font-medium text-text-muted">
                                    Showing {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        )}
                    </Card>
                )}

                {/* Grid view */}
                {!isForbidden && viewMode === 'grid' && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {loading ? (
                            Array.from({ length: 10 }).map((_, i) => (
                                <div key={i} className="bg-surface rounded-2xl border border-border p-5 shadow-sm animate-pulse">
                                    <div className="h-12 w-12 bg-background-secondary rounded-xl mb-4" />
                                    <div className="h-4 bg-background-secondary rounded w-3/4 mb-2" />
                                    <div className="h-3 bg-background-secondary rounded w-1/2" />
                                </div>
                            ))
                        ) : filteredDocuments.length === 0 ? (
                            <div className="col-span-full py-16 text-center bg-surface rounded-2xl border border-border shadow-inner">
                                <FilePlus2 className="w-12 h-12 text-text-muted opacity-40 mx-auto mb-4" />
                                <p className="text-text-main font-semibold text-lg">{hasFilter ? 'No matches' : 'No documents yet'}</p>
                            </div>
                        ) : (
                            filteredDocuments.map(doc => (
                                <div key={doc.id}
                                    className="bg-surface hover:bg-surface-hover transition-all duration-300 rounded-2xl border border-border p-5 shadow-sm hover:shadow-md cursor-pointer group flex flex-col h-full"
                                    onClick={() => setDrawerDoc(doc)}>
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex flex-shrink-0 items-center justify-center shadow-sm group-hover:bg-accent-cyan transition-colors">
                                            <FileText className="w-6 h-6 text-accent-cyan group-hover:text-white transition-colors" />
                                        </div>
                                        <div className="scale-90 origin-top-right">{statusBadge(doc.status)}</div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-text-main leading-tight mb-2 group-hover:text-accent-cyan transition-colors line-clamp-2">{doc.title}</h3>
                                        <p className="text-[11px] font-bold text-text-muted tracking-wider uppercase mb-3">
                                            {doc.file_type?.replace('.', '')} · {fmtSize(doc.file_size)} · v{doc.current_version_number}
                                        </p>
                                        {doc.tags?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-auto">
                                                {doc.tags.slice(0, 3).map(t => (
                                                    <span key={t} className="px-2 py-0.5 bg-background-secondary text-text-muted border border-border rounded-md text-[10px] font-bold">{t}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {doc.status === 'processing' && (
                                        <div className="mt-4 w-full bg-background-secondary rounded-full h-1.5 overflow-hidden shadow-inner border border-border">
                                            <div className="bg-accent-cyan h-1.5 rounded-full relative" style={{ width: `${doc.processing_progress}%` }}>
                                                 <div className="absolute inset-0 bg-white/30 animate-pulse" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* ── Document Detail Drawer ─────────────────────────────── */}
            {drawerDoc && (
                <>
                    <div className="fixed inset-0 bg-background/80 z-40 animate-fade-in" onClick={() => setDrawerDoc(null)} />
                    <DocumentDrawer key={drawerDoc.id} doc={drawerDoc} onClose={() => setDrawerDoc(null)}
                        onDownload={handleDownload} onReprocess={handleReprocess} />
                </>
            )}

            {/* ── Delete Modal ───────────────────────────────────────── */}
            <Modal isOpen={!!deleteTarget} onClose={() => !isDeleting && setDeleteTarget(null)} title="Delete Document">
                <div className="space-y-6">
                    <p className="text-text-muted text-sm leading-relaxed">
                        Are you sure you want to move <span className="font-bold text-text-main">"{deleteTarget?.title}"</span> to the trash?
                        You can restore it later if needed.
                    </p>
                    <div className="flex gap-3">
                        <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
                        <Button variant="danger" className="flex-1 shadow-sm" onClick={handleDelete} loading={isDeleting}>Delete Document</Button>
                    </div>
                </div>
            </Modal>

            {/* ── Upload Modal ───────────────────────────────────────── */}
            <Modal isOpen={uploadModalOpen} onClose={closeUploadModal} title="Upload Document">
                <div className="space-y-5">
                    <input ref={fileInputRef} type="file"
                        accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.pptx,.md"
                        onChange={handleFileSelect} className="hidden" />

                    <div className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                        isDragging ? 'border-accent-cyan bg-accent-cyan/10' : 'border-border hover:border-accent-cyan/50 hover:bg-surface-hover bg-background-secondary/30'
                    }`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                        <div className={`w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center transition-colors ${isDragging ? 'bg-accent-cyan text-white shadow-md' : 'bg-surface border border-border text-text-muted shadow-sm'}`}>
                            <Upload className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-semibold text-text-main mb-1.5">Click to choose a file or drag and drop</p>
                        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">PDF, DOCX, TXT, CSV, XLSX, PPTX, MD — max 50 MB</p>

                        {selectedFile && (
                            <div className="mt-6 p-3 bg-surface border border-border/80 rounded-xl flex items-center justify-between shadow-sm animate-scale-in"
                                onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-accent-cyan" />
                                    </div>
                                    <div className="flex flex-col text-left">
                                        <span className="text-sm font-bold text-text-main truncate max-w-[200px]">{selectedFile.name}</span>
                                        <span className="text-xs font-medium text-text-muted">{fmtSize(selectedFile.size)}</span>
                                    </div>
                                </div>
                                <button className="p-1.5 text-text-muted hover:text-accent-red hover:bg-accent-red/10 rounded-md transition-colors flex-shrink-0"
                                    onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    <Input label="Document Title" placeholder="Enter a descriptive title"
                        value={documentTitle} onChange={e => setDocumentTitle(e.target.value)} disabled={isUploading} autoFocus />

                    <div>
                        <label className="block text-sm font-bold text-text-main mb-2">Visibility Settings</label>
                        <select className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent-cyan shadow-sm transition-shadow appearance-none"
                            value={documentVisibility} onChange={e => setDocumentVisibility(e.target.value as VisType)} disabled={isUploading}>
                            <option value="public">Public — visible to all workspace members</option>
                            <option value="restricted">Restricted — visible only via access grants</option>
                            <option value="private">Private — only you can view this</option>
                        </select>
                    </div>

                    {isUploading && (
                        <div className="space-y-2 pt-2 animate-fade-in">
                            <div className="flex justify-between text-xs font-bold text-text-main uppercase tracking-wider">
                                <span className="text-accent-cyan animate-pulse">Uploading…</span><span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-background-secondary rounded-full h-2.5 shadow-inner overflow-hidden border border-border">
                                <div className="bg-accent-cyan h-2.5 rounded-full transition-all duration-300 ease-out relative"
                                    style={{ width: `${uploadProgress}%` }}>
                                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-border/30">
                        <Button variant="secondary" className="flex-1" onClick={closeUploadModal} disabled={isUploading}>Cancel</Button>
                        <Button variant="primary" className="flex-1 shadow-glow-cyan/20" onClick={handleUpload} loading={isUploading}>
                            {isUploading ? 'Uploading…' : 'Upload Document'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ── Create Folder Modal ────────────────────────────────── */}
            <Modal isOpen={folderModalOpen} onClose={() => setFolderModalOpen(false)} title="Create New Folder">
                <div className="space-y-5">
                    <Input label="Folder Name" placeholder="e.g., HR Policies, Q4 Reports"
                        value={newFolderName} onChange={e => setNewFolderName(e.target.value)} autoFocus />
                    <div className="flex gap-3 pt-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setFolderModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" className="flex-1 shadow-glow-cyan/20" onClick={handleCreateFolder}>Create Folder</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
