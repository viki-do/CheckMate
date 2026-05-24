import axios from 'axios';
import { API_BASE } from '../config/api';

export const ANALYSIS_DRAFT_STORAGE_KEY = 'chess_analysis_cache';
const MIGRATION_KEY = 'checkmate_analysis_draft_migrated_to_db';

const authHeaders = () => {
  const token = localStorage.getItem('chessToken');
  return token ? { Authorization: `Bearer ${token}` } : null;
};

const hasAuth = () => Boolean(authHeaders());

export const readLocalAnalysisDraft = () => {
  try {
    const saved = localStorage.getItem(ANALYSIS_DRAFT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

export const writeLocalAnalysisDraft = (draft) => {
  if (!draft) {
    localStorage.removeItem(ANALYSIS_DRAFT_STORAGE_KEY);
    return;
  }
  localStorage.setItem(ANALYSIS_DRAFT_STORAGE_KEY, JSON.stringify(draft));
};

export const deleteLocalAnalysisDraft = () => {
  localStorage.removeItem(ANALYSIS_DRAFT_STORAGE_KEY);
};

const migrateLocalAnalysisDraft = async () => {
  if (!hasAuth() || localStorage.getItem(MIGRATION_KEY) === 'true') return null;

  const localDraft = readLocalAnalysisDraft();
  if (!localDraft) {
    localStorage.setItem(MIGRATION_KEY, 'true');
    return null;
  }

  try {
    const res = await axios.put(`${API_BASE}/analysis-drafts/current`, { draft: localDraft }, { headers: authHeaders() });
    localStorage.setItem(MIGRATION_KEY, 'true');
    writeLocalAnalysisDraft(res.data);
    return res.data;
  } catch {
    return null;
  }
};

export const loadCurrentAnalysisDraft = async ({ migrate = true } = {}) => {
  if (!hasAuth()) return readLocalAnalysisDraft();

  if (migrate) {
    const migrated = await migrateLocalAnalysisDraft();
    if (migrated) return migrated;
  }

  try {
    const res = await axios.get(`${API_BASE}/analysis-drafts/current`, { headers: authHeaders() });
    if (res.data) writeLocalAnalysisDraft(res.data);
    return res.data || readLocalAnalysisDraft();
  } catch {
    return readLocalAnalysisDraft();
  }
};

export const saveCurrentAnalysisDraft = async (draft) => {
  writeLocalAnalysisDraft(draft);
  if (!draft || !hasAuth()) return draft;

  try {
    const res = await axios.put(`${API_BASE}/analysis-drafts/current`, { draft }, { headers: authHeaders() });
    writeLocalAnalysisDraft(res.data);
    return res.data;
  } catch {
    return draft;
  }
};

export const deleteCurrentAnalysisDraft = async () => {
  deleteLocalAnalysisDraft();
  if (!hasAuth()) return { deleted: true };

  try {
    await axios.delete(`${API_BASE}/analysis-drafts/current`, { headers: authHeaders() });
  } catch {
    // Local cleanup is still the fallback source of truth if the API is unavailable.
  }
  return { deleted: true };
};
