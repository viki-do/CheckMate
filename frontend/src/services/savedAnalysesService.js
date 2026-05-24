import axios from 'axios';
import { API_BASE } from '../config/api';
import { COLLECTIONS_STORAGE_KEY } from './collectionsService';

export const SAVED_ANALYSES_STORAGE_KEY = 'checkmate_saved_analyses';
const MIGRATION_KEY = 'checkmate_saved_analyses_migrated_to_db';
const LEGACY_SAVED_ANALYSIS_COLLECTION_NAME = 'Saved Analysis';

const authHeaders = () => {
  const token = localStorage.getItem('chessToken');
  return token ? { Authorization: `Bearer ${token}` } : null;
};

const hasAuth = () => Boolean(authHeaders());

export const readLocalSavedAnalyses = () => {
  try {
    const savedAnalyses = JSON.parse(localStorage.getItem(SAVED_ANALYSES_STORAGE_KEY) || '[]');
    const collections = JSON.parse(localStorage.getItem(COLLECTIONS_STORAGE_KEY) || '[]');
    const legacyCollection = collections.find((collection) => collection?.name === LEGACY_SAVED_ANALYSIS_COLLECTION_NAME);

    if (legacyCollection) {
      const legacyGames = Array.isArray(legacyCollection.games) ? legacyCollection.games : [];
      const mergedSavedAnalyses = [...savedAnalyses];

      legacyGames.forEach((legacyGame) => {
        const exists = mergedSavedAnalyses.some((savedGame) => String(savedGame.id) === String(legacyGame.id));
        if (!exists) mergedSavedAnalyses.push(legacyGame);
      });

      localStorage.setItem(SAVED_ANALYSES_STORAGE_KEY, JSON.stringify(mergedSavedAnalyses));
      localStorage.setItem(
        COLLECTIONS_STORAGE_KEY,
        JSON.stringify(collections.filter((collection) => collection?.name !== LEGACY_SAVED_ANALYSIS_COLLECTION_NAME))
      );
      return mergedSavedAnalyses;
    }

    return savedAnalyses;
  } catch {
    return [];
  }
};

export const writeLocalSavedAnalyses = (items) => {
  localStorage.setItem(SAVED_ANALYSES_STORAGE_KEY, JSON.stringify(items || []));
};

const upsertLocalSavedAnalysis = (analysis) => {
  if (!analysis?.id) return null;
  const current = readLocalSavedAnalyses();
  const existing = current.find((item) => String(item.id) === String(analysis.id));
  const nextAnalysis = {
    ...analysis,
    addedAt: existing?.addedAt || analysis.addedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const next = existing
    ? current.map((item) => (String(item.id) === String(analysis.id) ? nextAnalysis : item))
    : [nextAnalysis, ...current];
  writeLocalSavedAnalyses(next);
  return nextAnalysis;
};

const migrateLocalSavedAnalyses = async () => {
  if (!hasAuth() || localStorage.getItem(MIGRATION_KEY) === 'true') return null;

  const localItems = readLocalSavedAnalyses();
  if (!localItems.length) {
    localStorage.setItem(MIGRATION_KEY, 'true');
    return null;
  }

  try {
    for (const analysis of localItems) {
      if (!analysis?.id) continue;
      await axios.post(`${API_BASE}/saved-analyses`, { analysis }, { headers: authHeaders() });
    }
    localStorage.setItem(MIGRATION_KEY, 'true');
    const res = await axios.get(`${API_BASE}/saved-analyses`, { headers: authHeaders() });
    writeLocalSavedAnalyses(res.data || []);
    return res.data || [];
  } catch {
    return null;
  }
};

export const loadSavedAnalyses = async ({ migrate = true } = {}) => {
  if (!hasAuth()) return readLocalSavedAnalyses();

  if (migrate) {
    const migrated = await migrateLocalSavedAnalyses();
    if (migrated) return migrated;
  }

  try {
    const res = await axios.get(`${API_BASE}/saved-analyses`, { headers: authHeaders() });
    writeLocalSavedAnalyses(res.data || []);
    return res.data || [];
  } catch {
    return readLocalSavedAnalyses();
  }
};

export const saveAnalysis = async (analysis) => {
  if (!analysis?.id) return null;
  if (!hasAuth()) return upsertLocalSavedAnalysis(analysis);

  try {
    const res = await axios.post(`${API_BASE}/saved-analyses`, { analysis }, { headers: authHeaders() });
    upsertLocalSavedAnalysis(res.data);
    return res.data;
  } catch {
    return upsertLocalSavedAnalysis(analysis);
  }
};

export const getSavedAnalysis = async (analysisId) => {
  if (!analysisId) return null;
  if (hasAuth()) {
    try {
      const res = await axios.get(`${API_BASE}/saved-analyses/${encodeURIComponent(analysisId)}`, { headers: authHeaders() });
      upsertLocalSavedAnalysis(res.data);
      return res.data;
    } catch {
      // Fall through to local cache.
    }
  }
  return readLocalSavedAnalyses().find((item) => String(item.id) === String(analysisId)) || null;
};

export const deleteSavedAnalysis = async (analysisId) => {
  if (!analysisId) return { deleted: false };
  const removeLocal = () => {
    writeLocalSavedAnalyses(readLocalSavedAnalyses().filter((item) => String(item.id) !== String(analysisId)));
    return { deleted: true };
  };

  if (!hasAuth()) return removeLocal();
  try {
    await axios.delete(`${API_BASE}/saved-analyses/${encodeURIComponent(analysisId)}`, { headers: authHeaders() });
    return removeLocal();
  } catch {
    return removeLocal();
  }
};
