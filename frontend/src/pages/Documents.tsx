/**
 * Documents.tsx
 * 
 * Fixes applied (v2):
 *  - Bug #1: Backend now returns HTTP 200 for all authenticated members; frontend
 *    handles 403 gracefully via a dedicated permission-error state instead of a
 *    silent empty table.
 *  - Bug #2: All native alert() / confirm() calls replaced with:
 *      • addToast('error', …)  for validation & failure feedback
 *      • Custom <Modal> for delete confirmation
 *  - Added loading skeleton while fetching documents
 *  - Added proper empty-state UI (icon + message) for zero documents
 *  - Download button is disabled with a tooltip until the backend endpoint exists
 *  - Success toast on successful upload
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Upload, FileText, Download, Trash2, Eye, X, FilePlus2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useUIStore } from '../store/ui.store';

import { documentService } from '../services/document.service';
import type { Document } from '../services/document.service';

// ── Types ──────────────────────────────────────────────────────────────────────

type VisType = 'public' | 'private' | 'restricted';

// ── Skeleton row ──────────────────────────────────────────────────────────────

const SkeletonRow: React.FC = () => (
    <tr className="border-b border-gray-100">
        {[180, 60, 60, 120, 90, 80, 90].map((w, i) => (
            <td key={i} className="py-3 px-4">
                <div className={`h-4 bg-gray-200 rounded animate-pulse`} style={{ width: w }} />
            </td>
        ))}
    </tr>
);

// ── Empty state ───────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ hasFilter: boolean }> = ({ hasFilter }) => (
    <tr>
        <td colSpan={7} className="py-16 text-center">
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

// ── Component ─────────────────────────────────────────────────────────────────

export const Documents: React.FC = () => {
    const { addToast } = useUIStore();

    // ── Data state ────────────────────────────────────────────────────────
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isForbidden, setIsForbidden] = useState(false);

    // ── Filter state ──────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [visibilityFilter, setVisibilityFilter] = useState('all');

    // ── Upload modal state ────────────────────────────────────────────────
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [documentTitle, setDocumentTitle] = useState('');
    const [documentVisibility, setDocumentVisibility] = useState<VisType>('public');
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Delete confirmation modal ─────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // ── Load documents ────────────────────────────────────────────────────
    const loadDocuments = useCallback(async () => {
        setLoading(true);
        setError(null);
        setIsForbidden(false);
        try {
            const data = await documentService.getDocuments();
            setDocuments(data);
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } }).response?.status;
            if (status === 403) {
                setIsForbidden(true);
            } else {
                setError('Failed to load documents. Please check your connection and try again.');
                addToast('error', 'Failed to load documents.');
            }
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadDocuments(); }, [loadDocuments]);

    // ── File validation ───────────────────────────────────────────────────
    const validateAndSetFile = (file: File) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
        ];
        if (!allowedTypes.includes(file.type)) {
            addToast('error', 'Only PDF, DOCX, or TXT files are allowed.');
            return false;
        }
        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (file.size > maxSize) {
            addToast('error', 'File size must be less than 10 MB.');
            return false;
        }
        setSelectedFile(file);
        if (!documentTitle) setDocumentTitle(file.name.replace(/\.[^.]+$/, ''));
        return true;
    };

    // ── Drag-and-drop handlers ────────────────────────────────────────────
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) validateAndSetFile(file);
    };
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) validateAndSetFile(file);
    };

    // ── Upload ────────────────────────────────────────────────────────────
    const handleUpload = async () => {
        if (!selectedFile) {
            addToast('error', 'Please select a file to upload.');
            return;
        }
        if (!documentTitle.trim()) {
            addToast('error', 'Please enter a document title.');
            return;
        }
        setIsUploading(true);
        setUploadProgress(0);
        try {
            const uploaded = await documentService.uploadDocument(
                selectedFile,
                documentTitle.trim(),
                documentVisibility,
                (e) => {
                    if (e.total) setUploadProgress(Math.round((e.loaded * 100) / e.total));
                }
            );
            setDocuments(prev => [uploaded, ...prev]);
            addToast('success', `"${uploaded.title}" uploaded successfully.`);
            // Reset modal
            setSelectedFile(null);
            setDocumentTitle('');
            setDocumentVisibility('public');
            setUploadProgress(0);
            setUploadModalOpen(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch {
            addToast('error', 'Failed to upload document. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    // ── Delete ────────────────────────────────────────────────────────────
    const confirmDelete = (doc: Document) => setDeleteTarget(doc);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await documentService.deleteDocument(deleteTarget.id);
            setDocuments(prev => prev.filter(d => d.id !== deleteTarget.id));
            addToast('success', `"${deleteTarget.title}" deleted.`);
            setDeleteTarget(null);
        } catch {
            addToast('error', 'Failed to delete document. Please try again.');
        } finally {
            setIsDeleting(false);
        }
    };

    // ── Filtered list ─────────────────────────────────────────────────────
    const hasFilter = !!(searchQuery || typeFilter !== 'all' || visibilityFilter !== 'all');
    const filteredDocuments = documents.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || doc.file_type === typeFilter;
        const matchesVisibility = visibilityFilter === 'all' || doc.visibility_type === visibilityFilter;
        return matchesSearch && matchesType && matchesVisibility;
    });

    // ── Visibility badge ──────────────────────────────────────────────────
    const getVisibilityBadge = (visibility: string) => {
        const variants: Record<string, 'success' | 'warning' | 'error'> = {
            public: 'success',
            restricted: 'warning',
            private: 'error',
        };
        return <Badge variant={variants[visibility] ?? 'default'}>{visibility}</Badge>;
    };

    // ── Reset upload modal ────────────────────────────────────────────────
    const closeUploadModal = () => {
        if (isUploading) return; // block close during upload
        setUploadModalOpen(false);
        setSelectedFile(null);
        setDocumentTitle('');
        setDocumentVisibility('public');
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Documents</h1>
                    <p className="text-body-md text-gray-600">Manage and search your document library</p>
                </div>
                <Button
                    variant="primary"
                    size="lg"
                    icon={<Upload className="w-5 h-5" />}
                    onClick={() => setUploadModalOpen(true)}
                    disabled={isForbidden}
                >
                    Upload Document
                </Button>
            </div>

            {/* Forbidden state */}
            {isForbidden && (
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 text-sm flex items-start gap-2">
                    <span className="text-lg leading-none">🔒</span>
                    <div>
                        <p className="font-medium">Access Restricted</p>
                        <p className="mt-0.5">You don't have permission to view documents. Contact your administrator to get access.</p>
                    </div>
                </div>
            )}

            {/* Generic error state */}
            {error && !isForbidden && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center justify-between">
                    <span>{error}</span>
                    <Button variant="ghost" size="sm" onClick={loadDocuments}>Retry</Button>
                </div>
            )}

            {/* Search and Filters */}
            {!isForbidden && (
                <Card>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <Input
                                placeholder="Search documents..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                leftIcon={<Search className="w-5 h-5" />}
                            />
                        </div>
                        <select
                            className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                        >
                            <option value="all">All Types</option>
                            <option value=".pdf">PDF</option>
                            <option value=".docx">DOCX</option>
                            <option value=".txt">TXT</option>
                        </select>
                        <select
                            className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                            value={visibilityFilter}
                            onChange={(e) => setVisibilityFilter(e.target.value)}
                        >
                            <option value="all">All Visibility</option>
                            <option value="public">Public</option>
                            <option value="private">Private</option>
                            <option value="restricted">Restricted</option>
                        </select>
                    </div>
                </Card>
            )}

            {/* Documents Table */}
            {!isForbidden && (
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
                                    filteredDocuments.map((doc) => (
                                        <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                                                        <FileText className="w-5 h-5 text-brand-600" />
                                                    </div>
                                                    <span className="font-medium text-gray-900 truncate max-w-[220px]">{doc.title}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-gray-600 text-sm uppercase">{doc.file_type}</td>
                                            <td className="py-3 px-4 text-gray-600 text-sm">{(doc.file_size / 1024).toFixed(1)} KB</td>
                                            <td className="py-3 px-4 text-gray-600 text-sm">
                                                {doc.uploaded_by?.first_name} {doc.uploaded_by?.last_name}
                                            </td>
                                            <td className="py-3 px-4 text-gray-600 text-sm">
                                                {new Date(doc.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="py-3 px-4">{getVisibilityBadge(doc.visibility_type)}</td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-1">
                                                    {/* View */}
                                                    <button
                                                        title="View document"
                                                        className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    {/* Download — disabled until backend endpoint is implemented */}
                                                    <button
                                                        title="Download coming soon"
                                                        disabled
                                                        className="p-1.5 text-gray-300 cursor-not-allowed rounded"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                    {/* Delete */}
                                                    <button
                                                        title="Delete document"
                                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                        onClick={() => confirmDelete(doc)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer count */}
                    {!loading && !isForbidden && (
                        <p className="text-xs text-gray-400 mt-4">
                            Showing {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? 's' : ''}
                        </p>
                    )}
                </Card>
            )}

            {/* ── Delete Confirmation Modal ───────────────────────────────────── */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => !isDeleting && setDeleteTarget(null)}
                title="Delete Document"
            >
                <div className="space-y-4">
                    <p className="text-gray-600 text-sm">
                        Are you sure you want to delete{' '}
                        <span className="font-semibold text-gray-900">"{deleteTarget?.title}"</span>?
                        This will also remove all associated AI embeddings and cannot be undone.
                    </p>
                    <div className="flex gap-3 pt-1">
                        <Button
                            variant="secondary"
                            className="flex-1"
                            onClick={() => setDeleteTarget(null)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            className="flex-1"
                            onClick={handleDelete}
                            loading={isDeleting}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ── Upload Modal ───────────────────────────────────────────────── */}
            <Modal
                isOpen={uploadModalOpen}
                onClose={closeUploadModal}
                title="Upload Document"
            >
                <div className="space-y-4">
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt"
                        onChange={handleFileSelect}
                        className="hidden"
                    />

                    {/* Drop zone */}
                    <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging
                                ? 'border-brand-500 bg-brand-50'
                                : 'border-gray-300 hover:border-brand-400'
                            }`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-600 mb-1">Click to choose a file or drag and drop here</p>
                        <p className="text-xs text-gray-400">PDF, DOCX, TXT — max 10 MB</p>

                        {selectedFile && (
                            <div
                                className="mt-4 p-3 bg-brand-50 rounded-lg flex items-center justify-between"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="w-5 h-5 text-brand-600 flex-shrink-0" />
                                    <span className="text-sm font-medium text-brand-900 truncate">{selectedFile.name}</span>
                                    <span className="text-xs text-brand-600 flex-shrink-0">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                                </div>
                                <button
                                    className="text-brand-600 hover:text-brand-700 ml-2 flex-shrink-0"
                                    onClick={() => {
                                        setSelectedFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    <Input
                        label="Document Title"
                        placeholder="Enter a descriptive title"
                        value={documentTitle}
                        onChange={(e) => setDocumentTitle(e.target.value)}
                        disabled={isUploading}
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Visibility</label>
                        <select
                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                            value={documentVisibility}
                            onChange={(e) => setDocumentVisibility(e.target.value as VisType)}
                            disabled={isUploading}
                        >
                            <option value="public">Public — visible to all members</option>
                            <option value="restricted">Restricted — visible via access grants</option>
                            <option value="private">Private — only you can see it</option>
                        </select>
                    </div>

                    {isUploading && (
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-medium text-gray-600">
                                <span>Uploading…</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-brand-500 h-2 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <Button variant="secondary" className="flex-1" onClick={closeUploadModal} disabled={isUploading}>
                            Cancel
                        </Button>
                        <Button variant="primary" className="flex-1" onClick={handleUpload} loading={isUploading}>
                            {isUploading ? 'Uploading…' : 'Upload'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
