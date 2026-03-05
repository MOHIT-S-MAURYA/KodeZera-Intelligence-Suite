/**
 * Extracts a user-friendly error message from an Axios (or unknown) error.
 *
 *  - HTTP 403  → permission-denied message
 *  - HTTP 401  → session-expired message (shouldn't normally happen post-refresh)
 *  - API detail field present → use the server's own message
 *  - Otherwise → caller-supplied fallback
 */
export function getApiError(err: unknown, fallback: string): string {
    if (err && typeof err === 'object' && 'response' in err) {
        const response = (
            err as { response?: { status?: number; data?: { detail?: string } } }
        ).response;

        if (response?.status === 403) {
            return "You don't have permission to access this resource. Contact your administrator.";
        }
        if (response?.status === 401) {
            return 'Your session has expired. Please log in again.';
        }
        if (response?.data?.detail) {
            return response.data.detail;
        }
    }
    return fallback;
}
