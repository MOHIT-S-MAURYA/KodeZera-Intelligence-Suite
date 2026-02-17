import React, { useState, useRef } from 'react';
import { Search, Upload, FileText, Download, Trash2, Eye, X } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';

interface Document {
    id: number;
    title: string;
    type: string;
    size: string;
    uploadedBy: string;
    uploadedAt: string;
    visibility: 'public' | 'private' | 'restricted';
}

export const Documents: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [visibilityFilter, setVisibilityFilter] = useState('all');
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [documentTitle, setDocumentTitle] = useState('');
    const [documentVisibility, setDocumentVisibility] = useState<'public' | 'private' | 'restricted'>('public');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Mock data - now stateful so we can add documents
    const [documents, setDocuments] = useState<Document[]>([
        {
            id: 1,
            title: 'Q4 Financial Report.pdf',
            type: 'PDF',
            size: '2.4 MB',
            uploadedBy: 'John Doe',
            uploadedAt: '2026-02-10',
            visibility: 'public',
        },
        {
            id: 2,
            title: 'Product Roadmap 2026.docx',
            type: 'DOCX',
            size: '1.8 MB',
            uploadedBy: 'Jane Smith',
            uploadedAt: '2026-02-12',
            visibility: 'restricted',
        },
        {
            id: 3,
            title: 'Team Meeting Notes.txt',
            type: 'TXT',
            size: '45 KB',
            uploadedBy: 'Mike Johnson',
            uploadedAt: '2026-02-14',
            visibility: 'private',
        },
    ]);

    // File upload handlers
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            validateAndSetFile(file);
        }
    };

    const validateAndSetFile = (file: File) => {
        // Validate file type
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please upload PDF, DOCX, or TXT files only');
            return;
        }

        // Validate file size (10MB max)
        const maxSize = 10 * 1024 * 1024; // 10MB in bytes
        if (file.size > maxSize) {
            alert('File size must be less than 10MB');
            return;
        }

        setSelectedFile(file);
        // Auto-fill title from filename
        if (!documentTitle) {
            setDocumentTitle(file.name);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (file) {
            validateAndSetFile(file);
        }
    };

    const handleUpload = () => {
        if (!selectedFile || !documentTitle) {
            alert('Please select a file and enter a title');
            return;
        }

        // Get file extension
        const fileExt = selectedFile.name.split('.').pop()?.toUpperCase() || 'FILE';

        // Format file size
        const formatSize = (bytes: number) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        };

        // Create new document
        const newDocument: Document = {
            id: documents.length + 1,
            title: documentTitle,
            type: fileExt,
            size: formatSize(selectedFile.size),
            uploadedBy: 'Current User', // In real app, get from auth
            uploadedAt: new Date().toISOString().split('T')[0],
            visibility: documentVisibility,
        };

        // Add to documents list
        setDocuments([newDocument, ...documents]);

        // Reset form and close modal
        setSelectedFile(null);
        setDocumentTitle('');
        setDocumentVisibility('public');
        setUploadModalOpen(false);

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleDeleteDocument = (id: number) => {
        if (confirm('Are you sure you want to delete this document?')) {
            setDocuments(documents.filter(doc => doc.id !== id));
        }
    };

    // Filter documents
    const filteredDocuments = documents.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || doc.type === typeFilter;
        const matchesVisibility = visibilityFilter === 'all' || doc.visibility === visibilityFilter;
        return matchesSearch && matchesType && matchesVisibility;
    });

    const getVisibilityBadge = (visibility: string) => {
        const variants: Record<string, 'success' | 'warning' | 'error'> = {
            public: 'success',
            restricted: 'warning',
            private: 'error',
        };
        return <Badge variant={variants[visibility]}>{visibility}</Badge>;
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display-sm text-gray-900 mb-2">Documents</h1>
                    <p className="text-body-md text-gray-600">
                        Manage and search your document library
                    </p>
                </div>
                <Button
                    variant="primary"
                    size="lg"
                    icon={<Upload className="w-5 h-5" />}
                    onClick={() => setUploadModalOpen(true)}
                >
                    Upload Document
                </Button>
            </div>

            {/* Search and Filters */}
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
                        className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                    >
                        <option value="all">All Types</option>
                        <option value="PDF">PDF</option>
                        <option value="DOCX">DOCX</option>
                        <option value="TXT">TXT</option>
                    </select>
                    <select
                        className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
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

            {/* Documents Table */}
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
                            {filteredDocuments.map((doc) => (
                                <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                                                <FileText className="w-5 h-5 text-brand-600" />
                                            </div>
                                            <span className="font-medium text-gray-900">{doc.title}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-gray-600">{doc.type}</td>
                                    <td className="py-3 px-4 text-gray-600">{doc.size}</td>
                                    <td className="py-3 px-4 text-gray-600">{doc.uploadedBy}</td>
                                    <td className="py-3 px-4 text-gray-600">{doc.uploadedAt}</td>
                                    <td className="py-3 px-4">{getVisibilityBadge(doc.visibility)}</td>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <button className="p-1.5 text-gray-600 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button className="p-1.5 text-gray-600 hover:text-info-600 hover:bg-info-50 rounded transition-colors">
                                                <Download className="w-4 h-4" />
                                            </button>
                                            <button
                                                className="p-1.5 text-gray-600 hover:text-error-600 hover:bg-error-50 rounded transition-colors"
                                                onClick={() => handleDeleteDocument(doc.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Upload Modal */}
            <Modal
                isOpen={uploadModalOpen}
                onClose={() => setUploadModalOpen(false)}
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

                    {/* Upload area */}
                    <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-500'
                            }`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-600 mb-1">Click to upload or drag and drop</p>
                        <p className="text-xs text-gray-500">PDF, DOCX, TXT up to 10MB</p>

                        {selectedFile && (
                            <div className="mt-4 p-3 bg-brand-50 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-brand-600" />
                                    <span className="text-sm font-medium text-brand-900">{selectedFile.name}</span>
                                    <span className="text-xs text-brand-600">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="text-brand-600 hover:text-brand-700"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    <Input
                        label="Document Title"
                        placeholder="Enter document title"
                        value={documentTitle}
                        onChange={(e) => setDocumentTitle(e.target.value)}
                    />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Visibility
                        </label>
                        <select
                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            value={documentVisibility}
                            onChange={(e) => setDocumentVisibility(e.target.value as 'public' | 'private' | 'restricted')}
                        >
                            <option value="public">Public</option>
                            <option value="private">Private</option>
                            <option value="restricted">Restricted</option>
                        </select>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button variant="secondary" className="flex-1" onClick={() => setUploadModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" className="flex-1" onClick={handleUpload}>
                            Upload
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
