import axios from 'axios';
import api from './api';

// ── Types ────────────────────────────────────────────────────────────────

export interface Document {
    id: string;
    title: string;
    description: string;
    file_key: string;
    file_path: string;
    file_type: string;
    file_size: number;
    original_filename: string;
    mime_type: string;
    content_hash: string;
    page_count: number;
    language: string;
    author: string;
    uploaded_by: string;
    uploaded_by_name: string;
    department: string | null;
    department_name: string | null;
    folder: string | null;
    folder_name: string | null;
    classification_level: number;
    visibility_type: 'public' | 'private' | 'restricted';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    processing_progress: number;
    processing_error: string;
    chunk_count: number;
    current_version_number: number;
    tags: string[];
    is_deleted: boolean;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface DocumentVersion {
    id: string;
    document: string;
    version_number: number;
    file_key: string;
    file_size: number;
    content_hash: string;
    original_filename: string;
    mime_type: string;
    change_note: string;
    uploaded_by: string;
    uploaded_by_name: string;
    created_at: string;
}

export interface DocumentFolder {
    id: string;
    name: string;
    parent: string | null;
    owner: string | null;
    is_shared: boolean;
    document_count: number;
    children_count: number;
    created_at: string;
}

export interface DocumentTag {
    id: string;
    name: string;
    color: string;
    category: 'manual' | 'auto';
    created_at: string;
}

export interface DocumentAccess {
    id: string;
    document: string;
    access_type: string;
    role: string | null;
    org_unit: string | null;
    user: string | null;
    permission_level: 'read' | 'write' | 'manage';
    include_descendants: boolean;
    granted_by: string | null;
    grantee_name: string;
    expires_at: string | null;
    created_at: string;
}

// ── Upload helper (needs custom axios to avoid Content-Type override) ────

function uploadApi() {
    const token = localStorage.getItem('accessToken');
    return axios.create({
        baseURL: api.defaults.baseURL,
        headers: { Authorization: `Bearer ${token}` },
    });
}

// ── Service ──────────────────────────────────────────────────────────────

export const documentService = {

    // ── Documents CRUD ───────────────────────────────────────────────

    getDocuments: async (params?: Record<string, string>): Promise<Document[]> => {
        const response = await api.get('/documents/', { params });
        return response.data.results || response.data;
    },

    getDocument: async (id: string): Promise<Document> => {
        const response = await api.get(`/documents/${id}/`);
        return response.data;
    },

    updateDocument: async (id: string, data: Partial<Document>): Promise<Document> => {
        const response = await api.patch(`/documents/${id}/`, data);
        return response.data;
    },

    deleteDocument: async (id: string): Promise<void> => {
        await api.delete(`/documents/${id}/`);
    },

    permanentDelete: async (id: string): Promise<void> => {
        await api.delete(`/documents/${id}/permanent-delete/`);
    },

    // ── Upload ───────────────────────────────────────────────────────

    uploadDocument: async (
        file: File,
        title: string,
        visibilityType: 'public' | 'private' | 'restricted',
        onProgress?: (progressEvent: any) => void,
        extra?: { description?: string; folder?: string; classification_level?: number },
    ): Promise<Document> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('visibility_type', visibilityType);
        if (extra?.description) formData.append('description', extra.description);
        if (extra?.folder) formData.append('folder', extra.folder);
        if (extra?.classification_level !== undefined)
            formData.append('classification_level', String(extra.classification_level));

        const response = await uploadApi().post('/documents/upload/', formData, {
            onUploadProgress: onProgress,
        });
        return response.data;
    },

    bulkUpload: async (
        files: File[],
        visibilityType: string = 'restricted',
        onProgress?: (progressEvent: any) => void,
    ): Promise<any[]> => {
        const formData = new FormData();
        files.forEach((f, i) => formData.append(`file_${i}`, f));
        formData.append('visibility_type', visibilityType);
        const response = await uploadApi().post('/documents/bulk-upload/', formData, {
            onUploadProgress: onProgress,
        });
        return response.data;
    },

    // ── Download ─────────────────────────────────────────────────────

    downloadDocument: async (id: string, filename: string): Promise<void> => {
        const response = await api.get(`/documents/${id}/download/`, {
            responseType: 'blob',
        });
        const url = URL.createObjectURL(response.data as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // ── Trash / Restore ──────────────────────────────────────────────

    getTrash: async (): Promise<Document[]> => {
        const response = await api.get('/documents/trash/');
        return response.data;
    },

    restoreDocument: async (id: string): Promise<Document> => {
        const response = await api.post(`/documents/${id}/restore/`);
        return response.data;
    },

    // ── Reprocess ────────────────────────────────────────────────────

    reprocessDocument: async (id: string): Promise<Document> => {
        const response = await api.post(`/documents/${id}/reprocess/`);
        return response.data;
    },

    getProgress: async (id: string): Promise<number> => {
        const response = await api.get(`/documents/${id}/progress/`);
        return response.data.progress;
    },

    // ── Versions ─────────────────────────────────────────────────────

    getVersions: async (id: string): Promise<DocumentVersion[]> => {
        const response = await api.get(`/documents/${id}/versions/`);
        return response.data;
    },

    uploadVersion: async (
        id: string, file: File, changeNote: string = '',
        onProgress?: (e: any) => void,
    ): Promise<DocumentVersion> => {
        const formData = new FormData();
        formData.append('file', file);
        if (changeNote) formData.append('change_note', changeNote);
        const response = await uploadApi().post(`/documents/${id}/versions/`, formData, {
            onUploadProgress: onProgress,
        });
        return response.data;
    },

    downloadVersion: async (docId: string, versionNumber: number, filename: string): Promise<void> => {
        const response = await api.get(
            `/documents/${docId}/versions/${versionNumber}/download/`,
            { responseType: 'blob' },
        );
        const url = URL.createObjectURL(response.data as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    restoreVersion: async (docId: string, versionNumber: number): Promise<Document> => {
        const response = await api.post(`/documents/${docId}/versions/${versionNumber}/restore/`);
        return response.data;
    },

    // ── Access grants ────────────────────────────────────────────────

    getAccess: async (id: string): Promise<DocumentAccess[]> => {
        const response = await api.get(`/documents/${id}/access/`);
        return response.data;
    },

    createAccess: async (id: string, data: Partial<DocumentAccess>): Promise<DocumentAccess> => {
        const response = await api.post(`/documents/${id}/access/`, data);
        return response.data;
    },

    revokeAccess: async (docId: string, grantId: string): Promise<void> => {
        await api.delete(`/documents/${docId}/access/${grantId}/`);
    },

    getEffectiveAccess: async (id: string): Promise<{ permission_level: string }> => {
        const response = await api.get(`/documents/${id}/access/effective/`);
        return response.data;
    },

    // ── Folders ──────────────────────────────────────────────────────

    getFolders: async (): Promise<DocumentFolder[]> => {
        const response = await api.get('/document-folders/');
        return response.data.results || response.data;
    },

    createFolder: async (data: { name: string; parent?: string | null }): Promise<DocumentFolder> => {
        const response = await api.post('/document-folders/', data);
        return response.data;
    },

    updateFolder: async (id: string, data: Partial<DocumentFolder>): Promise<DocumentFolder> => {
        const response = await api.patch(`/document-folders/${id}/`, data);
        return response.data;
    },

    deleteFolder: async (id: string): Promise<void> => {
        await api.delete(`/document-folders/${id}/`);
    },

    // ── Tags ─────────────────────────────────────────────────────────

    getTags: async (): Promise<DocumentTag[]> => {
        const response = await api.get('/document-tags/');
        return response.data.results || response.data;
    },

    createTag: async (data: { name: string; color?: string }): Promise<DocumentTag> => {
        const response = await api.post('/document-tags/', data);
        return response.data;
    },

    deleteTag: async (id: string): Promise<void> => {
        await api.delete(`/document-tags/${id}/`);
    },

    getDocumentTags: async (docId: string): Promise<any[]> => {
        const response = await api.get(`/documents/${docId}/tags/`);
        return response.data;
    },

    assignTag: async (docId: string, tagId: string): Promise<any> => {
        const response = await api.post(`/documents/${docId}/tags/`, { tag: tagId });
        return response.data;
    },

    removeTag: async (docId: string, tagId: string): Promise<void> => {
        await api.delete(`/documents/${docId}/tags/${tagId}/`);
    },
};
