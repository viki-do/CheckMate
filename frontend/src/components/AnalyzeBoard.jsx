import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import axios from 'axios';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AnalysisPanel from './AnalysisPanel';
import { useChess } from '../context/ChessContext';
import SetUpPositionView from './component_helpers/SetupPositionView';
import { AnimatePresence } from 'framer-motion';
import MasterReviewIntro from './analysis-panel/MasterReviewIntro';
import { getCapturedPieces, getMaterialDiff } from './materialUtils';
import AnalyzeBoardSection from './analyze-board/AnalyzeBoardSection';
import AnalyzeEvalBar from './analyze-board/AnalyzeEvalBar';
import NewAnalysisModal from './analyze-board/NewAnalysisModal';
import SaveCollectionModal from './analyze-board/SaveCollectionModal';
import SetupPieceDragPreview from './analyze-board/SetupPieceDragPreview';
import { findBotByGameData } from './game-board/gameBoardUtils';
import {
    DEFAULT_FEN,
    getResultLabel,
    getSandboxGameState,
} from './analyze-board/analyzeBoardUtils';
import { getHistoryNavigationSoundName } from '../hooks/chess-game/soundUtils';
import {
    addGameToCollection,
    deleteCollection as deleteDbCollection,
    loadCollections,
    updateCollection as updateDbCollection,
} from '../services/collectionsService';
import {
    getSavedAnalysis,
    saveAnalysis,
} from '../services/savedAnalysesService';
import {
    deleteCurrentAnalysisDraft,
    loadCurrentAnalysisDraft,
    saveCurrentAnalysisDraft,
    writeLocalAnalysisDraft,
} from '../services/analysisDraftsService';
import { profileAvatarSrc } from '../config/api';

const COLLECTIONS_STORAGE_KEY = 'checkmate_game_collections';
const SAVED_ANALYSES_STORAGE_KEY = 'checkmate_saved_analyses';
const PUBLIC_ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const createAnalysisSessionId = () => (
    Array.from(crypto.getRandomValues(new Uint32Array(10)), (value) => PUBLIC_ID_CHARS[value % PUBLIC_ID_CHARS.length]).join('')
);

const normalizeEvalForBar = (value, fallback = 0) => {
    if (typeof value === 'string' && value.startsWith('M')) {
        const mateValue = Number(value.slice(1));
        if (Number.isFinite(mateValue)) return mateValue >= 0 ? 9 : -9;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const findPreviousKnownEval = (history = [], fromIndex = history.length) => {
    for (let i = Math.min(fromIndex - 1, history.length - 1); i >= 0; i -= 1) {
        const value = history[i]?.eval;
        if (value !== undefined && value !== null) {
            return value;
        }
    }
    return undefined;
};

const getFirstEngineLineEval = (move) => {
    const lines = move?.engineLines || move?.engine_lines || [];
    const firstLine = Array.isArray(lines) ? lines[0] : null;
    return firstLine?.eval ?? firstLine?.raw_eval ?? firstLine?.rawEval;
};

const getMoveEvalForBar = (move, fallback = 0) => {
    if (!move) return normalizeEvalForBar(undefined, fallback);

    const lineEval = getFirstEngineLineEval(move);
    const moveEval = move.eval;
    const isBookMove = move.analysisLabel === 'book' || move.is_book || move.isBook;

    if (lineEval !== undefined && lineEval !== null && (isBookMove || moveEval === 0 || moveEval === undefined || moveEval === null)) {
        return normalizeEvalForBar(lineEval, fallback);
    }

    return normalizeEvalForBar(moveEval ?? lineEval, fallback);
};

const findPreviousBarEval = (history = [], fromIndex = history.length, evalByFen = {}) => {
    for (let i = Math.min(fromIndex - 1, history.length - 1); i >= 0; i -= 1) {
        const move = history[i];
        const moveEval = getMoveEvalForBar(move, undefined);
        if (moveEval !== undefined && moveEval !== null) return moveEval;

        const fenEval = evalByFen[move?.fen];
        if (fenEval !== undefined && fenEval !== null) return normalizeEvalForBar(fenEval, undefined);
    }
    return undefined;
};

const extractPublicIdFromSlug = (slug) => String(slug || '').split('-').pop();

const getCollectionGames = (collection) => (
    Array.isArray(collection?.games) ? collection.games : []
);

const getGameSaveSignature = (history = [], startingFen = DEFAULT_FEN) => (
    JSON.stringify({
        startingFen,
        moves: history.map((move) => move.m),
        finalFen: history[history.length - 1]?.fen || startingFen,
    })
);

const saveAnalysisGameToSavedList = async (game) => {
    if (!game?.id) return null;
    try {
        const savedAnalyses = JSON.parse(localStorage.getItem(SAVED_ANALYSES_STORAGE_KEY) || '[]');
        const existingGame = savedAnalyses.find((savedGame) => String(savedGame.id) === String(game.id));
        const nextGame = {
            ...game,
            addedAt: existingGame?.addedAt || game.addedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const nextSavedAnalyses = existingGame
            ? savedAnalyses.map((savedGame) => String(savedGame.id) === String(game.id) ? nextGame : savedGame)
            : [nextGame, ...savedAnalyses];

        localStorage.setItem(SAVED_ANALYSES_STORAGE_KEY, JSON.stringify(nextSavedAnalyses));
        return await saveAnalysis(nextGame);
    } catch {
        return null;
    }
};

const updateSavedAnalysisGame = async (game) => {
    if (!game?.id) return null;
    try {
        const collections = JSON.parse(localStorage.getItem(COLLECTIONS_STORAGE_KEY) || '[]');
        let didUpdate = false;
        let targetCollection = null;
        const updatedCollections = collections.map((collection) => {
            if (!Array.isArray(collection.games)) return collection;
            let didUpdateCollection = false;
            const games = collection.games.map((savedGame) => {
                if (String(savedGame.id) !== String(game.id)) return savedGame;
                didUpdate = true;
                didUpdateCollection = true;
                return {
                    ...game,
                    addedAt: savedGame.addedAt || game.addedAt,
                    updatedAt: new Date().toISOString(),
                };
            });
            if (!didUpdateCollection) return collection;
            targetCollection = {
                ...collection,
                games,
                gameCount: games.length,
                updatedAt: new Date().toISOString(),
            };
            return targetCollection;
        });
        if (didUpdate) {
            localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(updatedCollections));
            if (targetCollection?.id) {
                await addGameToCollection(targetCollection.id, game);
            }
        }
        return targetCollection;
    } catch {
        // A broken local collection cache should not block analysis.
        return null;
    }
};

const parseMasterGameHistory = (game) => {
    let chess = new Chess();
    try {
        chess.loadPgn(`${game?.moves || ''} ${game?.result || '*'}`.trim());
    } catch {
        chess = new Chess();
        const tokens = String(game?.moves || '')
            .replace(/\{[^}]*\}/g, ' ')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\$\d+/g, ' ')
            .replace(/\d+\.(\.\.)?/g, ' ')
            .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ')
            .split(/\s+/)
            .map((token) => token.trim().replace(/[!?]+$/g, ''))
            .filter(Boolean);

        tokens.forEach((token) => chess.move(token));
    }

    const replay = new Chess(DEFAULT_FEN);
    return chess.history({ verbose: true }).map((move, index) => {
        const fenBefore = replay.fen();
        const replayMove = replay.move(move.san);
        return {
            num: index,
            m: replayMove.san,
            from: replayMove.from,
            to: replayMove.to,
            fen: replay.fen(),
            fen_before: fenBefore,
            color: replayMove.color,
            analysisLabel: null,
        };
    });
};

const formatToday = () => new Date().toISOString().slice(0, 10).replace(/-/g, '.');

const buildSandboxMoves = (history) => (
    history.map((move, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}${move.m}`).join(' ')
);

const getLatestHistoryFen = (history, fallbackFen) => (
    history[history.length - 1]?.fen || fallbackFen
);

const normalizeSetupFen = (fen, turn = 'w') => {
    const parts = String(fen || DEFAULT_FEN).trim().split(/\s+/);
    if (parts.length < 4) return fen || DEFAULT_FEN;
    while (parts.length < 6) {
        parts.push(parts.length === 4 ? '0' : '1');
    }
    parts[1] = turn === 'b' ? 'b' : 'w';
    parts[4] = '0';
    parts[5] = '1';
    return parts.join(' ');
};

const CLEAR_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

const createSetupChess = (fen) => new Chess(fen || CLEAR_BOARD_FEN, { skipValidation: true });
const ANALYZE_SETUP_DEBUG = false;
const analyzeSetupDebug = (...args) => {
    if (ANALYZE_SETUP_DEBUG) console.log('[AnalyzeBoard setup]', ...args);
};

const buildBotAnalysisGame = (data = {}, userAvatarSrc = '') => {
    const bot = findBotByGameData(data);
    const username = localStorage.getItem('chessUsername') || 'You';
    const playerColor = String(data.player_color || 'white').toLowerCase();
    const botName = bot?.name || 'Engine';
    const botElo = data.bot_elo || bot?.elo || '';
    const white = playerColor === 'white' ? username : botName;
    const black = playerColor === 'black' ? username : botName;
    const whiteAvatar = playerColor === 'white' ? userAvatarSrc : (bot?.img || '');
    const blackAvatar = playerColor === 'black' ? userAvatarSrc : (bot?.img || '');

    return {
        id: data.game_id || '',
        white,
        black,
        white_avatar: whiteAvatar,
        black_avatar: blackAvatar,
        white_elo: playerColor === 'white' ? '' : botElo,
        black_elo: playerColor === 'black' ? '' : botElo,
        result: data.result && data.result !== '*' ? data.result : '',
        date: formatToday(),
        event: 'Bot Game',
        site: 'Checkmate',
        opening: data.opening?.name || data.opening || '',
        eco: data.opening?.eco || '',
        moves: buildSandboxMoves((data.history || []).filter((move) => move?.m && move.m !== 'start')),
        white_accuracy: data.white_accuracy,
        black_accuracy: data.black_accuracy,
    };
};

const normalizeBotHistory = (history = [], startingFen = DEFAULT_FEN) => {
    const replay = new Chess(startingFen || DEFAULT_FEN);
    return (history || [])
        .filter((move) => move?.m && move.m !== 'start')
        .map((move, index) => {
            const fenBefore = replay.fen();
            try {
                replay.move(move.m);
            } catch {
                if (move.fen) {
                    try {
                        replay.load(move.fen);
                    } catch {
                        // Keep the previous board if a stored move is malformed.
                    }
                }
            }
            return {
                ...move,
                num: index,
                fen_before: move.fen_before || fenBefore,
                fen: move.fen || replay.fen(),
                analysisLabel: move.analysisLabel?.toLowerCase?.() || move.analysisLabel || null,
            };
        });
};

const buildHistoryFromChess = (chess, startingFen = DEFAULT_FEN) => {
    const replay = new Chess(startingFen);

    return chess.history({ verbose: true }).map((move, index) => {
        const fenBefore = replay.fen();
        const replayMove = replay.move(move.san);
        return {
            num: index,
            m: replayMove.san,
            from: replayMove.from,
            to: replayMove.to,
            fen: replay.fen(),
            fen_before: fenBefore,
            color: replayMove.color,
            analysisLabel: null,
        };
    });
};

const extractPgnResult = (text, metadata = {}) => (
    (metadata.Result && metadata.Result !== '*')
        ? metadata.Result
        : (String(text || '').match(/(?:^|\s)(1-0|0-1|1\/2-1\/2)(?:\s|$)/)?.[1] || '')
);

const buildGameInfoFromMetadata = (metadata = {}, result = '') => ({
    white: metadata.White || '',
    black: metadata.Black || '',
    result: result || (metadata.Result && metadata.Result !== '*' ? metadata.Result : ''),
});

const parseAnalysisInput = (value) => {
    const text = String(value || '').trim();
    if (!text) return null;

    try {
        const fenChess = new Chess(text);
        return {
            type: 'fen',
            startingFen: fenChess.fen(),
            history: [],
            metadata: {},
            result: '',
        };
    } catch {
        // Not a FEN; try PGN next.
    }

    const chess = new Chess();
    chess.loadPgn(text);
    const metadata = chess.header();
    const startingFen = metadata.FEN || DEFAULT_FEN;

    return {
        type: 'pgn',
        startingFen,
        history: buildHistoryFromChess(chess, startingFen),
        metadata,
        result: extractPgnResult(text, metadata),
    };
};

const AnalyzeBoard = () => {
    const { gameId: masterReviewGameId, pgnGameId, botSelfAnalysisGameId, botReviewGameId, collectionSlug, collectionGameId, savedAnalysisId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const isMasterReviewRoute = Boolean(masterReviewGameId);
    const isPgnReviewRoute = Boolean(pgnGameId);
    const isBotSelfAnalysisRoute = Boolean(botSelfAnalysisGameId);
    const isBotReviewRoute = Boolean(botReviewGameId);
    const botAnalysisGameId = botSelfAnalysisGameId || botReviewGameId;
    const isSavedAnalysisRoute = Boolean(savedAnalysisId);
    const isCollectionAnalysisRoute = Boolean(collectionSlug && collectionGameId);
    const isAnalysisGamesRoute = location.pathname === '/analysis/games';
    const isAnalysisExplorerRoute = location.pathname === '/analysis/explorer';
    const isCollectionGamesRoute = isCollectionAnalysisRoute && location.pathname.endsWith('/games');
    const isCollectionReviewRoute = isCollectionAnalysisRoute && location.pathname.endsWith('/review');
    const isCollectionSettingsRoute = isCollectionAnalysisRoute && location.pathname.endsWith('/collection-settings');
    const chessContext = useChess();
    // --- ÁLLAPOTOK ---
    const [sandboxFen, setSandboxFen] = useState(DEFAULT_FEN);

    const [sandboxStartingFen, setSandboxStartingFen] = useState(DEFAULT_FEN);

    const [sandboxHistory, setSandboxHistory] = useState([]);
    const [sandboxLastMove, setSandboxLastMove] = useState({ from: null, to: null });
    const [viewIndex, setViewIndex] = useState(-1);
    const [openingName, setOpeningName] = useState("");
    const [isFlipped, setIsFlipped] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [pendingPromotion, setPendingPromotion] = useState(null);
    const [previewFen, setPreviewFen] = useState(null);
    const [rightPanelMode, setRightPanelMode] = useState('analysis'); // 'analysis' vagy 'setup'
    const [initialAnalysis, setInitialAnalysis] = useState(null);
    const [positionEvalByFen, setPositionEvalByFen] = useState({});
    const [sandboxStatus, setSandboxStatus] = useState('ongoing');
    const [sandboxStatusReason, setSandboxStatusReason] = useState('');
    const [sandboxResult, setSandboxResult] = useState('');
    const [sandboxGameInfo, setSandboxGameInfo] = useState(null);
    const [panelNotice, setPanelNotice] = useState('');
    const [selectedSetupPiece, setSelectedSetupPiece] = useState(null); // 'P', 'k', stb.
    const [masterReviewGame, setMasterReviewGame] = useState(null);
    const [userAvatarUrl, setUserAvatarUrl] = useState('');
    const [masterReviewStarted, setMasterReviewStarted] = useState(false);
    const [isSandboxReviewLocked, setIsSandboxReviewLocked] = useState(false);
    const [isSandboxReviewComplete, setIsSandboxReviewComplete] = useState(false);
    const [revealedBotAnalysisIndex, setRevealedBotAnalysisIndex] = useState(-1);
    const [analysisSessionId, setAnalysisSessionId] = useState(createAnalysisSessionId);
    const [collectionContext, setCollectionContext] = useState(null);
    const [collectionSavedGame, setCollectionSavedGame] = useState(null);
    const [lastSavedGameSignature, setLastSavedGameSignature] = useState(null);
    const [analysisPanelTab, setAnalysisPanelTab] = useState(isAnalysisExplorerRoute ? 'explore' : 'analysis');
    const [hasLoadedSetupPosition, setHasLoadedSetupPosition] = useState(false);
    const [showCustomPositionMenu, setShowCustomPositionMenu] = useState(false);
    const [setupTurn, setSetupTurn] = useState('w');
    const autoStartedBotReviewRef = useRef(null);
    const autoStartedMasterReviewRef = useRef(null);
    const autoStartedPgnReviewRef = useRef(null);
    const isResettingAnalysisRef = useRef(false);
    

    const {
        getSquareName, setSelectedSquare, setValidMoves, API_BASE,
        selectedSquare, validMoves, isDragging, setIsDragging,
        token, playSound, setMousePos, setDragOffset, 
        setHoverSquare, hoverSquare, mousePos
    } = chessContext;
    const userAvatarSrc = profileAvatarSrc(userAvatarUrl);

    const clearBoardInteraction = useCallback(() => {
        setSelectedSquare(null);
        setValidMoves([]);
        setHoverSquare(null);
        setIsDragging(false);
        setPendingPromotion(null);
    }, [setSelectedSquare, setValidMoves, setHoverSquare, setIsDragging]);

    useEffect(() => {
        clearBoardInteraction();
    }, [location.pathname, clearBoardInteraction]);

    useEffect(() => {
        if (!token || !API_BASE) return;

        let isMounted = true;
        axios.get(`${API_BASE}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            if (isMounted) setUserAvatarUrl(res.data.avatar_url || '');
        }).catch(() => {});

        const handleAvatarUpdated = (event) => {
            setUserAvatarUrl(event.detail?.avatarUrl || '');
        };
        window.addEventListener('profile-avatar-updated', handleAvatarUpdated);

        return () => {
            isMounted = false;
            window.removeEventListener('profile-avatar-updated', handleAvatarUpdated);
        };
    }, [API_BASE, token]);

    // --- PERSISTENCE ---
    
    useEffect(() => {
    if (isMasterReviewRoute || isCollectionAnalysisRoute || isSavedAnalysisRoute || isBotSelfAnalysisRoute || isBotReviewRoute) return;
    if (location.pathname === '/analysis' && !location.search) {
        deleteCurrentAnalysisDraft();
        return;
    }
    let isMounted = true;
    const loadDraft = async () => {
    const data = await loadCurrentAnalysisDraft();
    if (isMounted && data) {
        try {
            
            // A meglévő betöltéseid:
            if (data.fen) setSandboxFen(data.fen);
            if (data.history) setSandboxHistory(data.history);
            if (data.lastMove) setSandboxLastMove(data.lastMove);
            if (data.opening) setOpeningName(data.opening);
            if (data.initialAnalysis) setInitialAnalysis(data.initialAnalysis);
            if (data.sandboxResult) setSandboxResult(data.sandboxResult);
            if (data.sandboxGameInfo) setSandboxGameInfo(data.sandboxGameInfo);
            if (data.panelNotice) setPanelNotice(data.panelNotice);
            if (data.isSandboxReviewComplete) setIsSandboxReviewComplete(true);
            if (data.masterReviewStarted) setMasterReviewStarted(true);
            if (data.analysisSessionId) setAnalysisSessionId(data.analysisSessionId);
            if (data.hasLoadedSetupPosition) setHasLoadedSetupPosition(true);
            if (typeof data.showCustomPositionMenu === 'boolean') setShowCustomPositionMenu(data.showCustomPositionMenu);

            if (data.startingFen) {
                setSandboxStartingFen(data.startingFen);
            } else if (data.fen && (!data.history || data.history.length === 0)) {
            
                setSandboxStartingFen(data.fen);
            }

        } catch (e) {
            console.error("Hiba a cache betöltésekor:", e);
        }
    }
    };
    loadDraft();
    return () => { isMounted = false; };
    }, [isMasterReviewRoute, isCollectionAnalysisRoute, isSavedAnalysisRoute, isBotSelfAnalysisRoute, isBotReviewRoute, location.pathname, location.search]); 

    useEffect(() => {
        setAnalysisPanelTab(isAnalysisExplorerRoute ? 'explore' : 'analysis');
    }, [isAnalysisExplorerRoute]);

    useEffect(() => {
        if (!isCollectionAnalysisRoute) return;
        const decodedGameId = decodeURIComponent(collectionGameId);
        const moveParam = searchParams.get('move');
        const requestedMoveIndex = moveParam === null ? null : Number.parseInt(moveParam, 10);

        if (String(analysisSessionId) === String(decodedGameId) && sandboxHistory.length > 0) {
            if (moveParam === null) {
                setSandboxFen(sandboxStartingFen || DEFAULT_FEN);
                setSandboxLastMove({ from: null, to: null });
                setViewIndex(-2);
                return;
            }
            const hasValidMoveIndex = Number.isInteger(requestedMoveIndex) && requestedMoveIndex >= 0 && requestedMoveIndex < sandboxHistory.length;
            const displayedMove = hasValidMoveIndex ? sandboxHistory[requestedMoveIndex] : null;
            setSandboxFen(displayedMove?.fen || DEFAULT_FEN);
            setSandboxLastMove(displayedMove ? { from: displayedMove.from, to: displayedMove.to } : { from: null, to: null });
            setViewIndex(hasValidMoveIndex ? requestedMoveIndex : -2);
            return;
        }

        const loadCollectionGame = async () => {
        try {
            const collections = await loadCollections();
            const publicId = extractPublicIdFromSlug(collectionSlug);
            const collection = collections.find((item) => item.publicId === publicId || getCollectionGames(item).some((game) => String(game.id) === String(decodedGameId)));
            const game = getCollectionGames(collection).find((item) => String(item.id) === String(decodedGameId));
            if (!game) {
                setPanelNotice('Could not load this collection game.');
                return;
            }

            const startingFen = game.startingFen || DEFAULT_FEN;
            const rawHistory = Array.isArray(game.analysisHistory) && game.analysisHistory.length
                ? game.analysisHistory
                : parseMasterGameHistory(game);
            const parsedHistory = normalizeBotHistory(rawHistory, startingFen);
            const hasValidMoveIndex = Number.isInteger(requestedMoveIndex) && requestedMoveIndex >= 0 && requestedMoveIndex < parsedHistory.length;
            const displayedMove = hasValidMoveIndex ? parsedHistory[requestedMoveIndex] : null;
            const isFinishedSavedGame = Boolean(game.result && game.result !== '*');
            setCollectionContext({
                id: collection?.id || '',
                name: collection?.name || 'Collection',
                ownerName: collection?.ownerName || '',
                privacy: collection?.privacy || 'private',
                createdAt: collection?.createdAt || '',
                updatedAt: collection?.updatedAt || collection?.createdAt || '',
            });
                setCollectionSavedGame(game);
                setHasLoadedSetupPosition(Boolean(game.startingFen && game.startingFen !== DEFAULT_FEN && parsedHistory.length === 0));
                setShowCustomPositionMenu(false);
            setLastSavedGameSignature(getGameSaveSignature(parsedHistory, startingFen));
            setMasterReviewGame(null);
            setMasterReviewStarted(isFinishedSavedGame);
            setIsSandboxReviewComplete(isFinishedSavedGame);
            setIsSandboxReviewLocked(isFinishedSavedGame);
            setAnalysisSessionId(String(game.id));
            setSandboxStartingFen(startingFen);
            setSandboxHistory(parsedHistory);
            setSandboxFen(displayedMove?.fen || startingFen);
            setSandboxLastMove(displayedMove ? { from: displayedMove.from, to: displayedMove.to } : { from: null, to: null });
            setViewIndex(hasValidMoveIndex ? requestedMoveIndex : -2);
            setOpeningName(game.opening || '');
            setInitialAnalysis(game.initialAnalysis || null);
            setSandboxResult(game.result && game.result !== '*' ? game.result : '');
            setSandboxGameInfo({
                white: game.white || '',
                black: game.black || '',
                result: game.result && game.result !== '*' ? game.result : '',
            });
            setPanelNotice('');
            setRightPanelMode('analysis');
        } catch (err) {
            console.error('Collection analysis load failed:', err);
            setPanelNotice('Could not load this collection game.');
        }
        };
        loadCollectionGame();
    }, [isCollectionAnalysisRoute, isCollectionGamesRoute, collectionSlug, collectionGameId, searchParams]);

    useEffect(() => {
        if (!isSavedAnalysisRoute || !savedAnalysisId) return;
        const decodedGameId = decodeURIComponent(savedAnalysisId);
        const moveParam = searchParams.get('move');
        const requestedMoveIndex = moveParam === null ? null : Number.parseInt(moveParam, 10);

        const loadSavedAnalysisGame = async () => {
        try {
            const game = await getSavedAnalysis(decodedGameId);
            if (!game) {
                setPanelNotice('Could not load this saved analysis.');
                return;
            }

            const parsedHistory = Array.isArray(game.analysisHistory) && game.analysisHistory.length
                ? game.analysisHistory
                : parseMasterGameHistory(game);
            const startingFen = game.startingFen || DEFAULT_FEN;
            const hasValidMoveIndex = Number.isInteger(requestedMoveIndex) && requestedMoveIndex >= 0 && requestedMoveIndex < parsedHistory.length;
            const displayedMove = hasValidMoveIndex ? parsedHistory[requestedMoveIndex] : null;

            setCollectionContext(null);
            setCollectionSavedGame(game);
            setHasLoadedSetupPosition(Boolean(game.startingFen && game.startingFen !== DEFAULT_FEN && parsedHistory.length === 0));
            setShowCustomPositionMenu(false);
            setLastSavedGameSignature(getGameSaveSignature(parsedHistory, startingFen));
            setMasterReviewGame(null);
            setMasterReviewStarted(Boolean(game.analysisHistory?.length));
            setIsSandboxReviewComplete(Boolean(game.analysisHistory?.length));
            setIsSandboxReviewLocked(Boolean(game.analysisHistory?.length));
            setAnalysisSessionId(String(game.id));
            setSandboxStartingFen(startingFen);
            setSandboxHistory(parsedHistory);
            setSandboxFen(displayedMove?.fen || startingFen);
            setSandboxLastMove(displayedMove ? { from: displayedMove.from, to: displayedMove.to } : { from: null, to: null });
            setViewIndex(hasValidMoveIndex ? requestedMoveIndex : -2);
            setOpeningName(game.opening || '');
            setInitialAnalysis(game.initialAnalysis || null);
            setSandboxResult(game.result && game.result !== '*' ? game.result : '');
            setSandboxGameInfo(game.gameInfo || {
                white: game.white || '',
                black: game.black || '',
                result: game.result && game.result !== '*' ? game.result : '',
            });
            setPanelNotice('');
            setRightPanelMode('analysis');
        } catch (err) {
            console.error('Saved analysis load failed:', err);
            setPanelNotice('Could not load this saved analysis.');
        }
        };
        loadSavedAnalysisGame();
    }, [isSavedAnalysisRoute, savedAnalysisId, searchParams]);

    useEffect(() => {
        if (!isMasterReviewRoute || !masterReviewGameId || !API_BASE) return;

        let isMounted = true;
        const loadMasterGame = async () => {
            setIsAnalyzing(true);
            setPanelNotice('');
            setMasterReviewStarted(false);
            setIsSandboxReviewComplete(false);
            setIsSandboxReviewLocked(false);
            setRevealedBotAnalysisIndex(-1);
            try {
                const res = await axios.get(`${API_BASE}/database/games/${masterReviewGameId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!isMounted) return;

                const game = res.data;
                const parsedHistory = parseMasterGameHistory(game);
                const latest = parsedHistory[parsedHistory.length - 1];
                const detectedOpening = game.detected_opening?.name || game.opening || '';

                setMasterReviewGame(game);
                setSandboxStartingFen(DEFAULT_FEN);
                setSandboxHistory(parsedHistory);
                setSandboxFen(latest?.fen || DEFAULT_FEN);
                setSandboxLastMove(latest ? { from: latest.from, to: latest.to } : { from: null, to: null });
                setViewIndex(-1);
                setOpeningName(detectedOpening);
                setInitialAnalysis(null);
                setSandboxResult(game.result && game.result !== '*' ? game.result : '');
                setSandboxGameInfo({
                    white: game.white || '',
                    black: game.black || '',
                    result: game.result && game.result !== '*' ? game.result : '',
                });
                setRightPanelMode('analysis');
            } catch (err) {
                console.error("Master review game load failed:", err);
                if (isMounted) setPanelNotice('Could not load this master game.');
            } finally {
                if (isMounted) setIsAnalyzing(false);
            }
        };

        loadMasterGame();
        return () => { isMounted = false; };
    }, [isMasterReviewRoute, masterReviewGameId, API_BASE, token]);

    useEffect(() => {
        if ((!isBotSelfAnalysisRoute && !isBotReviewRoute) || !botAnalysisGameId || !API_BASE) return;

        let isMounted = true;
        const loadBotGame = async () => {
            if (isBotSelfAnalysisRoute) setIsAnalyzing(true);
            setPanelNotice('');
            setMasterReviewStarted(false);
            setIsSandboxReviewComplete(false);
            setIsSandboxReviewLocked(false);
            clearBoardInteraction();
            try {
                const res = await axios.get(`${API_BASE}/game/${botAnalysisGameId}/history`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!isMounted) return;

                const data = { ...res.data, game_id: botAnalysisGameId };
                const parsedHistory = normalizeBotHistory(data.history || []);
                const botGame = buildBotAnalysisGame(data, userAvatarSrc);
                const latestMove = parsedHistory[parsedHistory.length - 1];
                const shouldOpenLatestMove = false;
                const sandboxLikeHistory = isBotSelfAnalysisRoute
                    ? parsedHistory.map((move) => ({
                        ...move,
                        analysisLabel: null,
                        eval: undefined,
                        rawEval: undefined,
                        bestMove: undefined,
                        bestMoveUci: undefined,
                        bestEval: undefined,
                        rawBestEval: undefined,
                        evalLoss: undefined,
                        winChanceLoss: undefined,
                        engineLines: [],
                        bestEngineLines: [],
                        analysisPending: false,
                        analysisFailed: false,
                    }))
                    : parsedHistory;

                setMasterReviewGame(isBotSelfAnalysisRoute ? null : botGame);
                setSandboxStartingFen(DEFAULT_FEN);
                setSandboxHistory(sandboxLikeHistory);
                setSandboxFen(shouldOpenLatestMove ? latestMove.fen : DEFAULT_FEN);
                setSandboxLastMove(shouldOpenLatestMove ? { from: latestMove.from, to: latestMove.to } : { from: null, to: null });
                setViewIndex(shouldOpenLatestMove ? sandboxLikeHistory.length - 1 : -2);
                setOpeningName(botGame.opening || '');
                setInitialAnalysis(null);
                setSandboxResult(botGame.result || '');
                setSandboxGameInfo({
                    white: botGame.white,
                    black: botGame.black,
                    white_avatar: botGame.white_avatar,
                    black_avatar: botGame.black_avatar,
                    result: botGame.result || '',
                });
                setRightPanelMode('analysis');

                if (isBotSelfAnalysisRoute && sandboxLikeHistory.length > 0) {
                    const startRes = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                        fen_before: DEFAULT_FEN,
                        move: null,
                        prev_eval: 0,
                    }, {
                        headers: { Authorization: `Bearer ${token}` },
                    });

                    if (!isMounted) return;
                    const startRawEval = Number(startRes.data?.eval);
                    setInitialAnalysis({
                        eval: Number.isFinite(startRawEval) ? startRawEval / 100 : 0,
                        engineLines: startRes.data?.engine_lines || [],
                    });
                    if (startRes.data?.opening) {
                        setOpeningName(typeof startRes.data.opening === 'object'
                            ? startRes.data.opening.name
                            : startRes.data.opening);
                    }

                    let prevEval = 30;
                    const analyzedHistory = [];

                    for (const move of sandboxLikeHistory) {
                        const moveRes = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                            fen_before: move.fen_before,
                            move: move.m,
                            prev_eval: prevEval,
                        }, {
                            headers: { Authorization: `Bearer ${token}` },
                        });

                        if (!isMounted) return;
                        const rawEval = Number(moveRes.data?.eval);
                        prevEval = Number.isFinite(rawEval) ? rawEval : prevEval;

                        analyzedHistory.push({
                            ...move,
                            analysisLabel: moveRes.data?.label?.toLowerCase(),
                            eval: Number.isFinite(rawEval) ? rawEval / 100 : move.eval,
                            rawEval,
                            bestMove: moveRes.data?.best_move,
                            bestMoveUci: moveRes.data?.best_move_uci,
                            bestEval: moveRes.data?.best_eval,
                            rawBestEval: moveRes.data?.raw_best_eval,
                            evalLoss: moveRes.data?.eval_loss,
                            winChanceLoss: moveRes.data?.win_chance_loss,
                            engineLines: moveRes.data?.engine_lines || [],
                            bestEngineLines: moveRes.data?.best_engine_lines || [],
                            analysisPending: false,
                            analysisFailed: false,
                        });

                        if (moveRes.data?.opening) {
                            setOpeningName(typeof moveRes.data.opening === 'object'
                                ? moveRes.data.opening.name
                                : moveRes.data.opening);
                        }
                    }

                    setSandboxHistory(analyzedHistory);
                    setSandboxFen(DEFAULT_FEN);
                    setSandboxLastMove({ from: null, to: null });
                    setViewIndex(-2);
                }
            } catch (err) {
                console.error("Bot analysis game load failed:", err);
                if (isMounted) setPanelNotice('Could not load this bot game.');
            } finally {
                if (isMounted && isBotSelfAnalysisRoute) setIsAnalyzing(false);
            }
        };

        loadBotGame();
        return () => { isMounted = false; };
    }, [isBotSelfAnalysisRoute, isBotReviewRoute, botAnalysisGameId, API_BASE, token, userAvatarSrc, clearBoardInteraction]);

    useEffect(() => {
        if (isMasterReviewRoute || isCollectionAnalysisRoute || isSavedAnalysisRoute || isPgnReviewRoute || isBotSelfAnalysisRoute || isBotReviewRoute) return;
        const cache = { 
            fen: sandboxFen, 
            history: sandboxHistory, 
            lastMove: sandboxLastMove, 
            opening: openingName, 
            startingFen: sandboxStartingFen,
            initialAnalysis,
            sandboxResult,
            sandboxGameInfo,
            panelNotice,
            isSandboxReviewComplete,
            masterReviewStarted,
            analysisSessionId,
            hasLoadedSetupPosition,
            showCustomPositionMenu,
        };
        writeLocalAnalysisDraft(cache);
        const saveTimer = window.setTimeout(() => {
            saveCurrentAnalysisDraft(cache);
        }, 500);
        return () => window.clearTimeout(saveTimer);
    }, [isMasterReviewRoute, isCollectionAnalysisRoute, isSavedAnalysisRoute, isPgnReviewRoute, isBotSelfAnalysisRoute, isBotReviewRoute, sandboxFen, sandboxHistory, sandboxLastMove, openingName, sandboxStartingFen, initialAnalysis, sandboxResult, sandboxGameInfo, panelNotice, isSandboxReviewComplete, masterReviewStarted, analysisSessionId, hasLoadedSetupPosition, showCustomPositionMenu]);

    useEffect(() => {
        if (!isPgnReviewRoute || sandboxHistory.length === 0) return;
        const moveParam = searchParams.get('move');
        if (moveParam === null) {
            if (!masterReviewStarted) {
                setSandboxFen(sandboxStartingFen || DEFAULT_FEN);
                setSandboxLastMove({ from: null, to: null });
                setViewIndex(-2);
            }
            return;
        }
        const requestedMoveIndex = Number.parseInt(moveParam, 10);
        if (!Number.isInteger(requestedMoveIndex) || requestedMoveIndex < 0 || requestedMoveIndex >= sandboxHistory.length) return;
        const move = sandboxHistory[requestedMoveIndex];
        setSandboxFen(move.fen);
        setSandboxLastMove({ from: move.from, to: move.to });
        setViewIndex(requestedMoveIndex);
    }, [isPgnReviewRoute, searchParams, sandboxHistory, masterReviewStarted, sandboxStartingFen]);

    useEffect(() => {
        const { status, reason } = getSandboxGameState(sandboxFen);
        setSandboxStatus(status);
        setSandboxStatusReason(reason);
    }, [sandboxFen]);

    useEffect(() => {
        if (!API_BASE || !token || !sandboxFen || previewFen) return;
        if (isAnalyzing || isMasterReviewRoute || isBotReviewRoute || isBotSelfAnalysisRoute) return;

        const targetIndex = viewIndex === -1 ? sandboxHistory.length - 1 : Number.parseInt(viewIndex, 10);
        const targetMove = Number.isInteger(targetIndex) ? sandboxHistory[targetIndex] : null;
        const targetFen = viewIndex === -1 ? sandboxFen : (targetMove?.fen || sandboxFen);
        if (!targetFen || positionEvalByFen[targetFen] !== undefined) return;
        if (targetMove?.eval !== undefined && targetMove?.eval !== null) return;
        if (!targetMove && initialAnalysis?.eval !== undefined && targetFen === sandboxStartingFen) return;

        let isMounted = true;
        const loadPositionEval = async () => {
            try {
                const previousEval = findPreviousBarEval(sandboxHistory, targetIndex, positionEvalByFen);
                const res = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                    fen_before: targetFen,
                    move: null,
                    prev_eval: normalizeEvalForBar(previousEval, initialAnalysis?.eval ?? 0) * 100,
                }, { headers: { Authorization: `Bearer ${token}` } });
                if (!isMounted || res.data?.error) return;

                const rawEval = Number(res.data?.eval);
                const nextEval = Number.isFinite(rawEval)
                    ? rawEval / 100
                    : normalizeEvalForBar(res.data?.eval, initialAnalysis?.eval ?? 0);

                setPositionEvalByFen((current) => ({ ...current, [targetFen]: nextEval }));

                if (targetMove?.fen === targetFen && Number.isInteger(targetIndex)) {
                    setSandboxHistory((current) => current.map((move, index) => (
                        index === targetIndex && move?.fen === targetFen
                            ? { ...move, eval: nextEval, rawEval: Number.isFinite(rawEval) ? rawEval : move.rawEval }
                            : move
                    )));
                }

                if (!targetMove && sandboxHistory.length === 0 && targetFen === sandboxFen) {
                    setInitialAnalysis((current) => current || {
                        eval: nextEval,
                        engineLines: res.data?.engine_lines || [],
                    });
                }
            } catch (err) {
                console.error('Position eval failed:', err);
            }
        };

        loadPositionEval();
        return () => { isMounted = false; };
    }, [
        API_BASE,
        token,
        sandboxFen,
        previewFen,
        viewIndex,
        sandboxHistory,
        positionEvalByFen,
        initialAnalysis,
        sandboxStartingFen,
        isAnalyzing,
        isMasterReviewRoute,
        isBotReviewRoute,
        isBotSelfAnalysisRoute,
    ]);

    useEffect(() => {
        if (!isCollectionAnalysisRoute || viewIndex < 0 || !API_BASE || !token) return;
        const move = sandboxHistory[viewIndex];
        if (!move || move.analysisLabel || move.engineLines?.length || move.engine_lines?.length) return;

        let isMounted = true;
        const analyzeMissingCollectionMove = async () => {
            try {
                const prevEval = viewIndex > 0 ? (sandboxHistory[viewIndex - 1].rawEval || 0) : 0;
                const res = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                    fen_before: move.fen_before,
                    move: move.m,
                    prev_eval: prevEval,
                }, { headers: { Authorization: `Bearer ${token}` } });

                if (!isMounted) return;
                setSandboxHistory((prev) => prev.map((item, index) => (
                    index === viewIndex ? {
                        ...item,
                        analysisLabel: res.data.label?.toLowerCase(),
                        eval: res.data.eval / 100,
                        rawEval: res.data.eval,
                        bestMove: res.data.best_move,
                        bestMoveUci: res.data.best_move_uci,
                        bestEval: res.data.best_eval,
                        rawBestEval: res.data.raw_best_eval,
                        evalLoss: res.data.eval_loss,
                        winChanceLoss: res.data.win_chance_loss,
                        engineLines: res.data.engine_lines || [],
                        bestEngineLines: res.data.best_engine_lines || [],
                    } : item
                )));

                if (res.data.opening) {
                    setOpeningName(typeof res.data.opening === 'object' ? res.data.opening.name : res.data.opening);
                }
            } catch (err) {
                console.error('Collection move analysis failed:', err);
            }
        };

        analyzeMissingCollectionMove();
        return () => { isMounted = false; };
    }, [isCollectionAnalysisRoute, viewIndex, sandboxHistory, API_BASE, token]);

    useEffect(() => {
        if (!isCollectionAnalysisRoute || viewIndex > -2 || initialAnalysis || !API_BASE || !token) return;

        let isMounted = true;
        const analyzeCollectionStartingPosition = async () => {
            try {
                const startFen = sandboxStartingFen || DEFAULT_FEN;
                const res = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                    fen_before: startFen,
                    move: null,
                    prev_eval: 0,
                }, { headers: { Authorization: `Bearer ${token}` } });

                if (!isMounted) return;
                const rawEval = Number(res.data?.eval);
                const nextInitialAnalysis = {
                    eval: Number.isFinite(rawEval) ? rawEval / 100 : 0,
                    engineLines: res.data?.engine_lines || [],
                };
                setInitialAnalysis(nextInitialAnalysis);

                if (res.data?.opening && !openingName) {
                    setOpeningName(typeof res.data.opening === 'object' ? res.data.opening.name : res.data.opening);
                }

                if (collectionSavedGame?.id) {
                    const updatedGame = {
                        ...collectionSavedGame,
                        initialAnalysis: nextInitialAnalysis,
                    };
                    updateSavedAnalysisGame(updatedGame);
                    setCollectionSavedGame(updatedGame);
                }
            } catch (err) {
                console.error('Collection starting position analysis failed:', err);
            }
        };

        analyzeCollectionStartingPosition();
        return () => { isMounted = false; };
    }, [isCollectionAnalysisRoute, viewIndex, initialAnalysis, API_BASE, token, sandboxStartingFen, collectionSavedGame, openingName]);

    useEffect(() => {
        if (isMasterReviewRoute || isCollectionAnalysisRoute || !API_BASE || !token || isAnalyzing) return;
        if (!sandboxHistory.length) return;

        const targetIndex = viewIndex >= 0 ? viewIndex : sandboxHistory.length - 1;
        const move = sandboxHistory[targetIndex];
        const hasEngineLines = Boolean(move?.engineLines?.length || move?.engine_lines?.length);
        const hasFullMoveAnalysis = hasEngineLines && Boolean(move?.analysisLabel || move?.bestMove || move?.bestMoveUci);
        if (
            !move ||
            hasFullMoveAnalysis ||
            move.analysisPending ||
            move.analysisFailed
        ) {
            return;
        }

        let isMounted = true;
        setSandboxHistory((prev) => prev.map((item, index) => (
            index === targetIndex ? { ...item, analysisPending: true } : item
        )));

        const analyzeMissingSandboxMove = async () => {
            setIsAnalyzing(true);
            try {
                const prevEval = targetIndex > 0 ? (sandboxHistory[targetIndex - 1].rawEval || 0) : 0;
                const res = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                    fen_before: move.fen_before,
                    move: move.m,
                    prev_eval: prevEval,
                }, { headers: { Authorization: `Bearer ${token}` } });

                if (!isMounted) return;
                setSandboxHistory((prev) => prev.map((item, index) => (
                    index === targetIndex ? {
                        ...item,
                        analysisPending: false,
                        analysisLabel: res.data.label?.toLowerCase(),
                        eval: res.data.eval / 100,
                        rawEval: res.data.eval,
                        bestMove: res.data.best_move,
                        bestMoveUci: res.data.best_move_uci,
                        bestEval: res.data.best_eval,
                        rawBestEval: res.data.raw_best_eval,
                        evalLoss: res.data.eval_loss,
                        winChanceLoss: res.data.win_chance_loss,
                        engineLines: res.data.engine_lines || [],
                        bestEngineLines: res.data.best_engine_lines || [],
                    } : item
                )));

                if (res.data.opening) {
                    setOpeningName(typeof res.data.opening === 'object' ? res.data.opening.name : res.data.opening);
                }
            } catch (err) {
                console.error('Sandbox cached move analysis failed:', err);
                if (isMounted) {
                    setSandboxHistory((prev) => prev.map((item, index) => (
                        index === targetIndex ? { ...item, analysisPending: false, analysisFailed: true } : item
                    )));
                }
            } finally {
                if (isMounted) setIsAnalyzing(false);
            }
        };

        analyzeMissingSandboxMove();
        return () => { isMounted = false; };
    }, [isMasterReviewRoute, isCollectionAnalysisRoute, viewIndex, sandboxHistory, API_BASE, token, isAnalyzing]);



    const handleHoverVariation = useCallback((pvUci) => {
        if (!pvUci || pvUci.length === 0) {
            setPreviewFen(null);
            return;
        }
        try {
            const tempChess = new Chess(sandboxFen);
            for (const uci of pvUci) {
                tempChess.move({ 
                    from: uci.slice(0, 2), 
                    to: uci.slice(2, 4), 
                    promotion: uci[4] || 'q' 
                });
            }
            setPreviewFen(tempChess.fen());
        } catch {
            setPreviewFen(null);
        }
    }, [sandboxFen]);

    // --- LÉPÉS VÉGREHAJTÁS ---
    const executeAnalysisMove = async (from, to, promotion = null) => {
    if (sandboxStatus !== 'ongoing' || isSandboxReviewLocked || isSandboxReviewComplete) {
        return;
    }

    if (viewIndex !== -1 && !(viewIndex <= -2 && sandboxHistory.length === 0)) {
        const latest = sandboxHistory[sandboxHistory.length - 1];
        if (latest) {
            setSandboxFen(latest.fen);
            setSandboxLastMove({ from: latest.from, to: latest.to });
        }
        setViewIndex(-1);
        return; 
    }
    if (viewIndex <= -2 && sandboxHistory.length === 0) {
        setViewIndex(-1);
    }

    setSelectedSquare(null);
    setValidMoves([]);
    setHoverSquare(null);

    const chess = new Chess(sandboxFen);
    const fenBefore = sandboxFen; // Ezt használjuk referenciaként
    const piece = chess.get(from);

    if (piece?.type === 'p' && (to.endsWith('8') || to.endsWith('1')) && !promotion) {
        setPendingPromotion({ from, to });
        setIsDragging(false);
        return;
    }

    const moveAttempt = chess.move({ from, to, promotion: promotion || 'q' });
    if (!moveAttempt) return;

    const newFen = chess.fen();
    setSandboxFen(newFen);
    setSandboxLastMove({ from, to });
    setPendingPromotion(null);
    setPanelNotice('');
    setSandboxResult('');
    setSandboxGameInfo(null);
    if (isCollectionGamesRoute) {
        navigate(`/analysis/collection/${collectionSlug}/${encodeURIComponent(collectionGameId)}/analysis`, { replace: true });
    } else if (isAnalysisGamesRoute) {
        navigate('/analysis', { replace: true });
    }
    setIsSandboxReviewComplete(false);
    setIsSandboxReviewLocked(false);
    setMasterReviewStarted(false);

    // JAVÍTÁS: Hozzáadjuk a fen_before mezőt a mentett lépéshez
    const tempMove = {
        num: sandboxHistory.length,
        m: moveAttempt.san,
        from, to,
        fen: newFen,
        fen_before: fenBefore, // <--- EZT HIÁNYOLTA AZ ANALYSISPANEL
        analysisLabel: null,
        analysisPending: true,
    };
    
    setSandboxHistory(prev => [...prev, tempMove]);
    if (isCollectionAnalysisRoute && !isCollectionReviewRoute) {
        setSearchParams({ move: String(sandboxHistory.length) }, { replace: true });
    }
    playSound(moveAttempt.captured ? 'capture' : 'move');

    setIsAnalyzing(true);
    try {
        const prevEval = sandboxHistory.length > 0 
            ? (sandboxHistory[sandboxHistory.length - 1].rawEval || 0) 
            : 0;

        const res = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
            fen_before: fenBefore, 
            move: moveAttempt.san, 
            prev_eval: prevEval
        }, { headers: { Authorization: `Bearer ${token}` } });

        setSandboxHistory(prev => prev.map((h, i) => 
            i === prev.length - 1 ? {
                ...h,
                analysisPending: false,
                analysisLabel: res.data.label?.toLowerCase(),
                eval: res.data.eval / 100,
                rawEval: res.data.eval,
                bestMove: res.data.best_move,
                bestMoveUci: res.data.best_move_uci,
                bestEval: res.data.best_eval,
                rawBestEval: res.data.raw_best_eval,
                evalLoss: res.data.eval_loss,
                winChanceLoss: res.data.win_chance_loss,
                engineLines: res.data.engine_lines || [],
                bestEngineLines: res.data.best_engine_lines || [],
            } : h
        ));

        if (res.data.opening) {
            setOpeningName(typeof res.data.opening === 'object' ? res.data.opening.name : res.data.opening);
        }
        if (res.data.message) {
            setPanelNotice(res.data.message);
        }
    } catch (err) {
        console.error("Analysis error:", err);
        setSandboxHistory(prev => prev.map((h, i) => (
            i === prev.length - 1 ? { ...h, analysisPending: false, analysisFailed: true } : h
        )));
    } finally { 
        setIsAnalyzing(false); 
    }
};

const buildCurrentSandboxSavedGame = (id, history = sandboxHistory, overrides = {}) => ({
    id,
    source: 'analysis',
    white: sandboxGameInfo?.white || 'White',
    black: sandboxGameInfo?.black || 'Black',
    result: sandboxResult || sandboxGameInfo?.result || '*',
    date: sandboxGameInfo?.date || formatToday(),
    event: 'Game Review, Analysis',
    site: sandboxGameInfo?.site || 'Checkmate Analysis',
    opening: openingName || sandboxGameInfo?.opening || '',
    eco: sandboxGameInfo?.eco || '',
    moves: buildSandboxMoves(history),
    analysisHistory: history,
    fen: getLatestHistoryFen(history, sandboxFen),
    startingFen: sandboxStartingFen,
    initialAnalysis,
    gameInfo: sandboxGameInfo,
    addedAt: new Date().toISOString(),
    ...overrides,
});

const handleFullReview = async ({ stayOnIntro = false } = {}) => {
    console.log("--- DEBUG: Full Review Folyamat Elindult ---");
    const isStoredBotReview = isBotReviewRoute && botReviewGameId;
    const isStoredMasterReview = isMasterReviewRoute && masterReviewGameId;
    
    // 1. Ellenőrizzük, van-e egyáltalán mit elemezni
    if (sandboxHistory.length === 0 && !isStoredBotReview) {
        console.warn("STOP: A sandboxHistory üres, nincs mit elemezni.");
        setPanelNotice('No moves available to review.');
        return;
    }

    setIsSandboxReviewLocked(true);
    setIsSandboxReviewComplete(false);
    setIsAnalyzing(true);

    try {
        
        const moveList = sandboxHistory.map(h => h.m);
        const startFen = typeof sandboxStartingFen !== 'undefined' && sandboxStartingFen 
            ? sandboxStartingFen 
            : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

        console.log("1. Küldésre kész adatok:", {
            initial_fen: startFen,
            moves_count: moveList.length,
            moves: moveList
        });


        console.log("2. API hívás indítása:", isStoredBotReview ? `/analyze-full-game/${botReviewGameId}` : "/analyze-full-game-sandbox");
        const res = isStoredBotReview
            ? await axios.post(`${API_BASE}/analyze-full-game/${botReviewGameId}`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            })
            : await axios.post(`${API_BASE}/analyze-full-game-sandbox`, {
                moves: moveList,
                initial_fen: sandboxStartingFen,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

        console.log("3. Szerver válasz megérkezett:", res.data);

        if (res.data && res.data.analysis) {
            console.log("4. History frissítése az elemzési adatokkal...");
            
            let baseHistory = sandboxHistory;
            if (isStoredBotReview) {
                try {
                    const refreshed = await axios.get(`${API_BASE}/game/${botReviewGameId}/history`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    baseHistory = normalizeBotHistory(refreshed.data?.history || []);
                } catch (refreshError) {
                    console.error("Could not refresh bot history after review:", refreshError);
                }
            }

            let reviewedHistory = baseHistory;
            setSandboxHistory(prev => {
                const sourceHistory = isStoredBotReview ? baseHistory : prev;
                const updatedHistory = sourceHistory.map((h, i) => {
                    // Megkeressük a válaszban a lépés sorszáma alapján (1-től indul a backend-en)
                    const moveAnalysis = res.data.analysis.find(a => a.move_number === (i + 1));
                    
                    if (moveAnalysis) {
                        return { 
                            ...h, 
                            analysisLabel: moveAnalysis.label.toLowerCase(),
                            eval: moveAnalysis.eval, // A backend már osztotta 100-zal
                            rawEval: moveAnalysis.raw_eval,
                            bestMove: moveAnalysis.best_move,
                            bestMoveUci: moveAnalysis.best_move_uci,
                            bestEval: moveAnalysis.best_eval,
                            rawBestEval: moveAnalysis.raw_best_eval,
                            evalLoss: moveAnalysis.eval_loss,
                            winChanceLoss: moveAnalysis.win_chance_loss,
                            engineLines: moveAnalysis.engine_lines || [],
                            // Megnyitás neve, ha van
                            openingName: moveAnalysis.opening || null 
                        };
                    }
                    return h;
                });
                
                console.log("5. Frissített Sandbox History:", updatedHistory);
                reviewedHistory = updatedHistory;
                return updatedHistory;
            });
            
            // Ha a szerver visszaadott egy globális megnyitás nevet, azt is beállíthatjuk
            if (res.data.analysis[0]?.opening) {
                setOpeningName(res.data.analysis[0].opening);
            }
            if (isStoredBotReview) {
                setMasterReviewGame((current) => current ? {
                    ...current,
                    white_accuracy: res.data.white_accuracy,
                    black_accuracy: res.data.black_accuracy,
                    opening: res.data.opening?.name || current.opening || '',
                } : current);
                setSandboxGameInfo((current) => current ? {
                    ...current,
                    white_accuracy: res.data.white_accuracy,
                    black_accuracy: res.data.black_accuracy,
                } : current);
            }
            if (isStoredMasterReview) {
                setMasterReviewGame((current) => current ? {
                    ...current,
                    white_accuracy: res.data.white_accuracy ?? current.white_accuracy,
                    black_accuracy: res.data.black_accuracy ?? current.black_accuracy,
                } : current);
                setSandboxGameInfo((current) => current ? {
                    ...current,
                    white_accuracy: res.data.white_accuracy ?? current.white_accuracy,
                    black_accuracy: res.data.black_accuracy ?? current.black_accuracy,
                } : current);
            }
            setMasterReviewStarted((current) => (stayOnIntro ? current : true));
            setIsSandboxReviewComplete(true);
            setPanelNotice(stayOnIntro ? '' : 'Game review complete');
            try {
                const activityDates = JSON.parse(localStorage.getItem('checkmate_activity_dates') || '[]');
                activityDates.unshift(new Date().toISOString());
                localStorage.setItem('checkmate_activity_dates', JSON.stringify(activityDates.slice(0, 90)));
                window.dispatchEvent(new Event('checkmate-activity-updated'));
            } catch {
                // Activity tracking should not block review.
            }
            if (isPgnReviewRoute) {
                setSandboxGameInfo((current) => ({
                    ...(current || {}),
                    white: current?.white || 'White',
                    black: current?.black || 'Black',
                    white_accuracy: res.data.white_accuracy,
                    black_accuracy: res.data.black_accuracy,
                }));

                const reviewId = pgnGameId || analysisSessionId || createAnalysisSessionId();
                await saveAnalysisGameToSavedList(buildCurrentSandboxSavedGame(reviewId, reviewedHistory, {
                    opening: res.data.analysis[0]?.opening || openingName || sandboxGameInfo?.opening || '',
                    white_accuracy: res.data.white_accuracy,
                    black_accuracy: res.data.black_accuracy,
                }));
                setLastSavedGameSignature(getGameSaveSignature(reviewedHistory, sandboxStartingFen));
            }
            if (isCollectionReviewRoute && collectionSavedGame?.id) {
                const updatedGame = {
                    ...collectionSavedGame,
                    ...buildCurrentSandboxSavedGame(collectionSavedGame.id, reviewedHistory, {
                        white: collectionSavedGame.white,
                        black: collectionSavedGame.black,
                        result: collectionSavedGame.result || sandboxResult || sandboxGameInfo?.result || '*',
                        opening: res.data.analysis[0]?.opening || openingName || collectionSavedGame.opening || '',
                    }),
                    white_accuracy: res.data.white_accuracy,
                    black_accuracy: res.data.black_accuracy,
                };
                await updateSavedAnalysisGame(updatedGame);
                setCollectionSavedGame(updatedGame);
                setLastSavedGameSignature(getGameSaveSignature(reviewedHistory, sandboxStartingFen));
            }
            if (isPgnReviewRoute && sandboxHistory.length > 0) {
                const firstMove = sandboxHistory[0];
                if (firstMove) {
                    setSandboxFen(firstMove.fen);
                    setSandboxLastMove({ from: firstMove.from, to: firstMove.to });
                    setViewIndex(0);
                    setSearchParams({ move: '0' }, { replace: true });
                }
            }

            console.log("--- DEBUG: Full Review Sikeresen Befejeződött ---");
        } else {
            console.error("HIBA: A szerver válaszában nincs 'analysis' mező!", res.data);
        }

    } catch (err) {
        setIsSandboxReviewLocked(false);
        console.error("!!! FULL REVIEW ERROR !!!");
        let message = err.message || 'Game review failed.';
        if (err.response) {
            console.error("Status:", err.response.status);
            message = err.response.data?.detail || err.response.data?.message || `Server error (${err.response.status})`;
            console.error("Szerver hibaüzenet:", err.response.data);
            if (err.response.status === 404) {
                console.error("404-es hiba: Még nem adtad hozzá az új végpontot a Python kódhoz!");
            }
        } else {
            console.error("Hiba oka:", err.message);
        }
        setPanelNotice(String(message));
    } finally {
        setIsAnalyzing(false);
    }
};

    useEffect(() => {
        if (!isBotReviewRoute || !botReviewGameId || !masterReviewGame || masterReviewStarted || isAnalyzing) return;
        if (masterReviewGame.white_accuracy != null || masterReviewGame.black_accuracy != null) return;
        if (autoStartedBotReviewRef.current === botReviewGameId) return;

        autoStartedBotReviewRef.current = botReviewGameId;
        handleFullReview({ stayOnIntro: true });
    }, [isBotReviewRoute, botReviewGameId, masterReviewGame, masterReviewStarted, isAnalyzing]);

    useEffect(() => {
        if (!isMasterReviewRoute || !masterReviewGameId || !masterReviewGame || masterReviewStarted || isAnalyzing) return;
        if (masterReviewGame.white_accuracy != null || masterReviewGame.black_accuracy != null) return;
        if (autoStartedMasterReviewRef.current === masterReviewGameId) return;

        autoStartedMasterReviewRef.current = masterReviewGameId;
        handleFullReview({ stayOnIntro: true });
    }, [isMasterReviewRoute, masterReviewGameId, masterReviewGame, masterReviewStarted, isAnalyzing]);

    useEffect(() => {
        if (!isPgnReviewRoute || !pgnGameId || sandboxHistory.length === 0 || masterReviewStarted || isAnalyzing) return;
        if (sandboxGameInfo?.white_accuracy != null || sandboxGameInfo?.black_accuracy != null) return;
        if (sandboxHistory.some((move) => move?.analysisLabel)) return;
        if (autoStartedPgnReviewRef.current === pgnGameId) return;

        autoStartedPgnReviewRef.current = pgnGameId;
        handleFullReview({ stayOnIntro: true });
    }, [isPgnReviewRoute, pgnGameId, sandboxHistory, masterReviewStarted, isAnalyzing, sandboxGameInfo]);

    const handleStartReviewFromIntro = () => {
        const isStoredReviewRoute = isPgnReviewRoute || isBotReviewRoute || isMasterReviewRoute || isCollectionReviewRoute;

        if (isStoredReviewRoute && isAnalyzing) {
            setMasterReviewStarted(true);
            setPanelNotice('Preparing game review...');
            setSandboxFen(sandboxStartingFen || DEFAULT_FEN);
            setSandboxLastMove({ from: null, to: null });
            setViewIndex(-2);
            clearBoardInteraction();
            return;
        }

        const hasStoredReview = isStoredReviewRoute && (
            masterReviewGame?.white_accuracy != null ||
            masterReviewGame?.black_accuracy != null ||
            sandboxGameInfo?.white_accuracy != null ||
            sandboxGameInfo?.black_accuracy != null ||
            sandboxHistory.some((move) => move?.analysisLabel)
        );

        if (hasStoredReview) {
            setMasterReviewStarted(true);
            setPanelNotice('Game review complete');
            setSandboxFen(sandboxStartingFen || DEFAULT_FEN);
            setSandboxLastMove({ from: null, to: null });
            setViewIndex(-2);
            clearBoardInteraction();
            return;
        }

        handleFullReview();
    };

    const handleReviewClick = async () => {
        if (sandboxHistory.length === 0) return;
        if (isCollectionAnalysisRoute) {
            setMasterReviewStarted(false);
            const moveSuffix = location.search || '';
            navigate(`/analysis/collection/${collectionSlug}/${encodeURIComponent(collectionGameId)}/review${moveSuffix}`);
            return;
        }
        const reviewId = pgnGameId || analysisSessionId || createAnalysisSessionId();
        if (!analysisSessionId) setAnalysisSessionId(reviewId);
        await saveAnalysisGameToSavedList(buildCurrentSandboxSavedGame(reviewId, sandboxHistory));
        setLastSavedGameSignature(currentSaveSignature);
        setMasterReviewStarted(false);
        navigate(`/analysis/game/pgn/${reviewId}/review`);
    };

    const handlePgnReviewBack = () => {
        if (!pgnGameId) return;
        setSearchParams({}, { replace: true });
        setMasterReviewStarted(false);
        setSandboxFen(sandboxStartingFen || DEFAULT_FEN);
        setSandboxLastMove({ from: null, to: null });
        setViewIndex(-2);
        navigate(`/analysis/game/pgn/${pgnGameId}/review`, { replace: true });
    };

    const handleStoredReviewBack = () => {
        setMasterReviewStarted(false);
        setPanelNotice('');
        setSandboxFen(sandboxStartingFen || DEFAULT_FEN);
        setSandboxLastMove({ from: null, to: null });
        setViewIndex(-2);
        clearBoardInteraction();
    };

    const handleStartAnalysis = async (analysisInput = '') => {
        if (!API_BASE || !token || isAnalyzing) return;

        let importedAnalysis = null;
        try {
            importedAnalysis = parseAnalysisInput(analysisInput);
        } catch (err) {
            console.error("Could not parse analysis input:", err);
            setPanelNotice("Could not read that FEN or PGN.");
            return;
        }

        const startingFen = importedAnalysis?.startingFen || sandboxFen;
        const importedHistory = importedAnalysis?.history || [];

        setRightPanelMode('analysis');
        setSandboxStartingFen(startingFen);
        setSandboxHistory(importedHistory);
        setSandboxLastMove({ from: null, to: null });
        setSandboxFen(startingFen);
        setViewIndex(importedHistory.length > 0 ? -2 : -1);
        setOpeningName("");
        setInitialAnalysis(null);
        setPanelNotice('');
        setSandboxResult(importedAnalysis?.result || '');
        setSandboxGameInfo(importedAnalysis ? buildGameInfoFromMetadata(importedAnalysis.metadata, importedAnalysis.result) : null);
        setHasLoadedSetupPosition(Boolean(importedAnalysis?.type === 'fen' && importedHistory.length === 0 && startingFen !== DEFAULT_FEN));
        setShowCustomPositionMenu(false);
        setIsSandboxReviewComplete(false);
        setMasterReviewStarted(false);
        setIsSandboxReviewLocked(false);
        setIsAnalyzing(true);

        try {
            const res = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                fen_before: startingFen,
                move: null,
                prev_eval: 0,
            }, { headers: { Authorization: `Bearer ${token}` } });

            if (res.data?.error) {
                setPanelNotice(res.data.message || "Engine analysis is unavailable for this position.");
                return;
            }

            const rawEval = Number(res.data?.eval);
            setInitialAnalysis({
                eval: Number.isFinite(rawEval) ? rawEval / 100 : 0,
                engineLines: res.data?.engine_lines || [],
            });
            setPanelNotice('');

            if (res.data?.opening) {
                setOpeningName(res.data.opening?.name || res.data.opening || "");
            } else if (importedAnalysis?.metadata?.Event) {
                setOpeningName(importedAnalysis.metadata.Event);
            }
        } catch (err) {
            console.error("Start analysis error:", err);
            setPanelNotice("Engine analysis is unavailable for this position.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleExploreTabClick = () => {
        if (!isAnalysisExplorerRoute) {
            navigate('/analysis/explorer');
        }
        setAnalysisPanelTab('explore');
        if (!initialAnalysis && sandboxHistory.length === 0 && sandboxFen === DEFAULT_FEN) {
            handleStartAnalysis('');
        }
    };

    useEffect(() => {
        if (!isAnalysisExplorerRoute) return;
        if (!initialAnalysis && sandboxHistory.length === 0 && sandboxFen === DEFAULT_FEN && !isAnalyzing) {
            handleStartAnalysis('');
        }
    }, [isAnalysisExplorerRoute, initialAnalysis, sandboxHistory.length, sandboxFen, isAnalyzing]);

    const commitSetupBoardFen = useCallback((nextFen) => {
        if (isResettingAnalysisRef.current) return;
        const normalizedFen = normalizeSetupFen(nextFen, setupTurn);
        setSandboxFen(normalizedFen);
        setSandboxStartingFen(normalizedFen);
        setInitialAnalysis(null);
        setIsSandboxReviewComplete(false);
        setIsSandboxReviewLocked(false);
        setMasterReviewStarted(false);
        if (sandboxHistory.length === 0) {
            setAnalysisSessionId(createAnalysisSessionId());
        }
    }, [setupTurn, sandboxHistory.length]);

    const handleMouseDown = (e, row, col) => {
    if (previewFen) return;

    const square = getSquareName(row, col);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // --- DEBUG LOGOK ---
    console.log("--- CLICK DEBUG ---");
    console.log("Mező:", square);
    console.log("Panel mód (rightPanelMode):", rightPanelMode);
    console.log("Kijelölt Setup bábu (selectedSetupPiece):", selectedSetupPiece);

    // --- SETUP MÓD LOGIKA ---
    // Pozíciószerkesztőben nincs legális lépés, hang vagy sakk-szabály szerinti célmező.
    if (rightPanelMode === 'setup') {
        e.preventDefault();
        setValidMoves([]);

        const chess = createSetupChess(sandboxFen);
        const pieceOnSquare = chess.get(square);

        if (pieceOnSquare) {
            setMousePos({ x: clientX, y: clientY });
            setSelectedSquare(square);
            setHoverSquare(square);
            setIsDragging(true);
            setValidMoves([]);

            const rect = e.currentTarget.getBoundingClientRect();
            setDragOffset({
                x: clientX - (rect.left + rect.width / 2),
                y: clientY - (rect.top + rect.height / 2)
            });
            return;
        }

        if (selectedSetupPiece) {
            const type = selectedSetupPiece.toLowerCase();
            const color = selectedSetupPiece === selectedSetupPiece.toUpperCase() ? 'w' : 'b';

            chess.remove(square);
            if (chess.put({ type, color }, square)) {
                commitSetupBoardFen(chess.fen());
            }
            return;
        }

        return;
    }

    // --- EREDETI DRAG & DROP LOGIKA ---
    // Ez csak akkor fut le, ha NEM setup módban vagyunk.
    console.log("=> NORMÁL MÓD: Lépéskezelés indítása...");

    if (sandboxStatus !== 'ongoing' || isSandboxReviewLocked || isSandboxReviewComplete) {
        return;
    }

    const chess = createSetupChess(sandboxFen);
    const piece = chess.get(square);

    // Ha már van kijelölt mezőnk és egy érvényes célmezőre kattintunk (kattintás-kattintás lépés)
    if (selectedSquare && selectedSquare !== square && validMoves.includes(square)) {
        executeAnalysisMove(selectedSquare, square);
        return;
    }

    // Ha egy bábura kattintunk, elindítjuk a vonszolást (drag)
    if (piece) {
        setMousePos({ x: clientX, y: clientY });
        setSelectedSquare(square);
        setHoverSquare(square);
        setIsDragging(true);

        // Kiszámoljuk az érvényes lépéseket a vizuális visszajelzéshez
        const moves = chess.moves({ square, verbose: true }).map(m => m.to);
        setValidMoves(moves);

        const rect = e.currentTarget.getBoundingClientRect();
        setDragOffset({ 
            x: clientX - (rect.left + rect.width / 2), 
            y: clientY - (rect.top + rect.height / 2) 
        });
    }
};

    // AnalyzeBoard.jsx
const handleExternalDrop = (e, row, col) => {
    e.preventDefault();
    // Megszerezzük a bábu típusát a dataTransfer objektumból
    const piece = e.dataTransfer.getData("chess-piece");
    if (!piece) return;

    const square = getSquareName(row, col);
    const chess = createSetupChess(sandboxFen);
    
    const type = piece.toLowerCase();
    const color = piece === piece.toUpperCase() ? 'w' : 'b';

    // Tábla frissítése: régi törlése, új lerakása
    chess.remove(square);
    if (chess.put({ type, color }, square)) {
        commitSetupBoardFen(chess.fen());
    }
};

    const handleMouseUp = useCallback(async () => {
        if (!isDragging || !selectedSquare) return;
        const from = selectedSquare;
        const target = hoverSquare; 
        
        setIsDragging(false);
        setSelectedSquare(null);
        setValidMoves([]);
        setHoverSquare(null);

        if (rightPanelMode === 'setup') {
            const chess = createSetupChess(sandboxFen);
            const piece = selectedSetupPiece && target === from
                ? {
                    type: selectedSetupPiece.toLowerCase(),
                    color: selectedSetupPiece === selectedSetupPiece.toUpperCase() ? 'w' : 'b',
                }
                : chess.get(from);

            if (!target || !piece) return;

            chess.remove(from);
            chess.remove(target);
            if (chess.put(piece, target)) {
                commitSetupBoardFen(chess.fen());
            }
            return;
        }

        if (!target || target === from) return;

        const chess = new Chess(sandboxFen);
        const isValid = chess.moves({ square: from, verbose: true }).some(m => m.to === target);

        if (isValid) {
            await executeAnalysisMove(from, target);
        } else {
            playSound('illegal');
        }
    }, [isDragging, selectedSquare, hoverSquare, rightPanelMode, sandboxFen, playSound, executeAnalysisMove, commitSetupBoardFen]);

    useEffect(() => {
        const handleMove = (e) => {
            if (!isDragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            setMousePos({ x: clientX, y: clientY });

            const board = document.getElementById('chess-board')?.getBoundingClientRect();
            if (board) {
                let col = Math.floor((clientX - board.left) / (board.width / 8));
                let row = Math.floor((clientY - board.top) / (board.height / 8));
                if (isFlipped) { col = 7 - col; row = 7 - row; }
                if (col >= 0 && col < 8 && row >= 0 && row < 8) setHoverSquare(getSquareName(row, col));
                else setHoverSquare(null);
            }
        };
        const handleGlobalUp = () => { if (isDragging) handleMouseUp(); };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('mouseup', handleGlobalUp);
        window.addEventListener('touchend', handleGlobalUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('mouseup', handleGlobalUp);
            window.removeEventListener('touchend', handleGlobalUp);
        };
    }, [isDragging, isFlipped, getSquareName, handleMouseUp, setMousePos, setHoverSquare]);



    // Mindig az aktuális (vagy preview) FEN alapján számolunk
    const currentFen = previewFen || (viewIndex === -1 ? sandboxFen : (sandboxHistory[viewIndex]?.fen || sandboxFen));
    const captured = getCapturedPieces(currentFen);
    const materialDiff = getMaterialDiff(captured);

    const activeHistoryIndex = viewIndex === -1 ? sandboxHistory.length - 1 : Number.parseInt(viewIndex, 10);
    const previousKnownEval = findPreviousBarEval(sandboxHistory, activeHistoryIndex, positionEvalByFen);
    const currentPositionEval = positionEvalByFen[currentFen];
    const evalFallback = normalizeEvalForBar(previousKnownEval, initialAnalysis?.eval ?? 0);
    const currentEvalValue = viewIndex === -1
        ? (sandboxHistory.length > 0
            ? getMoveEvalForBar(sandboxHistory[sandboxHistory.length - 1], normalizeEvalForBar(currentPositionEval, evalFallback))
            : normalizeEvalForBar(currentPositionEval ?? getFirstEngineLineEval(initialAnalysis) ?? initialAnalysis?.eval, 0))
        : getMoveEvalForBar(
            sandboxHistory[activeHistoryIndex],
            normalizeEvalForBar(currentPositionEval, evalFallback)
        );
    const whiteBarHeight = Math.min(Math.max(50 + (currentEvalValue * 10), 5), 95);
    const hasActiveSandboxState =
        sandboxHistory.length > 0 ||
        sandboxFen !== DEFAULT_FEN ||
        sandboxStartingFen !== DEFAULT_FEN ||
        Boolean(initialAnalysis) ||
        Boolean(openingName) ||
        Boolean(panelNotice);
    const resultLabel = getResultLabel(sandboxStatus, sandboxFen);
    const displayedResultLabel = sandboxResult || resultLabel;
    const currentSaveSignature = getGameSaveSignature(sandboxHistory, sandboxStartingFen);
    const hasSaveableAnalysis = sandboxHistory.length > 0 || hasLoadedSetupPosition;
    const canSaveCurrentAnalysis = hasSaveableAnalysis && (
        currentSaveSignature !== lastSavedGameSignature ||
        (isPgnReviewRoute && sandboxHistory.length > 0 && !collectionSavedGame)
    );
    const canReviewCurrentAnalysis = sandboxHistory.length > 0;
    const savedFen = getLatestHistoryFen(sandboxHistory, sandboxFen);
    const boardGameInfo = sandboxGameInfo || masterReviewGame;
    const pgnReviewGame = isPgnReviewRoute ? {
        id: pgnGameId || analysisSessionId,
        white: sandboxGameInfo?.white || 'White',
        black: sandboxGameInfo?.black || 'Black',
        white_elo: sandboxGameInfo?.white_elo || '',
        black_elo: sandboxGameInfo?.black_elo || '',
        result: sandboxResult || sandboxGameInfo?.result || displayedResultLabel || '',
        date: sandboxGameInfo?.date || '',
        event: sandboxGameInfo?.event || 'Analysis',
        site: sandboxGameInfo?.site || '',
        opening: openingName || sandboxGameInfo?.opening || '',
        eco: sandboxGameInfo?.eco || '',
        moves: sandboxHistory.map((move) => move.san || move.m).join(' '),
        white_accuracy: sandboxGameInfo?.white_accuracy,
        black_accuracy: sandboxGameInfo?.black_accuracy,
    } : null;

    const savedAnalysisGame = masterReviewGame ? {
        id: `master-${masterReviewGame.id}`,
        white: masterReviewGame.white,
        black: masterReviewGame.black,
        white_elo: masterReviewGame.white_elo,
        black_elo: masterReviewGame.black_elo,
        result: masterReviewGame.result,
        date: masterReviewGame.date,
        event: masterReviewGame.event,
        site: masterReviewGame.site,
        round: masterReviewGame.round,
        opening: masterReviewGame.detected_opening?.name || masterReviewGame.opening || openingName || '',
        eco: masterReviewGame.detected_opening?.eco || masterReviewGame.eco || '',
        moves: masterReviewGame.moves,
        addedAt: new Date().toISOString(),
    } : {
        id: analysisSessionId,
        source: 'analysis',
        white: collectionSavedGame?.white || sandboxGameInfo?.white || 'White',
        black: collectionSavedGame?.black || sandboxGameInfo?.black || 'Black',
        result: (isCollectionAnalysisRoute && collectionSavedGame?.result) ? collectionSavedGame.result : (displayedResultLabel || '*'),
        date: collectionSavedGame?.date || formatToday(),
        event: collectionSavedGame?.event || (isSandboxReviewComplete ? 'Game Review, Analysis' : 'Analysis'),
        site: collectionSavedGame?.site || 'Checkmate Analysis',
        opening: openingName || collectionSavedGame?.opening || '',
        eco: collectionSavedGame?.eco || '',
        moves: buildSandboxMoves(sandboxHistory),
        analysisHistory: sandboxHistory,
        fen: savedFen,
        startingFen: sandboxStartingFen,
        initialAnalysis,
        gameInfo: sandboxGameInfo,
        white_accuracy: collectionSavedGame?.white_accuracy ?? sandboxGameInfo?.white_accuracy,
        black_accuracy: collectionSavedGame?.black_accuracy ?? sandboxGameInfo?.black_accuracy,
        addedAt: new Date().toISOString(),
    };
    const collectionReviewGame = isCollectionReviewRoute && collectionSavedGame ? {
        ...savedAnalysisGame,
        ...collectionSavedGame,
        id: collectionSavedGame.id || savedAnalysisGame.id,
        white: collectionSavedGame.white || savedAnalysisGame.white,
        black: collectionSavedGame.black || savedAnalysisGame.black,
        result: collectionSavedGame.result || savedAnalysisGame.result,
        opening: openingName || collectionSavedGame.opening || savedAnalysisGame.opening,
    } : null;

    const resetSandboxAnalysis = () => {
        isResettingAnalysisRef.current = true;
        setSandboxFen(DEFAULT_FEN);
        setSandboxHistory([]);
        setSandboxStartingFen(DEFAULT_FEN);
        setSandboxLastMove({ from: null, to: null });
        setViewIndex(-1);
        setOpeningName("");
        setInitialAnalysis(null);
        setPanelNotice('');
        setSandboxResult('');
        setSandboxGameInfo(null);
        setIsSandboxReviewComplete(false);
        setRevealedBotAnalysisIndex(-1);
        setMasterReviewStarted(false);
        setIsSandboxReviewLocked(false);
        setPreviewFen(null);
        setPendingPromotion(null);
        setRightPanelMode('analysis');
        setSelectedSetupPiece(null);
        setSelectedSquare(null);
        setValidMoves([]);
        setHoverSquare(null);
        setIsDragging(false);
        setIsNewModalOpen(false);
        setAnalysisSessionId(createAnalysisSessionId());
        setCollectionContext(null);
        setCollectionSavedGame(null);
        setLastSavedGameSignature(null);
        setHasLoadedSetupPosition(false);
        setShowCustomPositionMenu(false);
        deleteCurrentAnalysisDraft();
        window.setTimeout(() => {
            isResettingAnalysisRef.current = false;
            setSandboxFen(DEFAULT_FEN);
            setSandboxStartingFen(DEFAULT_FEN);
            setSandboxLastMove({ from: null, to: null });
            setPreviewFen(null);
        }, 0);
    };

    const startFreshAnalysis = () => {
        resetSandboxAnalysis();
        navigate('/analysis', { replace: true });
    };

    const applySetupBoardFen = (nextFen, nextTurn = 'w') => {
        const normalizedFen = normalizeSetupFen(nextFen, nextTurn);
        analyzeSetupDebug('applySetupBoardFen', { nextFen, nextTurn, normalizedFen });
        setSetupTurn(nextTurn);
        setSandboxFen(normalizedFen);
        setSandboxStartingFen(normalizedFen);
        setSandboxHistory([]);
        setSandboxLastMove({ from: null, to: null });
        setViewIndex(-1);
        setOpeningName("");
        setInitialAnalysis(null);
        setPanelNotice('');
        setSandboxResult('');
        setSandboxGameInfo(null);
        setPreviewFen(null);
        setPendingPromotion(null);
        setSelectedSetupPiece(null);
        setIsDragging(false);
        setIsSandboxReviewComplete(false);
        setMasterReviewStarted(false);
        setIsSandboxReviewLocked(false);
        setAnalysisSessionId(createAnalysisSessionId());
        setHasLoadedSetupPosition(false);
        setShowCustomPositionMenu(false);
    };

    const returnToAnalysisMenuFromSetup = () => {
        const normalizedFen = normalizeSetupFen(sandboxFen, setupTurn);
        analyzeSetupDebug('returnToAnalysisMenuFromSetup', { sandboxFen, setupTurn, normalizedFen });
        setSetupTurn(setupTurn);
        setSandboxFen(normalizedFen);
        setSandboxStartingFen(normalizedFen);
        setSandboxHistory([]);
        setSandboxLastMove({ from: null, to: null });
        setViewIndex(-1);
        setOpeningName("");
        setInitialAnalysis(null);
        setPanelNotice('');
        setSandboxResult('');
        setSandboxGameInfo(null);
        setPreviewFen(null);
        setPendingPromotion(null);
        setSelectedSetupPiece(null);
        setIsDragging(false);
        setIsSandboxReviewComplete(false);
        setMasterReviewStarted(false);
        setIsSandboxReviewLocked(false);
        setAnalysisSessionId(createAnalysisSessionId());
        setHasLoadedSetupPosition(normalizedFen !== DEFAULT_FEN);
        setShowCustomPositionMenu(normalizedFen !== DEFAULT_FEN);
        setRightPanelMode('analysis');
    };

    const handleViewMove = (idx, options = {}) => {
        if (idx <= -2) {
            const soundName = getHistoryNavigationSoundName(sandboxHistory, viewIndex, -2);
            if (soundName) playSound(soundName);
            if (isCollectionAnalysisRoute) {
                setSearchParams({}, { replace: true });
            } else if (isPgnReviewRoute) {
                setSearchParams({}, { replace: true });
                setMasterReviewStarted(Boolean(options.keepReviewPanel));
                if (!options.keepReviewPanel) {
                    navigate(`/analysis/game/pgn/${pgnGameId}/review`, { replace: true });
                }
            }
            setSandboxFen(sandboxStartingFen || DEFAULT_FEN);
            setSandboxLastMove({ from: null, to: null });
            setViewIndex(-2);
            clearBoardInteraction();
            return;
        }

        const boundedIndex = idx === -1 ? sandboxHistory.length - 1 : idx;
        const soundName = getHistoryNavigationSoundName(sandboxHistory, viewIndex, boundedIndex);
        if (soundName) playSound(soundName);

        if ((isCollectionAnalysisRoute || isPgnReviewRoute) && boundedIndex >= 0 && boundedIndex < sandboxHistory.length) {
            setSearchParams({ move: String(boundedIndex) }, { replace: true });
        }

        const move = sandboxHistory[boundedIndex];
        if (move) {
            setSandboxFen(move.fen);
            setSandboxLastMove({ from: move.from, to: move.to });
            setViewIndex(boundedIndex);
            if (isBotSelfAnalysisRoute) {
                setRevealedBotAnalysisIndex((current) => Math.max(current, boundedIndex));
            }
            return;
        }

        if (idx === -1) {
            const latest = sandboxHistory[sandboxHistory.length - 1];
            setSandboxFen(latest ? latest.fen : DEFAULT_FEN);
            setSandboxLastMove(latest ? { from: latest.from, to: latest.to } : { from: null, to: null });
            setViewIndex(latest ? sandboxHistory.length - 1 : -2);
            if (isBotSelfAnalysisRoute && latest) {
                setRevealedBotAnalysisIndex(sandboxHistory.length - 1);
            }
        }
    };

    useEffect(() => {
        if (!sandboxHistory.length) return;

        const handleKeyDown = (event) => {
            const target = event.target;
            const tagName = target?.tagName?.toLowerCase();
            const isTyping = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;
            if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;

            const latestIndex = sandboxHistory.length - 1;
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                const nextIndex = viewIndex < -1 ? 0 : (viewIndex >= latestIndex ? -1 : viewIndex + 1);
                handleViewMove(nextIndex);
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                const previousIndex = viewIndex <= 0 ? -2 : (viewIndex === -1 ? latestIndex - 1 : viewIndex - 1);
                handleViewMove(previousIndex);
            } else if (event.key === 'Home') {
                event.preventDefault();
                handleViewMove(-2);
            } else if (event.key === 'End') {
                event.preventDefault();
                handleViewMove(-1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [sandboxHistory, viewIndex]);

    const handleLoadGameHistoryGame = (game, loadedHistory = [], details = {}) => {
        const normalizedHistory = normalizeBotHistory(loadedHistory);
        const firstMove = normalizedHistory[0];
        setSandboxStartingFen(DEFAULT_FEN);
        setSandboxHistory(normalizedHistory);
        setSandboxFen(DEFAULT_FEN);
        setSandboxLastMove({ from: null, to: null });
        setViewIndex(normalizedHistory.length ? -2 : -1);
        setInitialAnalysis(null);
        setPanelNotice('');
        setSandboxResult(details.result || game?.result || '');
        setSandboxStatus(details.status || game?.status || 'finished');
        setSandboxStatusReason(details.reason || '');
        setOpeningName(details.opening?.name || details.opening || '');
        setRightPanelMode('analysis');
        setAnalysisPanelTab('analysis');
        setHasLoadedSetupPosition(false);
        setShowCustomPositionMenu(false);
        setSandboxGameInfo({
            white: game?.iWasWhite ? (localStorage.getItem('chessUsername') || 'White') : (game?.opponent || 'Black'),
            black: game?.iWasWhite ? (game?.opponent || 'Black') : (localStorage.getItem('chessUsername') || 'White'),
            result: details.result || game?.result || '',
            white_rating: game?.iWasWhite ? game?.myElo : game?.elo,
            black_rating: game?.iWasWhite ? game?.elo : game?.myElo,
        });
        if (!firstMove) {
            setSandboxFen(DEFAULT_FEN);
        }
    };

    const handleSaveToCollection = async () => {
        if (!canSaveCurrentAnalysis) return;

        if (collectionSavedGame) {
            const updatedCollection = await updateSavedAnalysisGame(savedAnalysisGame);
            setCollectionSavedGame(savedAnalysisGame);
            setLastSavedGameSignature(currentSaveSignature);
            if (updatedCollection && isCollectionAnalysisRoute) {
                navigate(`/analysis/collection/${collectionSlug}/${encodeURIComponent(savedAnalysisGame.id)}/analysis`, { replace: true });
            }
            return;
        }

        setIsSaveModalOpen(true);
    };

    const handleUpdateCollectionSettings = async (collectionId, updates) => {
        if (!collectionId) return;
        try {
            await updateDbCollection(collectionId, updates);
            setCollectionContext((current) => (
                current?.id === collectionId
                    ? { ...current, ...updates }
                    : current
            ));
        } catch (err) {
            console.error('Could not update collection settings:', err);
        }
    };

    const handleDeleteCollection = async (collectionId) => {
        if (!collectionId) return;
        try {
            await deleteDbCollection(collectionId);
        } catch (err) {
            console.error('Could not delete collection:', err);
        }
        navigate('/analysis/collections');
    };

    return (
        <div className="analysis-shell flex min-h-dvh w-full flex-col items-center bg-[#302f2c] text-[#bab9b8] px-3 py-3 gap-4 overflow-y-auto overflow-x-hidden select-none font-sans md:h-dvh md:flex-row md:justify-center md:px-4 md:py-4 md:gap-4 md:overflow-hidden xl:gap-6 xl:px-6"
            onDragOver={(e) => {
                // Ez engedélyezi, hogy az egész képernyőn kövessük az egeret
                e.preventDefault();
                setMousePos({ x: e.clientX, y: e.clientY });
            }}
        >
            
            <AnalyzeEvalBar whiteBarHeight={whiteBarHeight} currentEvalValue={currentEvalValue} />

            <AnalyzeBoardSection
                chessContext={chessContext}
                previewFen={previewFen}
                viewIndex={viewIndex}
                sandboxFen={sandboxFen}
                sandboxHistory={sandboxHistory}
                sandboxLastMove={sandboxLastMove}
                isFlipped={isFlipped}
                sandboxStatus={sandboxStatus}
                pendingPromotion={pendingPromotion}
                isDragging={isDragging}
                captured={captured}
                materialDiff={materialDiff}
                handleMouseDown={handleMouseDown}
                handleMouseUp={handleMouseUp}
                handleExternalDrop={handleExternalDrop}
                executeAnalysisMove={executeAnalysisMove}
                setMousePos={setMousePos}
                setIsDragging={setIsDragging}
                gameInfo={boardGameInfo}
            />
        
            <div className="app-panel-size shrink-0 relative box-border">
            {rightPanelMode === 'setup' ? (
            <SetUpPositionView 
                onBack={returnToAnalysisMenuFromSetup}
                onNewClick={() => {
                    resetSandboxAnalysis();
                    navigate('/analysis', { replace: true });
                }}
                currentFen={sandboxFen}
                setupTurn={setupTurn}
                onTurnChange={setSetupTurn}
                selectedPiece={selectedSetupPiece}
                setIsDragging={setIsDragging}
                isDragging={isDragging}
                onPieceSelect={setSelectedSetupPiece}
                onFlipBoard={() => {
                    analyzeSetupDebug('onFlipBoard:before');
                    setIsFlipped((flipped) => {
                        analyzeSetupDebug('onFlipBoard:setter', { before: flipped, after: !flipped });
                        return !flipped;
                    });
                }}
                onResetBoard={() => {
                    analyzeSetupDebug('onResetBoard');
                    applySetupBoardFen(DEFAULT_FEN, 'w');
                }}
                onClearBoard={() => {
                    analyzeSetupDebug('onClearBoard');
                    applySetupBoardFen(CLEAR_BOARD_FEN, 'w');
                }}
                onFenChange={(newFen) => {
                    try {
                        const parsed = new Chess(newFen, { skipValidation: true });
                        const nextTurn = parsed.turn();
                        setSetupTurn(nextTurn);
                        setSandboxFen(normalizeSetupFen(newFen, nextTurn));
                        // Itt MÉG NEM töröljük a history-t, hogy gépelés közben ne villogjon
                    } catch {
                        // Keep invalid FEN ignored while typing, matching the previous behavior.
                    }
                }}
    
                onLoadConfirm={async (finalFen) => {
                const normalizedFinalFen = normalizeSetupFen(finalFen, setupTurn);
                const turn = normalizedFinalFen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
                setIsDragging(false);
                setSelectedSetupPiece(null);

                setSandboxStartingFen(normalizedFinalFen);
                setSandboxFen(normalizedFinalFen);
                setSandboxLastMove({ from: null, to: null });
                setViewIndex(-1);
                setOpeningName("");
                setInitialAnalysis(null);
                setPanelNotice('');
                setSandboxResult('');
                setSandboxGameInfo(null);
                setIsSandboxReviewComplete(false);
                setMasterReviewStarted(false);
                setIsSandboxReviewLocked(false);
                setSandboxHistory([]); 
                setAnalysisSessionId(createAnalysisSessionId());
                setHasLoadedSetupPosition(true);
                setShowCustomPositionMenu(false);
                setRightPanelMode('analysis');
                setIsAnalyzing(true);
                try {
                    // 2. Elemzés kérése
                    const res = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                        fen_before: normalizedFinalFen, 
                        move: null,
                        prev_eval: 0
                    }, { headers: { Authorization: `Bearer ${token}` } });

                    if (res.data) {
                        if (res.data.error) {
                            setPanelNotice(res.data.message || "Engine analysis is unavailable for this position.");
                            return;
                        }

                        // 3. Eredmények elmentése
                        setInitialAnalysis({
                            eval: res.data.eval / 100,
                            engineLines: res.data.engine_lines || []
                        });
                        setPanelNotice('');

                        if (res.data.opening) {
                            setOpeningName(res.data.opening?.name || res.data.opening || "");
                        }
                    }
                    
                    console.log(`Betöltve és elemezve: ${turn === 'w' ? 'Világos' : 'Sötét'} következik.`);

                } catch (err) {
                    console.error("Hiba a betöltés utáni elemzésnél:", err);
                } finally {
                    setIsAnalyzing(false);
                }
            }}
                canSave={false}
                canReview={false}

            />
            ) : isMasterReviewRoute && masterReviewGame && !masterReviewStarted ? (
            <MasterReviewIntro
                game={masterReviewGame}
                history={sandboxHistory}
                isReviewing={isAnalyzing}
                reviewStarted={masterReviewStarted}
                onStartReview={handleStartReviewFromIntro}
                allowStartDuringReview
            />
            ) : isPgnReviewRoute && pgnReviewGame && !masterReviewStarted ? (
            <MasterReviewIntro
                game={pgnReviewGame}
                history={sandboxHistory}
                isReviewing={isAnalyzing}
                reviewStarted={masterReviewStarted}
                onStartReview={handleStartReviewFromIntro}
                showPhaseSummary={false}
                allowStartDuringReview
            />
            ) : isCollectionReviewRoute && collectionReviewGame && !masterReviewStarted ? (
            <MasterReviewIntro
                game={collectionReviewGame}
                history={sandboxHistory}
                isReviewing={isAnalyzing}
                reviewStarted={masterReviewStarted}
                onStartReview={handleStartReviewFromIntro}
                showPhaseSummary={false}
                allowStartDuringReview
            />
            ) : isBotReviewRoute && masterReviewGame && !masterReviewStarted ? (
            <MasterReviewIntro
                game={masterReviewGame}
                history={sandboxHistory}
                isReviewing={isAnalyzing}
                reviewStarted={masterReviewStarted}
                onStartReview={handleStartReviewFromIntro}
                allowStartDuringReview
            />
            ) : (
            <AnalysisPanel 
                history={sandboxHistory}
                currentEval={currentEvalValue}
                openingName={openingName}
                viewIndex={viewIndex}
                onViewMove={handleViewMove}
                currentFen={sandboxFen}
                initialAnalysis={initialAnalysis}
                gameInfo={sandboxGameInfo}
                statusText={panelNotice || sandboxStatusReason}
                resultLabel={displayedResultLabel}
                activeTab={(isAnalysisGamesRoute || isCollectionGamesRoute) ? 'games' : analysisPanelTab}
                onAnalysisTabClick={
                    isCollectionGamesRoute
                        ? () => navigate(`/analysis/collection/${collectionSlug}/${encodeURIComponent(collectionGameId)}/analysis`)
                        : ((isAnalysisGamesRoute || isAnalysisExplorerRoute) ? () => navigate('/analysis') : () => setAnalysisPanelTab('analysis'))
                }
                canSave={canSaveCurrentAnalysis}
                canReview={canReviewCurrentAnalysis}
                onSaveClick={handleSaveToCollection}
                onNewClick={() => hasActiveSandboxState && setIsNewModalOpen(true)}
                onReviewClick={isPgnReviewRoute ? handleFullReview : handleReviewClick}
                onStartAnalysis={handleStartAnalysis}
                onGamesTabClick={isCollectionAnalysisRoute ? () => navigate(`/analysis/collection/${collectionSlug}/${encodeURIComponent(collectionGameId)}/games`) : () => navigate('/analysis/games')}
                onExploreTabClick={handleExploreTabClick}
                apiBase={API_BASE}
                token={token}
                onLoadGameHistoryGame={handleLoadGameHistoryGame}
                collectionContext={isCollectionAnalysisRoute && !isCollectionReviewRoute ? collectionContext : null}
                onCollectionBackClick={() => navigate('/analysis/collections')}
                collectionSettingsMode={isCollectionSettingsRoute}
                onCollectionSettingsClick={() => navigate(`/analysis/collection/${collectionSlug}/${encodeURIComponent(collectionGameId)}/collection-settings`)}
                onCollectionSettingsBackClick={() => navigate(`/analysis/collection/${collectionSlug}/${encodeURIComponent(collectionGameId)}/games`)}
                onUpdateCollection={handleUpdateCollectionSettings}
                onDeleteCollection={handleDeleteCollection}
                onReviewBackClick={
                    masterReviewStarted
                        ? (isPgnReviewRoute ? handlePgnReviewBack : (isCollectionReviewRoute ? () => navigate(`/analysis/collection/${collectionSlug}/${encodeURIComponent(collectionGameId)}/analysis`) : ((isMasterReviewRoute || isBotReviewRoute) ? handleStoredReviewBack : undefined)))
                        : undefined
                }
                reviewMode={masterReviewStarted && (isPgnReviewRoute || isMasterReviewRoute || isBotReviewRoute || isCollectionReviewRoute)}
                hideMoveJudgement={masterReviewStarted && (isPgnReviewRoute || isMasterReviewRoute || isBotReviewRoute || isCollectionReviewRoute)}
                hasStartingPosition={isCollectionAnalysisRoute || isSavedAnalysisRoute || isPgnReviewRoute || isBotSelfAnalysisRoute || isBotReviewRoute || viewIndex <= -2 || Boolean(initialAnalysis)}
                showEmptyMenuForCustomPosition={showCustomPositionMenu && sandboxHistory.length === 0 && !initialAnalysis}
                showOnlyActiveMoveLabels={isBotSelfAnalysisRoute}
                revealedMoveLabelIndex={isBotSelfAnalysisRoute ? revealedBotAnalysisIndex : null}
                onSetupClick={() => {
                    analyzeSetupDebug('onSetupClick', { sandboxFen });
                    try {
                        setSetupTurn(new Chess(sandboxFen, { skipValidation: true }).turn());
                    } catch {
                        setSetupTurn('w');
                    }
                    setRightPanelMode('setup');
                }} // Ez már jó volt
                onHoverVariation={handleHoverVariation}
            />
        )}
            </div>

            <AnimatePresence>
                <SetupPieceDragPreview
                    isDragging={isDragging}
                    selectedSetupPiece={selectedSetupPiece}
                    mousePos={mousePos}
                />
        </AnimatePresence>
            <AnimatePresence>
                <SaveCollectionModal
                    isOpen={isSaveModalOpen}
                    onClose={() => setIsSaveModalOpen(false)}
                    game={savedAnalysisGame}
                    onSaved={() => {
                        setCollectionSavedGame(savedAnalysisGame);
                        setLastSavedGameSignature(currentSaveSignature);
                        setIsSaveModalOpen(false);
                    }}
                />
            </AnimatePresence>
            <AnimatePresence>
                <NewAnalysisModal
                    isOpen={isNewModalOpen}
                    onClose={() => setIsNewModalOpen(false)}
                    onConfirm={startFreshAnalysis}
                />
            </AnimatePresence>
        </div>
    );

    
};

export default AnalyzeBoard;
