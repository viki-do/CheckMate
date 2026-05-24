export const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/$/, '');
export const SOCKET_URL = API_BASE;

export const assetUrl = (path) => {
  if (!path) return '';
  return String(path).startsWith('http') ? path : `${API_BASE}${path}`;
};
