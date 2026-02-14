import React, { useState } from 'react';
import { Search, Upload, FileText, Download, Trash2, Eye } from 'lucide-react';
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
    const [uploadModalOpen, setUploadModalOpen] = useState(false);

    // Mock data
    const documents: Document[] = [
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
    ];

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
                    <select className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option>All Types</option>
                        <option>PDF</option>
                        <option>DOCX</option>
                        <option>TXT</option>
                    </select>
                    <select className="px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option>All Visibility</option>
                        <option>Public</option>
                        <option>Private</option>
                        <option>Restricted</option>
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
                            {documents.map((doc) => (
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
                                            <button className="p-1.5 text-gray-600 hover:text-error-600 hover:bg-error-50 rounded transition-colors">
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
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-brand-500 transition-colors cursor-pointer">
                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-600 mb-1">Click to upload or drag and drop</p>
                        <p className="text-xs text-gray-500">PDF, DOCX, TXT up to 10MB</p>
                    </div>

                    <Input label="Document Title" placeholder="Enter document title" />

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Visibility
                        </label>
                        <select className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500">
                            <option>Public</option>
                            <option>Private</option>
                            <option>Restricted</option>
                        </select>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button variant="secondary" className="flex-1" onClick={() => setUploadModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" className="flex-1">
                            Upload
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
