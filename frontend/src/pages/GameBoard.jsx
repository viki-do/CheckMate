import React, { useEffect, useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
// JAVÍTÁS: useChessGame helyett useChess Context importálása
import { useChess } from '../context/ChessContext';
import axios from 'axios';
import { Chess } from 'chess.js';
import { getCapturedPieces, getMaterialDiff } from '../components/materialUtils.js';
import CapturedProgressBar from '../components/game-board/CapturedProgressBar.jsx';
import ChessBoardArea from '../components/game-board/ChessBoardArea.jsx';
import PlayerInfoBar from '../components/game-board/PlayerInfoBar.jsx';
import { findBotByGameData } from '../components/game-board/gameBoardUtils.js';
import { getHistoryNavigationSoundName } from '../hooks/chess-game/soundUtils';
import SaveCollectionModal from '../components/analyze-board/SaveCollectionModal.jsx';
import AnalyzeEvalBar from '../components/analyze-board/AnalyzeEvalBar.jsx';

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const formatToday = () => new Date().toISOString().slice(0, 10).replace(/-/g, '.');

const getPlayableHistory = (history = []) => history.filter((move) => move?.m && move.m !== 'start');

const buildMoveText = (history = []) => (
    getPlayableHistory(history)
        .map((move, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}${move.m}`)
        .join(' ')
);

const getLatestHistoryFen = (history = [], fallbackFen = DEFAULT_FEN) => (
    getPlayableHistory(history).at(-1)?.fen || fallbackFen
);

const normalizeEvalForBar = (value, fallback = 0) => {
    if (typeof value === 'string' && value.startsWith('M')) {
        const mateValue = Number(value.slice(1));
        if (Number.isFinite(mateValue)) return mateValue >= 0 ? 9 : -9;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const GameBoard = () => {
    
    // --- 1. MINDEN STATE DEKLARÁCIÓ AZ ELEJÉRE ---

    const [isStarting, setIsStarting] = useState(false);
    const [isGameActiveUI, setIsGameActiveUI] = useState(false);
    const [, setIsSelectingBot] = useState(false);
    const [delayedShowPopup, setDelayedShowPopup] = useState(false);
    const [isPopupClosed, setIsPopupClosed] = useState(false);
    const [selectedTime, setSelectedTime] = useState("No Timer");
    const [opponent, setOpponent] = useState(null);
    const [previewOpponent, setPreviewOpponent] = useState(null);
    const [analysisData, setAnalysisData] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSaveCollectionOpen, setIsSaveCollectionOpen] = useState(false);
    const [userName, setUserName] = useState("You");
    const [userAvatarUrl, setUserAvatarUrl] = useState("");
    const [positionEvalByFen, setPositionEvalByFen] = useState({});


    // --- 2. HOOK ÉS NAVIGÁCIÓ ---

    // JAVÍTÁS: useChessGame() helyett useChess() - így a központi állapotot kapod meg
    const gameLogic = useChess(); 
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { archiveGameId } = useParams();

    const {
        status, history, viewIndex, startNewGame,
        token, gameId, setFen, setLastMove, setViewIndex, isFlipped, setIsFlipped,
        getSquareName, fen, setSelectedSquare, setHoverSquare, initializeGame,
        API_BASE, isDragging, setMousePos, playSound, reason, result, pendingPromotion,
        whiteTime, blackTime, activeTimeColor, setBlackTime, setWhiteTime,
        lastTimeControl, opening, executeMove, setHistory, handleMouseDown, handleMouseUp,
    } = gameLogic;
    const userAvatarSrc = userAvatarUrl ? `${API_BASE}${userAvatarUrl}` : "";

    // --- ÚJ FÜGGVÉNYEK ---

    const isGameActive = !!gameId && gameId !== "null";
    const isBotGameRoute = location.pathname.startsWith('/game/bots/');
    const shouldShowDefaultBoard = !archiveGameId && (
        location.pathname === '/play' ||
        (location.pathname === '/play/bots' && (!isGameActive || !isGameActiveUI))
    );
    const defaultBoardIsFlipped = location.pathname === '/play/bots' ? isFlipped : false;
    const displayFen = shouldShowDefaultBoard ? DEFAULT_FEN : fen;
    const displayedHistoryIndex = viewIndex === -1 ? history.length - 1 : Number.parseInt(viewIndex, 10);
    const displayedHistoryMove = Number.isInteger(displayedHistoryIndex) ? history[displayedHistoryIndex] : null;
    const currentEvalValue = normalizeEvalForBar(
        displayedHistoryMove?.eval ?? positionEvalByFen[displayFen],
        0
    );
    const whiteBarHeight = Math.min(Math.max(50 + (currentEvalValue * 10), 5), 95);
    const shouldShowEvalBar = (location.pathname === '/play/bots' && !shouldShowDefaultBoard) || isBotGameRoute || Boolean(archiveGameId);
    const displayIsFlipped = shouldShowDefaultBoard ? defaultBoardIsFlipped : isFlipped;
    const captured = getCapturedPieces(displayFen);
    const materialDiff = getMaterialDiff(captured);
    const topSide = displayIsFlipped ? 'white' : 'black';
    const bottomSide = displayIsFlipped ? 'black' : 'white';
    const getSideMaterial = (side) => ({
        pieces: side === 'white' ? captured.whiteSide : captured.blackSide,
        diff: side === 'white'
            ? (materialDiff > 0 ? materialDiff : 0)
            : (materialDiff < 0 ? Math.abs(materialDiff) : 0)
    });
    const topMaterial = getSideMaterial(topSide);
    const bottomMaterial = getSideMaterial(bottomSide);

    // const getInitialTimeDisplay = (timeStr) => {
    //     const config = gameLogic.parseTimeControl(timeStr);
    //     return config.base || 600; // Alapértelmezett 10 perc, ha nincs válaszva
    // };

    useEffect(() => {
    // Bejelentkezéskor elmentett név lekérése
    const storedName = localStorage.getItem('chessUsername'); 
    if (storedName) {
        setUserName(storedName);
    }
    }, []);

    useEffect(() => {
        if (!token) return;

        let isMounted = true;
        axios.get(`${API_BASE}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            if (isMounted) setUserAvatarUrl(res.data.avatar_url || "");
        }).catch(() => {});

        const handleAvatarUpdated = (event) => {
            setUserAvatarUrl(event.detail?.avatarUrl || "");
        };
        window.addEventListener("profile-avatar-updated", handleAvatarUpdated);

        return () => {
            isMounted = false;
            window.removeEventListener("profile-avatar-updated", handleAvatarUpdated);
        };
    }, [API_BASE, token]);

    useEffect(() => {
    if (!archiveGameId) {
        initializeGame();
    }
    }, [initializeGame, archiveGameId]);

    useEffect(() => {
        if (!shouldShowEvalBar || !API_BASE || !token || !displayFen || displayFen === DEFAULT_FEN) return;
        if (displayedHistoryMove?.eval !== undefined && displayedHistoryMove?.eval !== null) return;
        if (positionEvalByFen[displayFen] !== undefined) return;

        let isMounted = true;
        const loadPositionEval = async () => {
            try {
                const previousEval = history
                    .slice()
                    .reverse()
                    .find((move) => move?.eval !== undefined && move?.eval !== null)?.eval;
                const res = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                    fen_before: displayFen,
                    move: null,
                    prev_eval: normalizeEvalForBar(previousEval, 0) * 100,
                }, { headers: { Authorization: `Bearer ${token}` } });
                if (!isMounted) return;

                const rawEval = Number(res.data?.eval);
                const nextEval = Number.isFinite(rawEval)
                    ? rawEval / 100
                    : normalizeEvalForBar(res.data?.eval, 0);
                setPositionEvalByFen((current) => ({ ...current, [displayFen]: nextEval }));

                if (displayedHistoryMove?.fen === displayFen) {
                    setHistory((current) => current.map((move, index) => (
                        index === displayedHistoryIndex
                            ? { ...move, eval: nextEval, rawEval: Number.isFinite(rawEval) ? rawEval : move.rawEval }
                            : move
                    )));
                }
            } catch (err) {
                console.error("Position eval failed:", err);
            }
        };

        loadPositionEval();
        return () => { isMounted = false; };
    }, [shouldShowEvalBar, API_BASE, token, displayFen, displayedHistoryIndex, displayedHistoryMove?.eval, displayedHistoryMove?.fen, history, positionEvalByFen, setHistory]);

    useEffect(() => {
        if (!archiveGameId || gameLogic.isLoading) return;

        let isMounted = true;
        const loadArchivedGame = async () => {
            setAnalysisData(null);
            setIsAnalyzing(false);
            setIsGameActiveUI(true);
            setDelayedShowPopup(false);
            setIsPopupClosed(true);
            gameLogic.setGameId(archiveGameId);
            localStorage.removeItem('chessGameId');

            const data = await gameLogic.fetchGameState(archiveGameId);
            if (!isMounted || !data) return;

            setIsFlipped(data.player_color === 'black');
            setOpponent(findBotByGameData(data));
            setPreviewOpponent(null);
            if (data.white_accuracy != null || data.black_accuracy != null) {
                const playerAccuracy = data.player_color === 'black' ? data.black_accuracy : data.white_accuracy;
                setAnalysisData({
                    overall_accuracy: playerAccuracy ?? data.white_accuracy ?? data.black_accuracy,
                    white_accuracy: data.white_accuracy,
                    black_accuracy: data.black_accuracy,
                });
            }
        };

        loadArchivedGame();
        return () => { isMounted = false; };
    }, [archiveGameId, gameLogic.isLoading, gameLogic.fetchGameState, gameLogic.setGameId, setIsFlipped]);

    useEffect(() => {
        if (!isBotGameRoute || !archiveGameId || history.length === 0) return;
        const moveParam = searchParams.get('move');
        const requestedMove = moveParam === null ? 0 : Number.parseInt(moveParam, 10);
        if (!Number.isInteger(requestedMove) || requestedMove < 0) return;

        const targetIndex = Math.min(requestedMove, history.length - 1);
        const targetMove = history[targetIndex];

        setViewIndex(targetIndex);
        if (targetIndex === 0 || targetMove?.m === 'start') {
            setFen(DEFAULT_FEN);
            setLastMove({ from: null, to: null });
            return;
        }

        if (targetMove?.fen) {
            setFen(targetMove.fen);
            setLastMove(targetMove.from && targetMove.to
                ? { from: targetMove.from, to: targetMove.to }
                : { from: null, to: null });
        }
    }, [isBotGameRoute, archiveGameId, searchParams, history, setFen, setLastMove, setViewIndex]);

// GameBoard.jsx - Az összes UI és Reset logika egyben (JAVÍTOTT)
    useEffect(() => {
    const handleStateSync = async () => {
        if (gameLogic.isLoading) return;

        // 1. HA VAN ÉLŐ JÁTÉK: UI aktiválása és adatok betöltése
        if (gameLogic.gameId && gameLogic.status === "ongoing") {
            setIsGameActiveUI(true);

            if (!opponent) {
                try {
                    const res = await axios.get(`${API_BASE}/get-active-game`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    if (res.data.game_id) {
                        setIsFlipped(res.data.player_color === 'black');
                        
                        setOpponent(findBotByGameData(res.data));
                    }
                } catch { console.error("Hiba az ellenfél pótlásakor"); }
            }
        } else if (gameLogic.gameId && gameLogic.status && gameLogic.status !== "ongoing") {
            setIsGameActiveUI(true);
        }
        /**
         * 2. TAKARÍTÁS (Főmenüben)
         * CSAK AKKOR takarítunk, ha a /play oldalon vagyunk, 
         * NINCS aktív játék, ÉS nem éppen most indítunk egy újat (isStarting)!
         */
        else if (location.pathname === '/play' && !isStarting && !archiveGameId) {
            setIsGameActiveUI(false);
            setOpponent(null);
            setPreviewOpponent(null);

        }
    };

    handleStateSync();
    // Hozzáadtuk az isStarting-ot a függőségi listához is!
    }, [gameLogic.isLoading, gameLogic.gameId, gameLogic.status, location.pathname, isStarting, archiveGameId]);

    const handleSelectionColorChange = (color) => {
        if (color === 'random') {
            setIsFlipped(false);
        } else {
            setIsFlipped(color === 'black');
        }
    };

    const handleClosePopup = () => {
        setDelayedShowPopup(false);
        setIsPopupClosed(true); // Ez jelzi a rendszernek, hogy manuálisan bezárták
        setLastMove({ from: null, to: null });
    };

    const getDisplayTime = (color) => {
        const config = gameLogic.parseTimeControl(lastTimeControl);
        const baseTime = Number(config?.base) || 600;
        if (viewIndex === -1) {
            return color === 'w' ? whiteTime : blackTime;
        }
        if (viewIndex === 0 || history[viewIndex]?.m === "start") {
            return baseTime;
        }
        const move = history[viewIndex];
        if (!move) return baseTime;
        return color === 'w' ? move.wTime : move.bTime;
    };

    
    const handlePlayBotsMenuClick = async () => {
    // 1. Megnézzük a hook-ot: van-e érvényes játék ID?
    if (gameLogic.gameId) {
        try {
            // 2. Beállítjuk a UI-t aktívra (tábla feloldása)
            setIsGameActiveUI(true);
            
            // 3. Biztosítjuk az ellenfél adatait (ha esetleg elvesztek volna)
            if (!opponent) {
                const res = await axios.get(`${API_BASE}/get-active-game`, { 
                    headers: { Authorization: `Bearer ${token}` } 
                });
                setOpponent(findBotByGameData(res.data));
            }
            
            // 4. Navigálunk a bots oldalra (ahol a MoveListPanel lakik)
            navigate('bots'); 
        } catch {
            navigate('bots');
        }
    } else {
        // Ha nincs játék, alaphelyzet és irány a botválasztó
        setIsGameActiveUI(false);
        gameLogic.resetGame();
        navigate('bots');
    }
    };

    const handleRunFullAnalysis = async () => {
    if (!gameId || gameId === "null") return;
    setIsAnalyzing(true);
    try {
        const res = await axios.post(`${API_BASE}/analyze-full-game/${gameId}`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        setAnalysisData(res.data);
        try {
            const activityDates = JSON.parse(localStorage.getItem('checkmate_activity_dates') || '[]');
            activityDates.unshift(new Date().toISOString());
            localStorage.setItem('checkmate_activity_dates', JSON.stringify(activityDates.slice(0, 90)));
            window.dispatchEvent(new Event('checkmate-activity-updated'));
        } catch {
            // Streak activity is a nice-to-have; analysis should stay usable if localStorage is unavailable.
        }
        if (res.data.opening) {
            gameLogic.setOpening(res.data.opening);
        }
        
        setHistory(prev => prev.map(h => {
            // Megkeressük a backend elemzésében a sorszám alapján (num)
            const moveAnalysis = res.data.analysis.find(a => a.move_number === h.num);
            if (moveAnalysis) {
                return {
                    ...h,
                    analysisLabel: moveAnalysis.label.toLowerCase(), // Ikonok miatt kisbetű!
                    eval: moveAnalysis.eval,
                    rawEval: moveAnalysis.raw_eval,
                    bestMove: moveAnalysis.best_move,
                    bestMoveUci: moveAnalysis.best_move_uci,
                    bestEval: moveAnalysis.best_eval,
                    rawBestEval: moveAnalysis.raw_best_eval,
                    evalLoss: moveAnalysis.eval_loss,
                    winChanceLoss: moveAnalysis.win_chance_loss,
                    engineLines: moveAnalysis.engine_lines || []
                };
            }
            return h;
        }));
    } catch (err) {
        console.error("Analysis error:", err);
    } finally {
        setIsAnalyzing(false);
    }
};

    const handleStartNewGame = useCallback(async (...args) => {
        setAnalysisData(null);
        setIsAnalyzing(false);
        setDelayedShowPopup(false);
        setIsPopupClosed(false);
        return startNewGame(...args);
    }, [startNewGame]);

    const handleResetGame = useCallback(() => {
        setAnalysisData(null);
        setIsAnalyzing(false);
        gameLogic.resetGame();
    }, [gameLogic]);

    const handleBotSelect = async (bot, color, time) => {
    setIsStarting(true);
    setAnalysisData(null);
    setIsAnalyzing(false);
    setDelayedShowPopup(false);
    setIsPopupClosed(false);
    
    // 1. Azonnal mutassuk a botot a fejlécben
    setOpponent(bot); 
    setPreviewOpponent(bot);

    try {
        // 2. Új játék indítása
        const assignedColor = await handleStartNewGame(bot, color, time);
        
        if (assignedColor) {
            // 3. Ha elindult, rögzítsük véglegesre az ellenfelet
            setOpponent(bot);
            setIsSelectingBot(false);
            setIsFlipped(assignedColor === 'black');
            setIsGameActiveUI(true);
        }
    } catch (err) {
        console.error("Hiba indításkor:", err);
    } finally {
        setIsStarting(false);
    }
};

    // JAVÍTOTT POPUP EFFECT
    useEffect(() => {
        let timer;
        // Csak akkor indítjuk a timert, ha vége a játéknak ÉS még nem zárták be kézzel
        if (status !== "ongoing" && status !== "" && isGameActive && !archiveGameId) {
            if (!isPopupClosed) {
                timer = setTimeout(() => {
                    setDelayedShowPopup(true);
                }, 500);
            } else {
                // Ha manuálisan bezárták, kényszerítjük a láthatóság kikapcsolását
                setDelayedShowPopup(false);
            }
        } else if (status === "ongoing") {
            setDelayedShowPopup(false);
            setIsPopupClosed(false);
        }

        return () => { if (timer) clearTimeout(timer); };
    }, [status, isGameActive, isPopupClosed, archiveGameId]);

    const goToMove = useCallback((index, isWhiteOnly = false) => {
        setSelectedSquare(null);
        const syncBotGameMoveUrl = (nextIndex) => {
            if (!isBotGameRoute || !archiveGameId) return;
            const normalizedIndex = nextIndex === -1 ? Math.max(history.length - 1, 0) : Math.max(0, nextIndex);
            setSearchParams({ move: String(normalizedIndex) }, { replace: true });
        };
        const playNavSound = (nextIndex) => {
            const soundName = getHistoryNavigationSoundName(history, viewIndex, nextIndex);
            if (soundName) playSound(soundName);
        };

        if (index === -1 || index >= history.length - 1) {
            playNavSound(-1);
            syncBotGameMoveUrl(-1);
            setViewIndex(-1);
            const latest = history[history.length - 1];
            if (latest) {
                setFen(latest.fen);
                setLastMove({ from: latest.from, to: latest.to });
            }
            return;
        }

        const move = history[index];
        if (!move) return;
        playNavSound(index);
        syncBotGameMoveUrl(index);
        if (index === 0 || move.m === 'start') {
            setFen(DEFAULT_FEN);
            setLastMove({ from: null, to: null });
            setViewIndex(0);
            return;
        }
        if (isWhiteOnly) {
            const tempChess = new Chess(move.fen);
            const undone = tempChess.undo();
            if (undone) {
                setFen(tempChess.fen());
                setLastMove({ from: undone.from, to: undone.to });
                setViewIndex(index + "_white");
            }
        } else {
            setFen(move.fen);
            setLastMove({ from: move.from, to: move.to });
            setViewIndex(index);
        }
    }, [history, viewIndex, setFen, setLastMove, setViewIndex, setSelectedSquare, playSound, isBotGameRoute, archiveGameId, setSearchParams]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const currentIdx = viewIndex === -1 ? history.length - 1 : parseInt(viewIndex);
            if (e.key === 'ArrowLeft') {
                if (currentIdx > 0) goToMove(currentIdx - 1);
            } else if (e.key === 'ArrowRight') {
                if (viewIndex !== -1) {
                    if (currentIdx < history.length - 1) goToMove(currentIdx + 1);
                    else goToMove(-1);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewIndex, history, goToMove]);


    useEffect(() => {
    const handleMove = (e) => {
       if (isDragging) {
        // Ha érintés történik, meg kell akadályozni az oldal görgetését!
        if (e.type === 'touchmove' && e.cancelable) {
            e.preventDefault(); 
        }

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // AZONNALI frissítés
        setMousePos({ x: clientX, y: clientY });

            // 2. Tábla pozíciójának lekérése
            const board = document.getElementById('chess-board')?.getBoundingClientRect();
            if (board) {
                let col = Math.floor((clientX - board.left) / (board.width / 8));
                let row = Math.floor((clientY - board.top) / (board.height / 8));

                // Fordított tábla kezelése
                if (isFlipped) {
                    col = 7 - col;
                    row = 7 - row;
                }

                // 3. Ha a táblán belül vagyunk, frissítjük, melyik mező felett állunk
                if (col >= 0 && col < 8 && row >= 0 && row < 8) {
                    const currentSq = getSquareName(row, col);
                    setHoverSquare(currentSq);
                } else {
                    setHoverSquare(null);
                }
            }
        }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, { passive: false });

    return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('touchmove', handleMove);
    };
}, [isDragging, getSquareName, setMousePos, setHoverSquare, isFlipped]);

    const handleTimeChange = (time) => {
        setSelectedTime(time);
        const config = gameLogic.parseTimeControl(time);
        if (config.base) {
            setWhiteTime(config.base);
            setBlackTime(config.base);
        } else {
            setWhiteTime(0);
            setBlackTime(0);
        }
    };

    const showClock = (isGameActiveUI || location.pathname.includes('/bots')) &&
        selectedTime !== "No Timer" &&
        !location.pathname.includes('/analysis');
    const selectedBaseTime = gameLogic.parseTimeControl(selectedTime).base || 600;
    const topClockColor = isFlipped ? 'w' : 'b';
    const bottomClockColor = isFlipped ? 'b' : 'w';
    const topClockSeconds = isGameActiveUI
        ? (isFlipped ? getDisplayTime('w') : getDisplayTime('b'))
        : selectedBaseTime;
    const bottomClockSeconds = isGameActiveUI
        ? (isFlipped ? getDisplayTime('b') : getDisplayTime('w'))
        : selectedBaseTime;
    const boardGameLogic = shouldShowDefaultBoard
        ? {
            ...gameLogic,
            fen: DEFAULT_FEN,
            isFlipped: defaultBoardIsFlipped,
            lastMove: { from: null, to: null },
            validMoves: [],
            selectedSquare: null
        }
        : { ...gameLogic, isFlipped };
    const botCollectionGame = (() => {
        const playableHistory = getPlayableHistory(history);
        const playerName = userName || 'You';
        const botName = opponent?.name || previewOpponent?.name || 'Engine';
        const playerColor = isFlipped ? 'black' : 'white';
        const whiteName = playerColor === 'white' ? playerName : botName;
        const blackName = playerColor === 'black' ? playerName : botName;
        return {
            id: `bot-${gameId || Date.now()}`,
            source: 'bot-game',
            white: whiteName,
            black: blackName,
            white_elo: playerColor === 'white' ? '' : (opponent?.elo || previewOpponent?.elo || ''),
            black_elo: playerColor === 'black' ? '' : (opponent?.elo || previewOpponent?.elo || ''),
            result: gameLogic.result || result || '*',
            date: formatToday(),
            event: 'Bot Game',
            site: 'Checkmate',
            opening: opening?.name || opening || '',
            eco: opening?.eco || '',
            moves: buildMoveText(history),
            analysisHistory: playableHistory,
            fen: getLatestHistoryFen(history, fen),
            startingFen: DEFAULT_FEN,
            initialAnalysis: null,
            gameInfo: {
                white: whiteName,
                black: blackName,
                result: gameLogic.result || result || '*',
            },
            addedAt: new Date().toISOString(),
        };
    })();
    const handlePopupNewGame = () => {
        setIsGameActiveUI(false);
        setAnalysisData(null);
        setIsAnalyzing(false);
        setDelayedShowPopup(false);
        setIsPopupClosed(false);
        handleResetGame();
        navigate('/play/bots');
    };

    const handleDeleteGame = async () => {
        if (!gameId || gameId === "null") return;
        const confirmed = window.confirm("Delete this game from your history?");
        if (!confirmed) return;

        try {
            await axios.delete(`${API_BASE}/game/${gameId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            handleResetGame();
            navigate('/home');
        } catch (err) {
            console.error("Could not delete game:", err);
        }
    };

    const handleOpenSelfAnalysis = () => {
        if (!gameId || gameId === "null") return;
        window.open(`/analysis/game/bots/${gameId}/analysis`, '_blank', 'noopener,noreferrer');
    };

    const handleOpenGameReview = () => {
        if (!gameId || gameId === "null") return;
        navigate(`/analysis/game/bots/${gameId}/review`);
    };

    return (
        <div className="analysis-shell flex min-h-dvh w-full flex-col items-center justify-start bg-[#1e1e1e] gap-4 p-3 overflow-y-auto overflow-x-hidden select-none relative md:h-dvh md:flex-row md:justify-center md:p-4 md:overflow-hidden xl:gap-6">
            {!shouldShowEvalBar && <CapturedProgressBar />}
            {shouldShowEvalBar && (
                <AnalyzeEvalBar whiteBarHeight={whiteBarHeight} currentEvalValue={currentEvalValue} />
            )}

            <div className="flex w-full flex-col items-center justify-center shrink-0 md:h-full md:w-auto">
                <PlayerInfoBar
                    type="top"
                    opponent={opponent}
                    previewOpponent={previewOpponent}
                    material={topMaterial}
                    side={topSide}
                    showClock={showClock}
                    clockIsLight={isFlipped}
                    clockIsActive={activeTimeColor === topClockColor && viewIndex === -1}
                    clockSeconds={topClockSeconds}
                />

                <ChessBoardArea
                    gameLogic={gameLogic}
                    boardGameLogic={boardGameLogic}
                    isGameActiveUI={isGameActiveUI}
                    isFlipped={isFlipped}
                    pendingPromotion={pendingPromotion}
                    delayedShowPopup={delayedShowPopup}
                    status={status}
                    reason={reason}
                    executeMove={executeMove}
                    handleMouseDown={handleMouseDown}
                    handleMouseUp={handleMouseUp}
                    handleClosePopup={handleClosePopup}
                    onNewGame={handlePopupNewGame}
                />

                <PlayerInfoBar
                    type="bottom"
                    userName={userName}
                    userAvatarUrl={userAvatarSrc}
                    material={bottomMaterial}
                    side={bottomSide}
                    showClock={showClock}
                    clockIsLight={!isFlipped}
                    clockIsActive={activeTimeColor === bottomClockColor && viewIndex === -1}
                    clockSeconds={bottomClockSeconds}
                />
            </div>

            <div className="app-panel-size shrink-0 self-center flex flex-col">
                <Outlet context={{ 
                ...gameLogic, 
                startNewGame: handleStartNewGame,
                resetGame: handleResetGame,
                gameId: gameLogic.gameId,
                status: gameLogic.status,
                isLoading: gameLogic.isLoading,
                isGameActiveUI, 
                setIsGameActiveUI, 
                opponent, // EZ KELL IDE!
                setOpponent,
                isFlipped,
                setIsFlipped,
                handleBotSelect, // A GameBoard-os verzió
                handlePlayBotsMenuClick,
                handleTimeChange,
                handleSelectionColorChange,
                setPreviewOpponent,
                isPopupClosed,
                setIsPopupClosed,
                isPopupVisible: delayedShowPopup,
                goToMove,
                handleRunFullAnalysis, // <--- EZ HIÁNYZOTT
                analysisData,          // <--- EZ HIÁNYZOTT
                onGameReviewClick: handleOpenGameReview,
                onSelfAnalysisClick: handleOpenSelfAnalysis,
                isAnalyzing,
                onAddToCollection: () => setIsSaveCollectionOpen(true),
                onDeleteGame: handleDeleteGame,
                isArchiveGame: Boolean(archiveGameId),
            }} />
            </div>

            <SaveCollectionModal
                isOpen={isSaveCollectionOpen}
                onClose={() => setIsSaveCollectionOpen(false)}
                game={botCollectionGame}
            />
        </div>
    );
}; 

export default GameBoard;
