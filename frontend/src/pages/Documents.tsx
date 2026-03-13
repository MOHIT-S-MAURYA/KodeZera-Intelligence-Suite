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
    Search, Upload, FileText, Download, Trash2, Eye, X, FilePlus2,
    FolderPlus, ChevronRight, ChevronDown, RotateCcw, Tag, History,
    LayoutGrid, List, MoreVertical, RefreshCw, FolderIcon, Plus,
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
    <tr className="border-b border-gray-100">
        {[180, 60, 60, 120, 90, 80, 90].map((w, i) => (
            <td key={i} className="py-3 px-4">
                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: w }} />
            </td>
        ))}
    </tr>
);

const EmptyState: React.FC<{ hasFilter: boolean }> = ({ hasFilter }) => (
    <tr>
        <td colSpan={8} className="py-16 text-center">
            <FilePlus2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium mb-1">
                {hasFilter ? 'No documents match your filter' : 'No documents yet'}
            </p>
            <p className="text-gray-400 text-sm">
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
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors ${
                    isSelected ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                }`}
                onClick={() => onSelect(isSelected ? null : folder.id)}
            >
                {children.length > 0 ? (
                    <span onClick={e => { e.stopPropagation(); setOpen(!open); }} className="cursor-pointer">
                        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </span>
                ) : <span className="w-3.5" />}
                <FolderIcon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{folder.name}</span>
                <span className="ml-auto text-xs text-gray-400">{folder.document_count}</span>
            </button>
            {open && children.length > 0 && (
                <div className="pl-4">
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

interface DrawerProps {
    doc: Document | null;
    onClose: () => void;
    onDownload: (doc: Document) => void;
    onReprocess: (doc: Document) => void;
    addToast: (type: 'success' | 'error', msg: string) => void;
}

const DocumentDrawer: React.FC<DrawerProps> = ({ doc, onClose, onDownload, onReprocess, addToast }) => {
    const [versions, setVersions] = useState<DocumentVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);

    useEffect(() => {
        if (!doc) return;
        setLoadingVersions(true);
        documentService.getVersions(doc.id)
            .then(setVersions)
            .catch(() => setVersions([]))
            .finally(() => setLoadingVersions(false));
    }, [doc?.id]);

    if (!doc) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col animate-slide-in-right overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900 truncate">{doc.title}</h2>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-5 flex-1">
                {/* Metadata */}
                <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Metadata</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-gray-500">Type</span><span>{doc.file_type || 'N/A'}</span>
                        <span className="text-gray-500">Size</span><span>{fmtSize(doc.file_size)}</span>
                        <span className="text-gray-500">Pages</span><span>{doc.page_count || '—'}</span>
                        <span className="text-gray-500">Status</span><span>{statusBadge(doc.status)}</span>
                        <span className="text-gray-500">Visibility</span><span>{visBadge(doc.visibility_type)}</span>
                        <span className="text-gray-500">Classification</span><span>Level {doc.classification_level}</span>
                        <span className="text-gray-500">Uploaded by</span><span>{doc.uploaded_by_name}</span>
                        <span className="text-gray-500">Created</span><span>{new Date(doc.created_at).toLocaleDateString()}</span>
                        {doc.folder_name && (<><span className="text-gray-500">Folder</span><span>{doc.folder_name}</span></>)}
                    </div>
                    {doc.description && <p className="mt-2 text-sm text-gray-600">{doc.description}</p>}
                </section>

                {/* Tags */}
                {doc.tags && doc.tags.length > 0 && (
                    <section>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Tags</h3>
                        <div className="flex flex-wrap gap-1.5">
                            {doc.tags.map(t => (
                                <span key={t} className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded text-xs font-medium">{t}</span>
                            ))}
                        </div>
                    </section>
                )}

                {/* Processing progress */}
                {(doc.status === 'processing' || doc.status === 'pending') && (
                    <section>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Processing</h3>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${doc.processing_progress}%` }} />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{doc.processing_progress}% complete</p>
                    </section>
                )}

                {/* Versions */}
                <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        <History className="w-3.5 h-3.5 inline mr-1" /> Versions
                    </h3>
                    {loadingVersions ? (
                        <p className="text-sm text-gray-400">Loading…</p>
                    ) : versions.length === 0 ? (
                        <p className="text-sm text-gray-400">No versions found.</p>
                    ) : (
                        <div className="space-y-2">
                            {versions.map(v => (
                                <div key={v.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                                    <div>
                                        <span className="font-medium">v{v.version_number}</span>
                                        {v.change_note && <span className="text-gray-500 ml-2">— {v.change_note}</span>}
                                        <p className="text-xs text-gray-400">{v.uploaded_by_name} · {new Date(v.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <button
                                        className="p-1 hover:bg-gray-100 rounded"
                                        title="Download this version"
                                        onClick={() => documentService.downloadVersion(doc.id, v.version_number, `${doc.title}_v${v.version_number}`)}
                                    >
                                        <Download className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-5 py-4 border-t border-gray-200">
                <Button variant="primary" size="sm" icon={<Download className="w-4 h-4" />}
                    onClick={() => onDownload(doc)}>Download</Button>
                {doc.status === 'failed' && (
                    <Button variant="secondary" size="sm" icon={<RefreshCw className="w-4 h-4" />}
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
        <div className="flex gap-6 animate-fade-in h-full">
            {/* ── Folder Sidebar ─────────────────────────────────────── */}
            <aside className="w-56 flex-shrink-0 space-y-1">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Folders</span>
                    <button onClick={() => setFolderModalOpen(true)}
                        className="p-1 hover:bg-gray-100 rounded" title="New folder">
                        <FolderPlus className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <button
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors ${
                        !selectedFolder && !showTrash ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={() => { setSelectedFolder(null); setShowTrash(false); }}
                >
                    <FileText className="w-4 h-4" /> All Documents
                </button>

                {rootFolders.map(f => (
                    <FolderNode key={f.id} folder={f} allFolders={folders}
                        selected={selectedFolder}
                        onSelect={id => { setSelectedFolder(id); setShowTrash(false); }} />
                ))}

                <hr className="my-2" />

                <button
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors ${
                        showTrash ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-500 hover:bg-gray-100'
                    }`}
                    onClick={() => { setShowTrash(!showTrash); setSelectedFolder(null); }}
                >
                    <Trash2 className="w-4 h-4" /> Trash
                </button>

                {tags.length > 0 && (
                    <>
                        <hr className="my-2" />
                        <span className="text-xs font-semibold text-gray-500 uppercase px-2">Tags</span>
                        {tags.map(t => (
                            <span key={t.id} className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                                {t.name}
                            </span>
                        ))}
                    </>
                )}
            </aside>

            {/* ── Main content ───────────────────────────────────────── */}
            <div className="flex-1 space-y-4 min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-display-sm text-gray-900 mb-1">
                            {showTrash ? 'Trash' : 'Documents'}
                        </h1>
                        <p className="text-body-md text-gray-600">
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
                    <div className="rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 text-sm flex items-start gap-2">
                        <span className="text-lg leading-none">🔒</span>
                        <div>
                            <p className="font-medium">Access Restricted</p>
                            <p className="mt-0.5">Contact your administrator to get access.</p>
                        </div>
                    </div>
                )}

                {error && !isForbidden && (
                    <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center justify-between">
                        <span>{error}</span>
                        <Button variant="ghost" size="sm" onClick={loadDocuments}>Retry</Button>
                    </div>
                )}

                {/* Search / Filters / View toggle */}
                {!isForbidden && (
                    <Card>
                        <div className="flex gap-3 items-center">
                            <div className="flex-1">
                                <Input placeholder="Search documents…" value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    leftIcon={<Search className="w-5 h-5" />} />
                            </div>
                            <select className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                                <option value="all">All Types</option>
                                <option value=".pdf">PDF</option><option value=".docx">DOCX</option>
                                <option value=".txt">TXT</option><option value=".csv">CSV</option>
                                <option value=".xlsx">XLSX</option>
                            </select>
                            <select className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                value={visibilityFilter} onChange={e => setVisibilityFilter(e.target.value)}>
                                <option value="all">All Visibility</option>
                                <option value="public">Public</option><option value="private">Private</option>
                                <option value="restricted">Restricted</option>
                            </select>
                            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                                <button className={`p-2 ${viewMode === 'list' ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:bg-gray-50'}`}
                                    onClick={() => setViewMode('list')} title="List view">
                                    <List className="w-4 h-4" />
                                </button>
                                <button className={`p-2 ${viewMode === 'grid' ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:bg-gray-50'}`}
                                    onClick={() => setViewMode('grid')} title="Grid view">
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Document List / Grid */}
                {!isForbidden && viewMode === 'list' && (
                    <Card>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Document</th>
                                        <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Type</th>
                                        <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Size</th>
                                        <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Uploaded By</th>
                                        <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Date</th>
                                        <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Status</th>
                                        <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Visibility</th>
                                        <th className="text-left py-3 px-4 text-label text-gray-600 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                                    ) : filteredDocuments.length === 0 ? (
                                        <EmptyState hasFilter={hasFilter} />
                                    ) : (
                                        filteredDocuments.map(doc => (
                                            <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                                                onClick={() => setDrawerDoc(doc)}>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                                                            <FileText className="w-5 h-5 text-brand-600" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="font-medium text-gray-900 truncate block max-w-[200px]">{doc.title}</span>
                                                            <span className="text-xs text-gray-400">
                                                                v{doc.current_version_number}
                                                                {doc.tags?.length > 0 && ` · ${doc.tags.slice(0, 2).join(', ')}`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-gray-600 text-sm uppercase">{doc.file_type}</td>
                                                <td className="py-3 px-4 text-gray-600 text-sm">{fmtSize(doc.file_size)}</td>
                                                <td className="py-3 px-4 text-gray-600 text-sm">{doc.uploaded_by_name}</td>
                                                <td className="py-3 px-4 text-gray-600 text-sm">{new Date(doc.created_at).toLocaleDateString()}</td>
                                                <td className="py-3 px-4">{statusBadge(doc.status)}</td>
                                                <td className="py-3 px-4">{visBadge(doc.visibility_type)}</td>
                                                <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center gap-1">
                                                        <button title="Download" className="p-1.5 text-gray-500 hover:text-brand-600 rounded"
                                                            onClick={() => handleDownload(doc)}><Download className="w-4 h-4" /></button>
                                                        {showTrash ? (
                                                            <button title="Restore" className="p-1.5 text-gray-500 hover:text-green-600 rounded"
                                                                onClick={() => handleRestore(doc)}><RotateCcw className="w-4 h-4" /></button>
                                                        ) : (
                                                            <button title="Delete" className="p-1.5 text-gray-500 hover:text-red-600 rounded"
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
                            <p className="text-xs text-gray-400 mt-4">
                                Showing {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? 's' : ''}
                            </p>
                        )}
                    </Card>
                )}

                {/* Grid view */}
                {!isForbidden && viewMode === 'grid' && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {loading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                                    <div className="h-10 w-10 bg-gray-200 rounded-lg mb-3" />
                                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                                </div>
                            ))
                        ) : filteredDocuments.length === 0 ? (
                            <div className="col-span-full py-16 text-center">
                                <FilePlus2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-600 font-medium">{hasFilter ? 'No matches' : 'No documents yet'}</p>
                            </div>
                        ) : (
                            filteredDocuments.map(doc => (
                                <div key={doc.id}
                                    className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                                    onClick={() => setDrawerDoc(doc)}>
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                                            <FileText className="w-5 h-5 text-brand-600" />
                                        </div>
                                        {statusBadge(doc.status)}
                                    </div>
                                    <h3 className="font-medium text-gray-900 truncate text-sm">{doc.title}</h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {doc.file_type?.toUpperCase()} · {fmtSize(doc.file_size)} · v{doc.current_version_number}
                                    </p>
                                    {doc.tags?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {doc.tags.slice(0, 3).map(t => (
                                                <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{t}</span>
                                            ))}
                                        </div>
                                    )}
                                    {doc.status === 'processing' && (
                                        <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                                            <div className="bg-brand-500 h-1 rounded-full" style={{ width: `${doc.processing_progress}%` }} />
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
                    <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setDrawerDoc(null)} />
                    <DocumentDrawer doc={drawerDoc} onClose={() => setDrawerDoc(null)}
                        onDownload={handleDownload} onReprocess={handleReprocess} addToast={addToast} />
                </>
            )}

            {/* ── Delete Modal ───────────────────────────────────────── */}
            <Modal isOpen={!!deleteTarget} onClose={() => !isDeleting && setDeleteTarget(null)} title="Delete Document">
                <div className="space-y-4">
                    <p className="text-gray-600 text-sm">
                        Move <span className="font-semibold text-gray-900">"{deleteTarget?.title}"</span> to trash?
                        You can restore it later.
                    </p>
                    <div className="flex gap-3 pt-1">
                        <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
                        <Button variant="danger" className="flex-1" onClick={handleDelete} loading={isDeleting}>Delete</Button>
                    </div>
                </div>
            </Modal>

            {/* ── Upload Modal ───────────────────────────────────────── */}
            <Modal isOpen={uploadModalOpen} onClose={closeUploadModal} title="Upload Document">
                <div className="space-y-4">
                    <input ref={fileInputRef} type="file"
                        accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.pptx,.md"
                        onChange={handleFileSelect} className="hidden" />

                    <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                        isDragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-400'
                    }`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-600 mb-1">Click to choose a file or drag and drop</p>
                        <p className="text-xs text-gray-400">PDF, DOCX, TXT, CSV, XLSX, PPTX, MD — max 50 MB</p>

                        {selectedFile && (
                            <div className="mt-4 p-3 bg-brand-50 rounded-lg flex items-center justify-between"
                                onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="w-5 h-5 text-brand-600 flex-shrink-0" />
                                    <span className="text-sm font-medium text-brand-900 truncate">{selectedFile.name}</span>
                                    <span className="text-xs text-brand-600 flex-shrink-0">({fmtSize(selectedFile.size)})</span>
                                </div>
                                <button className="text-brand-600 hover:text-brand-700 ml-2 flex-shrink-0"
                                    onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    <Input label="Document Title" placeholder="Enter a descriptive title"
                        value={documentTitle} onChange={e => setDocumentTitle(e.target.value)} disabled={isUploading} />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Visibility</label>
                        <select className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                            value={documentVisibility} onChange={e => setDocumentVisibility(e.target.value as VisType)} disabled={isUploading}>
                            <option value="public">Public — visible to all members</option>
                            <option value="restricted">Restricted — visible via access grants</option>
                            <option value="private">Private — only you can see it</option>
                        </select>
                    </div>

                    {isUploading && (
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-medium text-gray-600">
                                <span>Uploading…</span><span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-brand-500 h-2 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${uploadProgress}%` }} />
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <Button variant="secondary" className="flex-1" onClick={closeUploadModal} disabled={isUploading}>Cancel</Button>
                        <Button variant="primary" className="flex-1" onClick={handleUpload} loading={isUploading}>
                            {isUploading ? 'Uploading…' : 'Upload'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ── Create Folder Modal ────────────────────────────────── */}
            <Modal isOpen={folderModalOpen} onClose={() => setFolderModalOpen(false)} title="New Folder">
                <div className="space-y-4">
                    <Input label="Folder Name" placeholder="e.g. HR Policies"
                        value={newFolderName} onChange={e => setNewFolderName(e.target.value)} />
                    <div className="flex gap-3">
                        <Button variant="secondary" className="flex-1" onClick={() => setFolderModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" className="flex-1" onClick={handleCreateFolder}>Create</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
