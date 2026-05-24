export const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/$/, '');
export const SOCKET_URL = API_BASE;
export const DEFAULT_AVATAR_SRC = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="10" fill="#d7d6d4"/>
  <circle cx="60" cy="42" r="22" fill="#9c9a96"/>
  <path d="M22 104c5-26 22-40 38-40s33 14 38 40" fill="#9c9a96"/>
</svg>
`)}`;

export const assetUrl = (path) => {
  if (!path) return '';
  return String(path).startsWith('http') ? path : `${API_BASE}${path}`;
};

export const profileAvatarSrc = (avatarUrl) => {
  if (!avatarUrl) return DEFAULT_AVATAR_SRC;
  return String(avatarUrl).startsWith('http') ? avatarUrl : assetUrl(avatarUrl);
};
