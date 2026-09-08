/**
 * API configuration - single source for backend URL
 * If VITE_API_URL is set, it will be used as the base prefix.
 * In development, leaving it empty allows Vite proxy to forward '/api' to backend.
 */
export const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
export const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || (API_BASE ? `${API_BASE}/api` : '/api');
