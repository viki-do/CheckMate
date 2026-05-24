import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Download, Info, Plus, Search, X } from 'lucide-react';
import ChessBoardGrid from '../ChessBoardGrid';
import { ControlBtn, FooterAction } from '../component_helpers/AnalysisHelpers';
import {
  AddToCollection,
  ChevronLeft,
  ChevronRight,
  CircleTargetPractice,
  DocumentFolderBoard,
  Magnifier,
  ResetArrow,
  Share,
} from '../icons/Icons';
import CapturedProgressBar from '../game-board/CapturedProgressBar';
import { useChess } from '../../context/ChessContext';
import { getReplayPositionSoundName } from '../../hooks/chess-game/soundUtils';
import {
  addGameToCollection as addGameToDbCollection,
  createCollection as createDbCollection,
  loadCollections,
} from '../../services/collectionsService';
import { MoveNotation } from '../move-list/MoveNotation';
import { CapturedRow } from '../MaterialAdvantage';
import { getCapturedPieces, getMaterialDiff } from '../materialUtils';
import { getPlayerImage } from '../../utils/databaseFormatters';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const COLLECTIONS_STORAGE_KEY = 'checkmate_game_collections';
const PUBLIC_ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const createPublicId = (length = 9) => {
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => PUBLIC_ID_CHARS[value % PUBLIC_ID_CHARS.length]).join('');
};

const parseMoveText = (moveText) => {
  const chess = new Chess();
  const cleanText = String(moveText || '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');

  const tokens = cleanText
    .split(/\s+/)
    .map((token) => token.trim().replace(/[!?]+$/g, ''))
    .filter(Boolean);

  for (const token of tokens) {
    chess.move(token);
  }

  return chess;
};

const buildReplay = (game) => {
  const pgn = `${game.moves || ''} ${game.result || '*'}`.trim();
  let chess = new Chess();
  let parseError = false;

  try {
    chess.loadPgn(pgn);
  } catch {
    try {
      chess = parseMoveText(game.moves);
    } catch {
      parseError = true;
    }
  }

  const replay = new Chess();
  const moves = chess.history({ verbose: true });
  const fens = [DEFAULT_FEN];
  const history = moves.map((move, index) => {
    const fenBefore = replay.fen();
    const replayMove = replay.move(move.san);
    const fen = replay.fen();
    fens.push(fen);

    return {
      num: index,
      m: replayMove.san,
      from: replayMove.from,
      to: replayMove.to,
      fen,
      fen_before: fenBefore,
      color: replayMove.color,
    };
  });

  return { fens, history, parseError };
};

const formatMoveRows = (history) => {
  const rows = [];
  for (let index = 0; index < history.length; index += 2) {
    rows.push({
      moveNumber: Math.floor(index / 2) + 1,
      white: history[index],
      black: history[index + 1],
    });
  }
  return rows;
};

const PlayerStrip = ({ name, rating, type, material, side, isWinner = false }) => {
  const image = getPlayerImage(name);

  return (
    <div className={`app-board-width flex items-center justify-between px-1 h-12 ${type === 'top' ? 'mb-1' : 'mt-1'} shrink-0`}>
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-9 h-9 bg-[#2b2a27] rounded-md flex items-center justify-center overflow-hidden shrink-0 ${
            isWinner ? 'border-2 border-[#81b64c]' : 'border border-chess-bg'
          }`}
        >
          {image ? (
            <img src={image} alt={name} className="w-full h-full object-cover object-top" />
          ) : (
            <i className={`fas ${type === 'top' ? 'fa-user-tie' : 'fa-user'} text-[#808080] text-xl`}></i>
          )}
        </div>
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-[#bab9b8] font-bold text-[14px] leading-none truncate">{name}</span>
          {rating && (
            <span className="text-[#8b8987] text-[11px] font-bold">({rating})</span>
          )}
          <CapturedRow pieces={material.pieces} side={side} diff={material.diff} />
        </div>
      </div>
    </div>
  );
};

const isEcoCode = (value) => /^[A-E][0-9]{2}$/i.test(String(value || '').trim());

const getOpeningDisplay = (game) => {
  const detectedName = String(game.detected_opening?.name || '').trim();
  const detectedEco = String(game.detected_opening?.eco || '').trim();
  const opening = String(game.opening || '').trim();
  const eco = String(game.eco || '').trim();
  const ecoCode = detectedEco || eco || (isEcoCode(opening) ? opening : '');

  if (detectedName) {
    return { title: detectedName, metaEco: ecoCode };
  }

  if (opening && !isEcoCode(opening)) {
    return { title: opening, metaEco: eco && eco !== opening ? eco : '' };
  }

  return {
    title: 'Unknown opening',
    metaEco: ecoCode,
  };
};

const getResultTitle = (game) => {
  if (game.result === '1-0') return 'White Won (1-0)';
  if (game.result === '0-1') return 'Black Won (0-1)';
  if (game.result === '1/2-1/2' || game.result === '1/2' || game.result === '½-½') {
    return `Draw (${game.result})`;
  }
  return game.result ? `Result: ${game.result}` : 'Result Unknown';
};

const InfoLine = ({ label, value }) => {
  if (!value && value !== 0) return null;

  return (
    <div className="text-[#d7d6d4] text-base leading-7">
      <span className="font-bold text-white">{label}: </span>
      <span>{value}</span>
    </div>
  );
};

const getCollectionGames = (collection) => (
  Array.isArray(collection?.games) ? collection.games : []
);

const getGameCollectionPayload = (game) => ({
  id: String(game.id),
  white: game.white,
  black: game.black,
  white_elo: game.white_elo,
  black_elo: game.black_elo,
  result: game.result,
  date: game.date,
  event: game.event,
  site: game.site,
  round: game.round,
  opening: game.detected_opening?.name || game.opening || '',
  eco: game.detected_opening?.eco || game.eco || '',
  moves: game.moves,
  addedAt: new Date().toISOString(),
});

const AddToCollectionModal = ({ isOpen, game, collections, filter, onFilterChange, onClose, onAdd, onCreateNew, lastAddedCollectionId }) => {
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setIsCreatingCollection(false);
    setNewCollectionName('');
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredCollections = collections.filter((collection) =>
    collection.name.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const canCreateCollection = newCollectionName.trim().length >= 2;
  const handleCreateCollection = () => {
    if (!canCreateCollection) return;
    onCreateNew(newCollectionName.trim());
    setNewCollectionName('');
  };
  const cancelCreateCollection = () => {
    setIsCreatingCollection(false);
    setNewCollectionName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
      <div className="h-[min(460px,calc(100dvh-32px))] w-[min(420px,calc(100vw-32px))] rounded-lg bg-[#272522] border border-[#3a3936] shadow-2xl overflow-hidden flex flex-col">
        <div className="h-13 px-4 flex items-center justify-between bg-[#1f1e1b] shrink-0">
          <h2 className="text-white text-[18px] font-semibold">Add to Collection</h2>
          <button type="button" onClick={onClose} className="text-[#8f8e8b] hover:text-white">
            <X size={24} strokeWidth={3} />
          </button>
        </div>

        <div className="p-3 border-b border-[#343330] shrink-0">
          <div className="relative">
            <Search size={22} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999896]" />
            <input
              autoFocus
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder="Filter Collections"
              className="w-full h-11 bg-[#3a3936] border border-[#55534f] rounded-md pl-10 pr-3 text-[#d7d6d4] placeholder:text-[#8b8987] text-[14px] font-semibold outline-none focus:border-[#8bc34a]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredCollections.length > 0 ? (
            filteredCollections.map((collection) => {
              const games = getCollectionGames(collection);
              const alreadyAdded = games.some((savedGame) => String(savedGame.id) === String(game.id));
              const wasJustAdded = lastAddedCollectionId === collection.id && alreadyAdded;
              return (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => onAdd(collection.id)}
                  className="w-full min-h-15 px-4 py-2 flex items-center gap-3 text-left hover:bg-[#2f2e2b] transition-colors"
                >
                  <img
                    src="/assets/icons/advanced-tactics.png"
                    alt=""
                    className="w-7 h-7 rounded object-cover shrink-0"
                    draggable="false"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[#d7d6d4] text-[14px] font-semibold">
                      {collection.name} <span className="text-[#8f8e8b]">({games.length} {games.length === 1 ? 'game' : 'games'})</span>
                    </div>
                    {alreadyAdded && !wasJustAdded && (
                      <div className="mt-0.5 flex items-center gap-1 text-[#bab9b8] text-[12px] font-semibold">
                        <Info size={13} strokeWidth={3} /> Game is already in collection
                      </div>
                    )}
                  </div>
                  {wasJustAdded ? (
                    <span className="w-7 h-7 rounded-full bg-[#81b64c] flex items-center justify-center text-white shrink-0">
                      <CheckCircle size={20} strokeWidth={3.5} />
                    </span>
                  ) : (
                    <Plus size={24} strokeWidth={4} className="text-[#9f9e9b]" />
                  )}
                </button>
              );
            })
          ) : (
            <div className="h-full flex items-center justify-center px-8 text-center text-[#9f9e9b] text-[15px] font-semibold">
              No collections found
            </div>
          )}
        </div>

        <div className="p-3 bg-[#24231f] border-t border-[#343330] shrink-0">
          {isCreatingCollection ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newCollectionName}
                onChange={(event) => setNewCollectionName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreateCollection();
                  if (event.key === 'Escape') cancelCreateCollection();
                }}
                placeholder="Collection Name"
                className="h-11 flex-1 rounded-md border border-[#65635f] bg-[#343330] px-3 text-[#d7d6d4] placeholder:text-[#8b8987] text-[14px] font-semibold outline-none focus:border-[#8bc34a]"
              />
              <button
                type="button"
                disabled={!canCreateCollection}
                onClick={handleCreateCollection}
                className={`h-11 w-13 rounded-md flex items-center justify-center transition-colors ${canCreateCollection ? 'bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white hover:from-[#9bd45c] hover:to-[#6cb64e]' : 'bg-[#4d6f39] text-[#9fb58d] cursor-not-allowed'}`}
              >
                <CheckCircle size={22} strokeWidth={3.5} />
              </button>
              <button type="button" onClick={cancelCreateCollection} className="h-11 w-10 flex items-center justify-center text-[#9f9e9b] hover:text-white">
                <X size={28} strokeWidth={4} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreatingCollection(true)}
              className="w-full h-12 rounded-lg bg-gradient-to-b from-[#3a3936] to-[#2f2e2b] text-[#d7d6d4] text-[16px] font-semibold hover:from-[#45433f] hover:to-[#343330] flex items-center justify-center gap-3"
            >
              <Plus size={24} strokeWidth={4} /> Create New Collection
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const DatabaseGameViewer = ({ game }) => {
  const navigate = useNavigate();
  const { playSound } = useChess();
  const replay = useMemo(() => buildReplay(game), [game]);
  const [moveIndex, setMoveIndex] = useState(replay.history.length);
  const [activeTab, setActiveTab] = useState('moves');
  const [isAddToCollectionOpen, setIsAddToCollectionOpen] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState('');
  const [collections, setCollections] = useState([]);
  const [lastAddedCollectionId, setLastAddedCollectionId] = useState(null);
  const fen = replay.fens[moveIndex] || DEFAULT_FEN;
  const lastMove = moveIndex > 0 ? replay.history[moveIndex - 1] : null;
  const moveRows = formatMoveRows(replay.history);
  const currentMove = replay.history[moveIndex - 1];
  const opening = game.opening || 'Unknown opening';
  const openingDisplay = getOpeningDisplay(game);
  const captured = getCapturedPieces(fen);
  const materialDiff = getMaterialDiff(captured);
  const topMaterial = {
    pieces: captured.blackSide,
    diff: materialDiff < 0 ? Math.abs(materialDiff) : 0,
  };
  const bottomMaterial = {
    pieces: captured.whiteSide,
    diff: materialDiff > 0 ? materialDiff : 0,
  };
  const boardGameLogic = {
    fen,
    selectedSquare: null,
    lastMove: lastMove ? { from: lastMove.from, to: lastMove.to } : { from: null, to: null },
    validMoves: [],
    isDragging: false,
    hoverSquare: null,
    mousePos: { x: 0, y: 0 },
    isAlert: false,
    status: 'viewing',
    viewIndex: moveIndex,
    getSquareName: (row, col) => `${'abcdefgh'[col]}${8 - row}`,
    isFlipped: false,
    handleMouseUp: () => {},
  };
  const whiteWon = game.result === '1-0';
  const blackWon = game.result === '0-1';

  const goToAnalysis = () => {
    navigate(`/analysis/game/master/${game.id}/review`);
  };

  const refreshCollections = async () => {
    setCollections(await loadCollections());
  };

  const openAddToCollection = () => {
    refreshCollections();
    setCollectionFilter('');
    setLastAddedCollectionId(null);
    setIsAddToCollectionOpen(true);
  };

  const addGameToCollection = async (collectionId) => {
    const gamePayload = getGameCollectionPayload(game);
    const existingCollection = collections.find((collection) => collection.id === collectionId);
    const didAdd = !getCollectionGames(existingCollection).some((savedGame) => String(savedGame.id) === String(gamePayload.id));
    await addGameToDbCollection(collectionId, gamePayload);
    setCollections(await loadCollections({ migrate: false }));
    setLastAddedCollectionId(didAdd ? collectionId : null);
  };

  const createCollectionFromModal = async (name) => {
    const newCollection = await createDbCollection({
      id: crypto.randomUUID(),
      publicId: createPublicId(),
      name,
      ownerName: localStorage.getItem('chessUsername') || 'VikhiKeh',
      privacy: 'public',
      participants: [],
      games: [],
      gameCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setCollections((prev) => [newCollection, ...prev.filter((collection) => collection.id !== newCollection.id)]);
  };

  const playReplaySound = (nextIndex) => {
    const soundName = getReplayPositionSoundName(replay.history, moveIndex, nextIndex);
    if (soundName) playSound(soundName);
  };

  const goToReplayMove = (nextIndex) => {
    const safeIndex = Math.max(0, Math.min(replay.history.length, nextIndex));
    playReplaySound(safeIndex);
    setMoveIndex(safeIndex);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || event.target?.isContentEditable) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToReplayMove(moveIndex - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToReplayMove(moveIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveIndex, replay.history.length]);

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-start bg-[#1e1e1e] gap-4 p-3 overflow-y-auto overflow-x-hidden select-none relative md:h-dvh md:flex-row md:justify-center md:gap-4 md:p-4 md:overflow-hidden xl:gap-6">
      <CapturedProgressBar />

      <div className="flex flex-col justify-center items-center h-full shrink-0">
        <PlayerStrip
          name={game.black}
          rating={game.black_elo}
          type="top"
          material={topMaterial}
          side="black"
          isWinner={blackWon}
        />

        <div className="app-board-size bg-[#2b2b2b] relative">
          <ChessBoardGrid
            gameLogic={boardGameLogic}
            onMouseDown={() => {}}
            onMouseUp={() => {}}
          />
        </div>

        <PlayerStrip
          name={game.white}
          rating={game.white_elo}
          type="bottom"
          material={bottomMaterial}
          side="white"
          isWinner={whiteWon}
        />
      </div>

      <aside className="app-panel-size shrink-0 self-center bg-[#262421] flex flex-col font-sans border border-[#3c3a37] rounded-md overflow-hidden shadow-2xl">
        <div className="grid grid-cols-2 h-15 bg-[#1f1e1b] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('moves')}
            className={`flex flex-col items-center justify-center gap-1.5 text-[13px] font-semibold ${
              activeTab === 'moves' ? 'bg-[#262421] text-white' : 'text-[#bab9b8] hover:text-white'
            }`}
          >
            <DocumentFolderBoard size={22} />
            <span>Moves</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`flex flex-col items-center justify-center gap-1.5 text-[13px] font-semibold ${
              activeTab === 'info' ? 'bg-[#262421] text-white' : 'text-[#bab9b8] hover:text-white'
            }`}
          >
            <Info size={24} strokeWidth={3} />
            <span>Info</span>
          </button>
        </div>

        {activeTab === 'moves' ? (
          <>
            <div className="h-14 px-4 flex items-center border-b border-[#373430] text-[#d7d6d4] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Magnifier size={18} className="text-[#9f9e9b] shrink-0" />
                <div className="truncate text-[15px] font-semibold">
                  {[openingDisplay.metaEco, openingDisplay.title].filter(Boolean).join(': ') || 'Game database'}
                </div>
              </div>
              {replay.parseError && <div className="text-sm text-[#f87171] mt-1">Could not parse moves</div>}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar bg-[#262421]">
              {moveRows.map((row) => (
                <div key={row.moveNumber} className="grid grid-cols-[48px_1fr_1fr] px-4 h-9 items-center odd:bg-[#2b2926] text-[#bab9b8] font-bold text-[14px]">
                  <div className="text-[#9f9e9b]">{row.moveNumber}.</div>
                  <button
                    onClick={() => goToReplayMove(row.white.num + 1)}
                    className={`text-left hover:text-white flex items-center ${moveIndex === row.white.num + 1 ? 'text-white' : ''}`}
                  >
                    <MoveNotation move={row.white} isBlack={false} />
                  </button>
                  <button
                    onClick={() => row.black && goToReplayMove(row.black.num + 1)}
                    className={`text-left hover:text-white flex items-center ${row.black && moveIndex === row.black.num + 1 ? 'text-white' : ''}`}
                  >
                    {row.black ? <MoveNotation move={row.black} isBlack /> : ''}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto no-scrollbar bg-[#262421] px-5 py-5">
            <div className="bg-[#f2f2f2] text-[#5b5b5b] text-center font-black text-xl py-3 rounded-sm mb-5">
              {getResultTitle(game)}
            </div>

            <div className="space-y-1">
              <InfoLine label="Date" value={game.date} />
              <InfoLine label="Result" value={game.result} />
              <InfoLine label="Event" value={game.event} />
              <InfoLine label="Site" value={game.site} />
              <InfoLine label="Round" value={game.round} />
              <InfoLine label="White" value={game.white} />
              <InfoLine label="White Elo" value={game.white_elo} />
              <InfoLine label="Black" value={game.black} />
              <InfoLine label="Black Elo" value={game.black_elo} />
              <InfoLine label="Opening" value={openingDisplay.title} />
              <InfoLine label="ECO" value={openingDisplay.metaEco || game.eco} />
              <InfoLine label="Moves" value={game.ply_count ? Math.ceil(game.ply_count / 2) : null} />
            </div>
          </div>
        )}

        <div className="p-3 bg-[#21201d] rounded-b-md border-t border-[#3c3a37] shrink-0">
          <div className="flex justify-between gap-1 px-1 h-12 mb-3">
            <ControlBtn icon={<Magnifier size={22} />} onClick={goToAnalysis} />
            <ControlBtn icon={<ResetArrow size={20} />} onClick={() => goToReplayMove(0)} />
            <ControlBtn
              icon={<ChevronLeft size={20} />}
              onClick={() => goToReplayMove(moveIndex - 1)}
            />
            <ControlBtn
              icon={<ChevronRight size={20} />}
              onClick={() => goToReplayMove(moveIndex + 1)}
            />
          </div>
          <div className="flex justify-center items-center text-[#8b8987] pb-1">
            <div className="flex gap-2 text-xs">
              <FooterAction icon={<Download size={20} />} label="" onClick={() => {}} />
              <FooterAction icon={<Share size={20} />} label="" onClick={() => {}} />
              <FooterAction icon={<CircleTargetPractice size={20} />} label="" onClick={() => {}} />
              <FooterAction icon={<AddToCollection size={20} />} label="" onClick={openAddToCollection} />
            </div>
          </div>
        </div>
      </aside>

      <AddToCollectionModal
        isOpen={isAddToCollectionOpen}
        game={game}
        collections={collections}
        filter={collectionFilter}
        onFilterChange={setCollectionFilter}
        onClose={() => setIsAddToCollectionOpen(false)}
        onAdd={addGameToCollection}
        onCreateNew={createCollectionFromModal}
        lastAddedCollectionId={lastAddedCollectionId}
      />
    </main>
  );
};

export default DatabaseGameViewer;
