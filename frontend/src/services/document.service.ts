import axios from 'axios';
import api from './api';

export interface Document {
    id: number;
    title: string;
    file_type: string;
    file_size: number;
    uploaded_by: {
        id: number;
        first_name: string;
        last_name: string;
    };
    created_at: string;
    visibility_type: 'public' | 'private' | 'restricted';
    status: 'pending' | 'processing' | 'completed' | 'failed';
}

export const documentService = {
    getDocuments: async (): Promise<Document[]> => {
        const response = await api.get('/documents/');
        return response.data.results || response.data;
    },

    deleteDocument: async (id: number): Promise<void> => {
        await api.delete(`/documents/${id}/`);
    },

    uploadDocument: async (
        file: File,
        title: string,
        visibilityType: 'public' | 'private' | 'restricted',
        onProgress?: (progressEvent: any) => void
    ): Promise<Document> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('visibility_type', visibilityType);

        // We cannot use the default `api` instance because it injects 
        // `Content-Type: application/json` which forces a 415 error on FormData.
        // We must let the browser dynamically set the multipart boundary.
        const token = localStorage.getItem('accessToken');
        const uploadApi = axios.create({
            baseURL: api.defaults.baseURL,
        });

        const response = await uploadApi.post('/documents/upload/', formData, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            onUploadProgress: onProgress
        });
        return response.data;
    },
};
