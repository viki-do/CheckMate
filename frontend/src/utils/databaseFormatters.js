import { playerFacts, playerImages } from '../constants/databasePlayers';

export const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value || 0);

export const normalizeName = (name) => String(name || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[-_]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const playerNameAliases = {
  'robert james fischer': 'bobby fischer',
  'robert fischer': 'bobby fischer',
  'fischer, robert james': 'bobby fischer',
  'fischer, robert': 'bobby fischer',
};

const getPlayerNameCandidates = (name) => {
  const normalized = normalizeName(name);
  if (!normalized) return [];

  const candidates = [normalized];
  if (playerNameAliases[normalized]) candidates.push(playerNameAliases[normalized]);

  if (normalized.includes(',')) {
    const [lastName, firstNames] = normalized.split(',').map((part) => part.trim());
    if (firstNames && lastName) {
      const reversed = `${firstNames} ${lastName}`;
      candidates.push(reversed);
      if (playerNameAliases[reversed]) candidates.push(playerNameAliases[reversed]);
    }
  }

  return candidates;
};

const normalizedPlayerImages = Object.fromEntries(
  Object.entries(playerImages).map(([name, value]) => [normalizeName(name), value])
);

const normalizedPlayerFacts = Object.fromEntries(
  Object.entries(playerFacts).map(([name, value]) => [normalizeName(name), value])
);

export const getPlayerImage = (name) => (
  getPlayerNameCandidates(name).map((candidate) => normalizedPlayerImages[candidate]).find(Boolean) || null
);

export const getPlayerFacts = (name) => (
  getPlayerNameCandidates(name).map((candidate) => normalizedPlayerFacts[candidate]).find(Boolean)
) || {
  title: 'GM',
  fullName: name || 'Unknown Player',
  born: 'Unknown',
  birthplace: 'Unknown',
  federation: 'Unknown',
};

export const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

export const percent = (part, total) => {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
};
