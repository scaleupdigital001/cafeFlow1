/**
 * Centralized API & Socket Configuration for CafeFlow Frontend
 */

// Normalize API Base URL (strips trailing slash and optional trailing /api)
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '').replace(/\/api$/, '');

// Normalize Socket URL (strips trailing slash, falls back to API_BASE_URL if missing)
const rawSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
export const SOCKET_URL = rawSocketUrl.replace(/\/+$/, '').replace(/\/api$/, '');

/**
 * Helper to generate backend PDF download URLs
 */
export const getBackendBillUrl = (pdfPath: string): string => {
  const filename = pdfPath.split('/').pop() || '';
  return `${API_BASE_URL}/api/bills/download/${filename}`;
};
