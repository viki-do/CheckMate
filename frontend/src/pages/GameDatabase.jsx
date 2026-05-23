import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import DatabaseGameViewer from '../components/database/DatabaseGameViewer';
import PlayerCatalogView from '../components/database/PlayerCatalogView';
import PlayerProfileView from '../components/database/PlayerProfileView';
import { API_BASE } from '../constants/databasePlayers';

const DEFAULT_DETAIL_FILTERS = { opening: '', player2: '', fixedColors: false };

const toPlayerSlug = (name) => String(name || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const playerNameFromSlug = (slug) => String(slug || '')
  .split('-')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const scrollDatabaseToTop = () => {
  requestAnimationFrame(() => {
    document.querySelector('main')?.scrollTo({ top: 0, left: 0 });
    window.scrollTo({ top: 0, left: 0 });
  });
};

const scrollDatabaseToAllPlayers = () => {
  requestAnimationFrame(() => {
    const target = document.getElementById('all-players');
    const scroller = document.querySelector('main');
    if (!target || !scroller) return;

    const scrollerTop = scroller.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    scroller.scrollTo({
      top: scroller.scrollTop + targetTop - scrollerTop - 16,
      left: 0,
    });
  });
};

const GameDatabase = () => {
  const navigate = useNavigate();
  const { playerSlug, gameId } = useParams();
  const token = localStorage.getItem('chessToken');
  const authHeaders = useMemo(() => (
    token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  ), [token]);

  const [summary, setSummary] = useState({
    total_games: 0,
    indexed_games: 0,
    imported_file_games: 0,
    r2_archive: { object_count: 0, size_bytes: 0, available: false },
    best_players: [],
  });
  const [players, setPlayers] = useState([]);
  const [playersTotal, setPlayersTotal] = useState(0);
  const [playersPage, setPlayersPage] = useState(1);
  const [playerSearch, setPlayerSearch] = useState('');
  const [sortMode, setSortMode] = useState('name');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerProfile, setPlayerProfile] = useState(null);
  const [games, setGames] = useState([]);
  const [totalGames, setTotalGames] = useState(0);
  const [gamesPage, setGamesPage] = useState(1);
  const [gamesSort, setGamesSort] = useState('year_desc');
  const [detailFilters, setDetailFilters] = useState(DEFAULT_DETAIL_FILTERS);
  const [selectedReplayGame, setSelectedReplayGame] = useState(null);
  const [isReplayLoading, setIsReplayLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlayersLoading, setIsPlayersLoading] = useState(false);
  const [isGamesLoading, setIsGamesLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const playersPageSize = 24;
  const gamesPageSize = 10;
  const playersTotalPages = Math.max(1, Math.ceil(playersTotal / playersPageSize));
  const gamesTotalPages = Math.max(1, Math.ceil(totalGames / gamesPageSize));

  const fetchPlayers = useCallback(async (page = 1, search = playerSearch, sort = sortMode) => {
    setIsPlayersLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(playersPageSize),
        search,
        sort,
      });
      const res = await axios.get(`${API_BASE}/database/players?${params.toString()}`, authHeaders);
      setPlayers(res.data.players || []);
      setPlayersTotal(res.data.total || 0);
      setPlayersPage(res.data.page || page);
    } finally {
      setIsPlayersLoading(false);
    }
  }, [authHeaders, playerSearch, sortMode]);

  const fetchGamesForPlayer = useCallback(async (player, page = 1, filters = DEFAULT_DETAIL_FILTERS, sort = 'year_desc', resetProfile = false) => {
    if (!player?.name) return;
    setSelectedPlayer(player);
    if (resetProfile) {
      setPlayerProfile(null);
      setTotalGames(0);
    }
    setGames([]);
    setGamesPage(page);
    setIsGamesLoading(true);
    try {
      const params = new URLSearchParams({
        player1: player.name,
        page: String(page),
        page_size: String(gamesPageSize),
        sort,
      });
      if (filters.opening.trim()) params.set('opening', filters.opening.trim());
      if (filters.player2.trim()) params.set('player2', filters.player2.trim());
      if (filters.fixedColors) params.set('fixed_colors', 'true');

      const [profileRes, gamesRes] = await Promise.all([
        axios.get(`${API_BASE}/database/player-profile?name=${encodeURIComponent(player.name)}`, authHeaders),
        axios.get(`${API_BASE}/database/games?${params.toString()}`, authHeaders),
      ]);
      setPlayerProfile(profileRes.data);
      setGames(gamesRes.data.games || []);
      setTotalGames(gamesRes.data.total || 0);
      setGamesPage(gamesRes.data.page || page);
    } finally {
      setIsGamesLoading(false);
    }
  }, [authHeaders]);

  const fetchGameById = useCallback(async (id) => {
    setIsReplayLoading(true);
    setNotice('');
    try {
      const res = await axios.get(`${API_BASE}/database/games/${id}`, authHeaders);
      setSelectedReplayGame(res.data);
    } catch {
      setSelectedReplayGame(null);
      setNotice('Could not load this game.');
    } finally {
      setIsReplayLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    let isMounted = true;
    const loadSummary = async () => {
      setIsLoading(true);
      try {
        const summaryRes = await axios.get(`${API_BASE}/database/summary`, authHeaders);
        if (isMounted) setSummary(summaryRes.data);
      } catch {
        if (isMounted) setNotice('Could not load the cloud game database summary.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    const loadPlayers = async () => {
      setIsPlayersLoading(true);
      try {
        const playersRes = await axios.get(`${API_BASE}/database/players?page=1&limit=${playersPageSize}&sort=name`, authHeaders);
        if (!isMounted) return;
        setPlayers(playersRes.data.players || []);
        setPlayersTotal(playersRes.data.total || 0);
      } catch {
        if (isMounted) setNotice('Could not load the player catalogue.');
      } finally {
        if (isMounted) setIsPlayersLoading(false);
      }
    };
    loadPlayers();
    loadSummary();
    return () => { isMounted = false; };
  }, [authHeaders]);

  useEffect(() => {
    if (gameId) {
      fetchGameById(gameId);
      return;
    }

    setSelectedReplayGame(null);

    if (playerSlug) {
      const player = { name: playerNameFromSlug(playerSlug) };
      scrollDatabaseToTop();
      fetchGamesForPlayer(player, 1, DEFAULT_DETAIL_FILTERS, 'year_desc', true);
      return;
    }

    setSelectedPlayer(null);
    setPlayerProfile(null);
    setGames([]);
    setTotalGames(0);
    setGamesPage(1);
  }, [gameId, playerSlug, fetchGameById, fetchGamesForPlayer]);

  const handleSearch = async (event) => {
    event.preventDefault();
    await fetchPlayers(1, playerSearch, sortMode);
  };

  const handleSortChange = async (nextSort) => {
    setSortMode(nextSort);
    await fetchPlayers(1, playerSearch, nextSort);
  };

  const goToPlayersPage = async (nextPage) => {
    if (nextPage < 1 || nextPage > playersTotalPages || nextPage === playersPage) return;
    scrollDatabaseToAllPlayers();
    await fetchPlayers(nextPage);
  };

  const goToGamesPage = async (nextPage) => {
    if (!selectedPlayer || nextPage < 1 || nextPage > gamesTotalPages || nextPage === gamesPage) return;
    scrollDatabaseToTop();
    await fetchGamesForPlayer(selectedPlayer, nextPage, detailFilters, gamesSort);
  };

  const handleDetailSearch = async () => {
    if (!selectedPlayer) return;
    await fetchGamesForPlayer(selectedPlayer, 1, detailFilters, gamesSort);
  };

  const handleGamesSortChange = async (nextSort) => {
    setGamesSort(nextSort);
    if (!selectedPlayer) return;
    await fetchGamesForPlayer(selectedPlayer, 1, detailFilters, nextSort);
  };

  const leaveDetail = () => {
    navigate('/games');
    setSelectedPlayer(null);
    setPlayerProfile(null);
    setGames([]);
    setTotalGames(0);
    setGamesPage(1);
    setGamesSort('year_desc');
    setDetailFilters(DEFAULT_DETAIL_FILTERS);
  };

  const handleSelectPlayer = (player) => {
    if (!player?.name) return;
    scrollDatabaseToTop();
    navigate(`/games/${toPlayerSlug(player.name)}`);
  };

  const handleOpenGame = (game) => {
    if (!game?.id) return;
    navigate(`/games/view/${game.id}`);
  };

  if (gameId) {
    if (isReplayLoading || !selectedReplayGame) {
      return (
        <div className="min-h-screen bg-[#1e1e1e] text-[#d7d6d4] flex items-center justify-center font-sans">
          {notice || 'Loading game...'}
        </div>
      );
    }

    return <DatabaseGameViewer game={selectedReplayGame} />;
  }

  if (selectedPlayer) {
    return (
      <PlayerProfileView
        selectedPlayer={selectedPlayer}
        playerProfile={playerProfile}
        games={games}
        gamesPage={gamesPage}
        gamesTotalPages={gamesTotalPages}
        detailFilters={detailFilters}
        gamesSort={gamesSort}
        isGamesLoading={isGamesLoading}
        onBack={leaveDetail}
        onDetailFiltersChange={setDetailFilters}
        onDetailSearch={handleDetailSearch}
        onGamesSortChange={handleGamesSortChange}
        onGamesPageChange={goToGamesPage}
        onOpenGame={handleOpenGame}
      />
    );
  }

  return (
    <PlayerCatalogView
      summary={summary}
      players={players}
      playersTotal={playersTotal}
      playersPage={playersPage}
      playersTotalPages={playersTotalPages}
      playerSearch={playerSearch}
      sortMode={sortMode}
      isLoading={isLoading}
      isPlayersLoading={isPlayersLoading}
      notice={notice}
      onPlayerSearchChange={setPlayerSearch}
      onSearch={handleSearch}
      onSortChange={handleSortChange}
      onPlayersPageChange={goToPlayersPage}
      onSelectPlayer={handleSelectPlayer}
    />
  );
};

export default GameDatabase;
