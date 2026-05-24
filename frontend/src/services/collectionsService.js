import axios from 'axios';
import { API_BASE } from '../config/api';

export const COLLECTIONS_STORAGE_KEY = 'checkmate_game_collections';
const MIGRATION_KEY = 'checkmate_collections_migrated_to_db';
const PUBLIC_ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const createPublicId = (length = 9) => {
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => PUBLIC_ID_CHARS[value % PUBLIC_ID_CHARS.length]).join('');
};

export const slugifyCollectionName = (name) => (
  String(name || 'collection')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'collection'
);

export const getCollectionSlug = (collection) => `${slugifyCollectionName(collection?.name)}-${collection?.publicId}`;

export const getCollectionGames = (collection) => (
  Array.isArray(collection?.games) ? collection.games : []
);

export const normalizeCollection = (collection) => {
  const games = getCollectionGames(collection);
  return {
    ...collection,
    publicId: collection.publicId || createPublicId(),
    games,
    gameCount: Number.isFinite(Number(collection.gameCount)) ? Number(collection.gameCount) : games.length,
  };
};

export const readLocalCollections = () => {
  try {
    return JSON.parse(localStorage.getItem(COLLECTIONS_STORAGE_KEY) || '[]').map(normalizeCollection);
  } catch {
    return [];
  }
};

export const writeLocalCollections = (collections) => {
  localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify((collections || []).map(normalizeCollection)));
};

export const notifyCollectionsUpdated = () => {
  window.dispatchEvent(new CustomEvent('checkmate:collections-updated'));
};

const authHeaders = () => {
  const token = localStorage.getItem('chessToken');
  return token ? { Authorization: `Bearer ${token}` } : null;
};

const hasAuth = () => Boolean(authHeaders());

const upsertLocalCollection = (collection) => {
  const normalized = normalizeCollection(collection);
  const current = readLocalCollections();
  const exists = current.some((item) => item.id === normalized.id || item.publicId === normalized.publicId);
  const next = exists
    ? current.map((item) => (item.id === normalized.id || item.publicId === normalized.publicId ? normalized : item))
    : [normalized, ...current];
  writeLocalCollections(next);
  return normalized;
};

const localCreateCollection = (data) => {
  const now = new Date().toISOString();
  const collection = normalizeCollection({
    id: data.id || crypto.randomUUID(),
    publicId: data.publicId || createPublicId(),
    name: data.name,
    ownerName: data.ownerName || localStorage.getItem('chessUsername') || 'VikhiKeh',
    privacy: data.privacy || 'public',
    participants: data.participants || [],
    games: data.games || [],
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
  });
  const collections = [collection, ...readLocalCollections()];
  writeLocalCollections(collections);
  return collection;
};

const localAddGame = (collectionIdentifier, game) => {
  let target = null;
  const now = new Date().toISOString();
  const collections = readLocalCollections().map((collection) => {
    const isTarget = collection.id === collectionIdentifier
      || collection.publicId === collectionIdentifier
      || getCollectionSlug(collection) === collectionIdentifier;
    if (!isTarget) return collection;

    const games = getCollectionGames(collection);
    const existing = games.find((savedGame) => String(savedGame.id) === String(game.id));
    const nextGame = {
      ...game,
      addedAt: existing?.addedAt || game.addedAt || now,
      updatedAt: now,
    };
    const nextGames = existing
      ? games.map((savedGame) => (String(savedGame.id) === String(game.id) ? nextGame : savedGame))
      : [nextGame, ...games];
    target = normalizeCollection({
      ...collection,
      games: nextGames,
      updatedAt: now,
    });
    return target;
  });
  writeLocalCollections(collections);
  return target;
};

const localRemoveGame = (collectionIdentifier, gameId) => {
  let target = null;
  const collections = readLocalCollections().map((collection) => {
    const isTarget = collection.id === collectionIdentifier
      || collection.publicId === collectionIdentifier
      || getCollectionSlug(collection) === collectionIdentifier;
    if (!isTarget) return collection;
    const nextGames = getCollectionGames(collection).filter((game) => String(game.id) !== String(gameId));
    target = normalizeCollection({
      ...collection,
      games: nextGames,
      updatedAt: new Date().toISOString(),
    });
    return target;
  });
  writeLocalCollections(collections);
  return target;
};

const localDeleteCollection = (collectionIdentifier) => {
  const next = readLocalCollections().filter((collection) => !(
    collection.id === collectionIdentifier
    || collection.publicId === collectionIdentifier
    || getCollectionSlug(collection) === collectionIdentifier
  ));
  writeLocalCollections(next);
  return { deleted: true };
};

const migrateLocalCollections = async () => {
  if (!hasAuth() || localStorage.getItem(MIGRATION_KEY) === 'true') return null;

  const localCollections = readLocalCollections();
  if (!localCollections.length) {
    localStorage.setItem(MIGRATION_KEY, 'true');
    return null;
  }

  const headers = authHeaders();
  try {
    const remoteRes = await axios.get(`${API_BASE}/collections`, { headers });
    const remote = (remoteRes.data || []).map(normalizeCollection);
    const remotePublicIds = new Set(remote.map((collection) => collection.publicId));

    for (const collection of localCollections) {
      if (remotePublicIds.has(collection.publicId)) continue;
      const createdRes = await axios.post(`${API_BASE}/collections`, {
        name: collection.name,
        publicId: collection.publicId,
        privacy: collection.privacy || 'public',
        participants: collection.participants || [],
      }, { headers });
      const created = normalizeCollection(createdRes.data);

      for (const game of getCollectionGames(collection).slice().reverse()) {
        await axios.post(`${API_BASE}/collections/${created.id}/games`, { game }, { headers });
      }
    }

    localStorage.setItem(MIGRATION_KEY, 'true');
    const finalRes = await axios.get(`${API_BASE}/collections`, { headers });
    const finalCollections = (finalRes.data || []).map(normalizeCollection);
    writeLocalCollections(finalCollections);
    return finalCollections;
  } catch {
    return null;
  }
};

export const loadCollections = async ({ migrate = true } = {}) => {
  if (!hasAuth()) return readLocalCollections();

  if (migrate) {
    const migrated = await migrateLocalCollections();
    if (migrated) return migrated;
  }

  try {
    const res = await axios.get(`${API_BASE}/collections`, { headers: authHeaders() });
    const collections = (res.data || []).map(normalizeCollection);
    writeLocalCollections(collections);
    return collections;
  } catch {
    return readLocalCollections();
  }
};

export const createCollection = async (data) => {
  if (!hasAuth()) return localCreateCollection(data);
  try {
    const res = await axios.post(`${API_BASE}/collections`, {
      name: data.name,
      publicId: data.publicId,
      privacy: data.privacy || 'public',
      participants: data.participants || [],
    }, { headers: authHeaders() });
    const collection = normalizeCollection({ ...res.data, games: data.games || res.data.games || [] });
    upsertLocalCollection(collection);
    notifyCollectionsUpdated();
    return collection;
  } catch {
    const collection = localCreateCollection(data);
    notifyCollectionsUpdated();
    return collection;
  }
};

export const addGameToCollection = async (collectionIdentifier, game) => {
  if (!hasAuth()) {
    const collection = localAddGame(collectionIdentifier, game);
    notifyCollectionsUpdated();
    return collection;
  }
  try {
    const res = await axios.post(`${API_BASE}/collections/${encodeURIComponent(collectionIdentifier)}/games`, { game }, { headers: authHeaders() });
    const collection = normalizeCollection(res.data);
    upsertLocalCollection(collection);
    notifyCollectionsUpdated();
    return collection;
  } catch {
    const collection = localAddGame(collectionIdentifier, game);
    notifyCollectionsUpdated();
    return collection;
  }
};

export const addGamesToCollection = async (collectionIdentifier, gamesToAdd = []) => {
  let target = null;
  for (const game of gamesToAdd) {
    target = await addGameToCollection(collectionIdentifier, game);
  }
  return target;
};

export const updateCollection = async (collectionIdentifier, updates) => {
  if (!hasAuth()) {
    const collections = readLocalCollections().map((collection) => {
      const isTarget = collection.id === collectionIdentifier
        || collection.publicId === collectionIdentifier
        || getCollectionSlug(collection) === collectionIdentifier;
      return isTarget ? normalizeCollection({ ...collection, ...updates, updatedAt: new Date().toISOString() }) : collection;
    });
    writeLocalCollections(collections);
    notifyCollectionsUpdated();
    return collections.find((collection) => (
      collection.id === collectionIdentifier
      || collection.publicId === collectionIdentifier
      || getCollectionSlug(collection) === collectionIdentifier
    ));
  }
  try {
    const res = await axios.put(`${API_BASE}/collections/${encodeURIComponent(collectionIdentifier)}`, updates, { headers: authHeaders() });
    const collection = normalizeCollection(res.data);
    upsertLocalCollection(collection);
    notifyCollectionsUpdated();
    return collection;
  } catch {
    const collections = readLocalCollections().map((collection) => {
      const isTarget = collection.id === collectionIdentifier
        || collection.publicId === collectionIdentifier
        || getCollectionSlug(collection) === collectionIdentifier;
      return isTarget ? normalizeCollection({ ...collection, ...updates, updatedAt: new Date().toISOString() }) : collection;
    });
    writeLocalCollections(collections);
    notifyCollectionsUpdated();
    return collections.find((collection) => (
      collection.id === collectionIdentifier
      || collection.publicId === collectionIdentifier
      || getCollectionSlug(collection) === collectionIdentifier
    ));
  }
};

export const removeGameFromCollection = async (collectionIdentifier, gameId) => {
  if (!hasAuth()) {
    const collection = localRemoveGame(collectionIdentifier, gameId);
    notifyCollectionsUpdated();
    return collection;
  }
  try {
    const res = await axios.delete(`${API_BASE}/collections/${encodeURIComponent(collectionIdentifier)}/games/${encodeURIComponent(gameId)}`, { headers: authHeaders() });
    const collection = normalizeCollection(res.data);
    upsertLocalCollection(collection);
    notifyCollectionsUpdated();
    return collection;
  } catch {
    const collection = localRemoveGame(collectionIdentifier, gameId);
    notifyCollectionsUpdated();
    return collection;
  }
};

export const deleteCollection = async (collectionIdentifier) => {
  if (!hasAuth()) {
    const result = localDeleteCollection(collectionIdentifier);
    notifyCollectionsUpdated();
    return result;
  }
  try {
    await axios.delete(`${API_BASE}/collections/${encodeURIComponent(collectionIdentifier)}`, { headers: authHeaders() });
    localDeleteCollection(collectionIdentifier);
    notifyCollectionsUpdated();
    return { deleted: true };
  } catch {
    const result = localDeleteCollection(collectionIdentifier);
    notifyCollectionsUpdated();
    return result;
  }
};
