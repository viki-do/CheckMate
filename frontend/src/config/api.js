export const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000').replace(/\/$/, '');
export const SOCKET_URL = API_BASE;
export const DEFAULT_AVATAR_SRC = '/assets/icons/noavatar.gif';

export const assetUrl = (path) => {
  if (!path) return '';
  return String(path).startsWith('http') ? path : `${API_BASE}${path}`;
};

export const profileAvatarSrc = (avatarUrl) => {
  if (!avatarUrl) return DEFAULT_AVATAR_SRC;
  return String(avatarUrl).startsWith('http') ? avatarUrl : assetUrl(avatarUrl);
};
