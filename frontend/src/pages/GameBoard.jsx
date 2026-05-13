import React, { useEffect, useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
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

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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
    const [userName, setUserName] = useState("You");
    const [userAvatarUrl, setUserAvatarUrl] = useState("");


    // --- 2. HOOK ÉS NAVIGÁCIÓ ---

    // JAVÍTÁS: useChessGame() helyett useChess() - így a központi állapotot kapod meg
    const gameLogic = useChess(); 
    const navigate = useNavigate();
    const location = useLocation();
    const { archiveGameId } = useParams();

    const {
        status, history, viewIndex, startNewGame,
        token, gameId, setFen, setLastMove, setViewIndex, isFlipped, setIsFlipped,
        getSquareName, fen, setSelectedSquare, setHoverSquare, initializeGame,
        API_BASE, isDragging, setMousePos, playSound, reason, pendingPromotion,
        whiteTime, blackTime, activeTimeColor, setBlackTime, setWhiteTime,
        lastTimeControl, executeMove, setHistory, handleMouseDown, handleMouseUp,
    } = gameLogic;
    const userAvatarSrc = userAvatarUrl ? `${API_BASE}${userAvatarUrl}` : "";

    // --- ÚJ FÜGGVÉNYEK ---

    const isGameActive = !!gameId && gameId !== "null";
    const shouldShowDefaultBoard = !archiveGameId && (
        location.pathname === '/play' ||
        (location.pathname === '/play/bots' && !isGameActiveUI)
    );
    const defaultBoardIsFlipped = location.pathname === '/play/bots' ? isFlipped : false;
    const displayFen = shouldShowDefaultBoard ? DEFAULT_FEN : fen;
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

            if (gameLogic.gameId && gameLogic.status !== "ongoing") {
                gameLogic.resetGame();
            }
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
        const playNavSound = (nextIndex) => {
            const soundName = getHistoryNavigationSoundName(history, viewIndex, nextIndex);
            if (soundName) playSound(soundName);
        };

        if (index === -1 || index >= history.length - 1) {
            playNavSound(-1);
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
    }, [history, viewIndex, setFen, setLastMove, setViewIndex, setSelectedSquare, playSound]);

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
    const handlePopupNewGame = () => {
        setIsGameActiveUI(false);
        setAnalysisData(null);
        setIsAnalyzing(false);
        setDelayedShowPopup(false);
        setIsPopupClosed(false);
        handleResetGame();
        navigate('/play/bots');
    };

    return (
        <div className="flex justify-center items-center h-screen w-full bg-[#1e1e1e] gap-6 p-4 overflow-hidden select-none relative">
            <CapturedProgressBar />

            <div className="flex flex-col justify-center items-center h-full shrink-0">
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

            <div className="w-112.5 shrink-0 h-170 self-center flex flex-col">
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
                isAnalyzing,
            }} />
            </div>
        </div>
    );
}; 

export default GameBoard;
