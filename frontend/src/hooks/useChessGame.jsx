import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { Chess } from 'chess.js';
// JAVÍTÁS: Socket importálása (feltételezve, hogy a src/socket.js-ben van)
import { socket } from '../socket';
import { DEFAULT_BOT, DEFAULT_FEN, API_BASE } from './chess-game/chessGameConstants';
import { getSquareNameFromCoords, isPromotionMove } from './chess-game/boardUtils';
import {
    createBotMoveEntry,
    createPlayerMoveEntry,
    createStartHistory,
    mergeServerHistoryWithLocalTimes,
} from './chess-game/historyUtils';
import { getTimeCategory, parseTimeControl } from './chess-game/timeControl';
import { getHistoryNavigationSoundName, getMoveAttemptSoundName, getMoveSoundName, renderNotationText } from './chess-game/soundUtils';

const MOVE_COMMIT_DELAY_MS = 100;

export const useChessGame = () => {
    const [gameId, setGameId] = useState(null);
    const [fen, setFen] = useState(DEFAULT_FEN);
    const [selectedSquare, setSelectedSquare] = useState(null);
    const [validMoves, setValidMoves] = useState([]);
    const [lastMove, setLastMove] = useState({ from: null, to: null });
    const [premoves, setPremoves] = useState([]);
    const [history, setHistory] = useState([]);
    const [status, setStatus] = useState("");
    const [result, setResult] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [viewIndex, setViewIndex] = useState(-1);
    const [isAlert, setIsAlert] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [hoverSquare, setHoverSquare] = useState(null);
    const [pendingPromotion, setPendingPromotion] = useState(null);
    const token = localStorage.getItem('chessToken');
    const [reason, setReason] = useState("");
    const [whiteTime, setWhiteTime] = useState(600);
    const [blackTime, setBlackTime] = useState(600);
    const [activeTimeColor, setActiveTimeColor] = useState(null);
    const [increment, setIncrement] = useState(0);
    const whiteWarnedRef = useRef(false);
    const blackWarnedRef = useRef(false);
    const [opening, setOpening] = useState(null);
    const turnStartTimeRef = useRef(Date.now());
    const lastPlayedMoveNum = useRef(0);
    const processedBotFenRef = useRef(new Set());
    // const lastPlayedTickRef = useRef(-1);
    const lastBotRef = useRef(DEFAULT_BOT);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const fenRef = useRef(DEFAULT_FEN);
    const premovesRef = useRef([]);
    const isExecutingPremoveRef = useRef(false);
    const moveRequestInFlightRef = useRef(false);
    const dragStartedAsPremoveRef = useRef(false);
    const gameIdRef = useRef(null);

    const playSound = useCallback((soundName) => {
        const audio = new Audio(`/assets/sounds/${soundName}.mp3`);
        audio.play().catch(() => {});
    }, []);

    const playBotMoveSound = useCallback((san) => {
        const soundName = getMoveSoundName(san);
        if (soundName) playSound(soundName);
    }, [playSound]);

    useEffect(() => {
        fenRef.current = fen;
    }, [fen]);

    useEffect(() => {
        premovesRef.current = premoves;
    }, [premoves]);

    useEffect(() => {
        gameIdRef.current = gameId;
    }, [gameId]);

    const getSquareName = useCallback((row, col) => {
        return getSquareNameFromCoords(row, col);
    }, []);

    const [lastTimeControl, setLastTimeControl] = useState("No Timer");

    const renderNotation = useCallback((text) => {
        return renderNotationText(text);
    }, []);

    const getMyColor = useCallback(() => (isFlipped ? 'b' : 'w'), [isFlipped]);

    const queuePremove = useCallback((from, to) => {
        if (!from || !to || from === to) return;
        setPremoves(prev => {
            if (prev.length >= 5) {
                playSound('illegal');
                return prev;
            }
            playSound('premove');
            const next = [...prev, { from, to, id: `${from}-${to}-${Date.now()}-${prev.length}` }];
            premovesRef.current = next;
            return next;
        });
        setSelectedSquare(null);
        setValidMoves([]);
        setHoverSquare(null);
        setIsDragging(false);
    }, [playSound]);

    const fetchGameState = useCallback(async (id, options = {}) => {
        if (!id || id === "null" || !token) return;
        try {
            const res = await axios.get(`${API_BASE}/game/${id}/history`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.history) {
                if (options.applyState === false) {
                    return res.data;
                }

                const serverHistory = res.data.history;

                if (res.data.player_color) {
                    setIsFlipped(res.data.player_color === 'black');
                }

                const restoredBaseTime = Number(res.data.base_time_sec);
                if (Number.isFinite(restoredBaseTime)) {
                    if (restoredBaseTime <= 0) {
                        setLastTimeControl("No Timer");
                        setWhiteTime(0);
                        setBlackTime(0);
                        setIncrement(0);
                    } else if (lastTimeControl === "No Timer") {
                        setLastTimeControl(`${Math.round(restoredBaseTime / 60)} min`);
                        setWhiteTime(restoredBaseTime);
                        setBlackTime(restoredBaseTime);
                    }
                }

                setHistory(prevHistory => mergeServerHistoryWithLocalTimes(serverHistory, prevHistory));

                const latestMove = serverHistory[serverHistory.length - 1];
                setFen(latestMove.fen);
                if (latestMove.from && latestMove.to) {
                    setLastMove({ from: latestMove.from, to: latestMove.to });
                }

                const nextTurnColor = latestMove.fen.split(' ')[1]; 
                setActiveTimeColor(nextTurnColor);
                
                const moveCount = serverHistory.filter(m => m.m !== "start").length;
                lastPlayedMoveNum.current = moveCount;

                if (res.data.status) setStatus(res.data.status);
                setResult(res.data.result || "");
                if (res.data.opening) setOpening(res.data.opening);

                return res.data; 
            }
        } catch (err) { 
            console.error("Hiba a játék betöltésekor:", err); 
        }
    }, [token, lastTimeControl, setFen, setLastMove, setActiveTimeColor, setStatus, setOpening, setHistory, setIsFlipped]);


    const resetGame = useCallback(() => {
        setGameId(null);
        localStorage.removeItem('chessGameId');
        setFen(DEFAULT_FEN);
        setLastMove({ from: null, to: null });
        premovesRef.current = [];
        setPremoves([]);
        setHistory([]);
        setStatus("");
        setResult("");
        setReason("");
        setViewIndex(-1);
        setActiveTimeColor(null);
        premovesRef.current = [];
        setPremoves([]);
        lastPlayedMoveNum.current = 0;
        processedBotFenRef.current.clear();
        // JAVÍTÁS: Socket lekapcsolása resetkor
        socket.emit("leave_game", { game_id: gameId });
    }, [gameId]);

    const setSpectatorMode = useCallback(() => {
        setFen(DEFAULT_FEN);
        setLastMove({ from: null, to: null });
        setHistory([]);
        setActiveTimeColor(null);
        setStatus(""); 
        setResult("");
        setReason("");
    },[]);

    const startNewGame = useCallback(async (bot, color = 'white', timeControl) => {
        setGameId(null);
        setStatus("");
        setResult("");
        setHistory([]);
        premovesRef.current = [];
        setPremoves([]);
        processedBotFenRef.current.clear();
        if (bot && typeof bot === 'object' && bot.elo) {
            lastBotRef.current = bot;
        }
        const currentBot = (bot && typeof bot === 'object') ? bot : lastBotRef.current;

        const finalTimeControl = timeControl ?? lastTimeControl ?? "No Timer";
        const config = parseTimeControl(finalTimeControl);
        const hasTimer = config.base !== null && config.base !== undefined;
        const initialTime = hasTimer ? config.base : 0;

        whiteWarnedRef.current = false;
        blackWarnedRef.current = false;
        setActiveTimeColor(null);
        setLastMove({ from: null, to: null });
        premovesRef.current = [];
        setPremoves([]);
        setLastTimeControl(finalTimeControl);
        setOpening(null);
        setHistory(createStartHistory(initialTime));
        setReason("");
        setResult("");
        setStatus("ongoing");
        setViewIndex(-1);
        setWhiteTime(initialTime);
        setBlackTime(initialTime);
        setIncrement(config.inc || 0);

        try {
            const res = await axios.post(`${API_BASE}/create-game`,
                {
                    color: color,
                    bot_elo: currentBot.elo,
                    bot_id: currentBot.id,
                    bot_style: currentBot.style || "mix",
                    time_category: getTimeCategory(hasTimer, initialTime),
                    base_time: initialTime,
                    time_control: finalTimeControl
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const { game_id: newId, player_color: assignedColor, fen: initialFen } = res.data;

            setIsFlipped(assignedColor === 'black');
            localStorage.setItem('chessGameId', newId);
            setGameId(newId);
            setFen(initialFen);
            setSelectedSquare(null);
            setValidMoves([]);

            // JAVÍTÁS: Socket csatlakozás és szobába lépés az új játéknál
            socket.connect();
            socket.emit("join_game", { game_id: newId });

            const isBotMoved = initialFen !== DEFAULT_FEN;

            if (isBotMoved) {
                lastPlayedMoveNum.current = 1;
                setActiveTimeColor('b'); 

                const historyRes = await axios.get(`${API_BASE}/game/${newId}/history`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (historyRes.data.history) {
                    const serverHistory = historyRes.data.history;
                    setHistory(serverHistory);
                    const firstMove = serverHistory.find(m => m.m !== "start");
                    if (firstMove && firstMove.from && firstMove.to) {
                        setLastMove({ from: firstMove.from, to: firstMove.to });
                    }
                }
            } else {
                lastPlayedMoveNum.current = 0;
                setActiveTimeColor('w'); 
                setLastMove({ from: null, to: null });
            }

            if (!isBotMoved) {
                await fetchGameState(newId);
            }

            playSound('game-start');
            turnStartTimeRef.current = Date.now();

            return assignedColor;
        } catch (err) {
            console.error("Hiba az új játék indításakor:", err);
            setOpening(null);
            setIsFlipped(color === 'black');
            return color === 'black' ? 'black' : 'white';
        }
    }, [token, playSound, fetchGameState, lastTimeControl, lastBotRef, setIsFlipped]);


const initializeGame = useCallback(async () => {
        if (!token) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/get-active-game`, {
                headers: { Authorization: `Bearer ${token}` }
            });


            if (res.data.game_id) {
                const newId = res.data.game_id;
                
                setGameId(newId);
                setStatus("ongoing");
                
                // JAVÍTÁS: Socket csatlakozás és szobába lépés F5 után is
                socket.on("connect", () => {
                    socket.emit("join_game", { game_id: newId });
                });

                // Ha már csatlakozva van (pl. oldalváltáskor), akkor azonnal küldjük
                if (socket.connected) {
                    socket.emit("join_game", { game_id: newId });
                }
                socket.emit("join_game", { game_id: newId });

                await fetchGameState(newId);
            } else {
                setGameId(null);
            }
        } catch (e) {
            console.error("HOOK: Hiba az inicializálás alatt:", e);
            setGameId(null);
        } finally {
            setIsLoading(false);
        }
    }, [token, fetchGameState]);

    const goToMove = useCallback((index) => {
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
        if (move) {
            setFen(move.fen);
            setLastMove({ from: move.from, to: move.to });
            setViewIndex(index);
            playNavSound(index);
        }
    }, [history, viewIndex, playSound]);

    const processNextPremove = useCallback((currentFen = fenRef.current) => {
        if (isExecutingPremoveRef.current || status !== "ongoing") return;
        if (moveRequestInFlightRef.current) return;
        if (!gameIdRef.current || gameIdRef.current === "null") {
            setPremoves([]);
            return;
        }

        isExecutingPremoveRef.current = true;
        setTimeout(async () => {
            try {
                let latestFen = currentFen || fenRef.current;
                let chess = new Chess(latestFen);

                for (let attempt = 0; attempt < 10; attempt += 1) {
                    await new Promise(resolve => setTimeout(resolve, 120));
                    const gameState = await fetchGameState(gameIdRef.current, { applyState: false });
                    const latestHistory = gameState?.history || [];
                    latestFen = latestHistory[latestHistory.length - 1]?.fen || latestFen;
                    chess = new Chess(latestFen);
                    if (chess.turn() === getMyColor()) break;
                }

                if (chess.turn() !== getMyColor()) return;

                const nextQueue = [...premovesRef.current];
                let nextMove = null;
                let promotion = null;

                while (nextQueue.length && !nextMove) {
                    const candidate = nextQueue.shift();
                    const piece = chess.get(candidate.from);
                    if (!piece || piece.color !== getMyColor()) continue;

                    const legalMove = chess.moves({ square: candidate.from, verbose: true })
                        .find(move => move.to === candidate.to);
                    if (!legalMove) continue;

                    nextMove = candidate;
                    promotion = legalMove.flags.includes('p') ? 'q' : null;
                }

                if (!nextMove) {
                    premovesRef.current = [];
                    setPremoves([]);
                    return;
                }

                premovesRef.current = nextQueue;
                setPremoves(nextQueue);

                const result = await executeMove(nextMove.from, nextMove.to, promotion, latestFen);
                if (result?.nextFen && !result.isGameOver && premovesRef.current.length) {
                    isExecutingPremoveRef.current = false;
                    processNextPremove(result.nextFen);
                }
            } finally {
                isExecutingPremoveRef.current = false;
            }
        }, MOVE_COMMIT_DELAY_MS);
    }, [fetchGameState, getMyColor, status]);

    const executeMove = async (from, to, promotion = null, fenOverride = null, options = {}) => {
        const shouldOptimisticallyCommit = options.optimistic !== false;
        const activeGameId = gameIdRef.current || gameId;
        if (!activeGameId || activeGameId === "null") {
            premovesRef.current = [];
            setPremoves([]);
            setSelectedSquare(null);
            setValidMoves([]);
            setIsDragging(false);
            return { isGameOver: true };
        }

        const chess = new Chess(fenOverride || fen);
        const piece = chess.get(from);
        if (isPromotionMove(piece, to, promotion)) {
            setPendingPromotion({ from, to });
            setIsDragging(false);
            return;
        }
        const movingColor = chess.turn();
        const moveAttempt = chess.move({ from, to, promotion: promotion || 'q' });
        if (!moveAttempt) return;

        const now = Date.now();
        const elapsed = (now - turnStartTimeRef.current) / 1000;
        const isWhiteTurn = movingColor === 'w';
        const currentW = whiteTime;
        const currentB = blackTime;
        const saveWhite = isWhiteTurn ? currentW : whiteTime;
        const saveBlack = !isWhiteTurn ? currentB : blackTime;

        const myMoveForHistory = createPlayerMoveEntry({
            moveAttempt,
            from,
            to,
            fen: chess.fen(),
            elapsed,
            moveNumber: lastPlayedMoveNum.current + 1,
            whiteTime: saveWhite,
            blackTime: saveBlack
        });

        const applyLocalMove = () => {
            setHistory(prev => [...prev, myMoveForHistory]);

            if (isWhiteTurn) {
                setWhiteTime(prev => prev + increment);
                setActiveTimeColor('b');
            } else {
                setBlackTime(prev => prev + increment);
                setActiveTimeColor('w');
            }

            turnStartTimeRef.current = Date.now();
            setPendingPromotion(null);
            setFen(chess.fen());
            setLastMove({ from, to });
            setSelectedSquare(null);
            setValidMoves([]);
            setIsDragging(false);
            lastPlayedMoveNum.current += 1;
            playSound(getMoveAttemptSoundName(chess, moveAttempt));
        };

        // Hangok lejátszása a saját lépés után
        let localMoveTimer = null;
        if (shouldOptimisticallyCommit) {
            localMoveTimer = setTimeout(() => {
                applyLocalMove();
            }, MOVE_COMMIT_DELAY_MS);
        }

        try {
            // Elküldjük a lépést a szervernek. 
            // A bot válaszát NEM itt kezeljük, hanem a WebSocketen keresztül érkezik majd meg!
            moveRequestInFlightRef.current = true;
            const res = await axios.post(`${API_BASE}/move`,
                { game_id: activeGameId, move: `${from}${to}${promotion || ""}` },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            moveRequestInFlightRef.current = false;

            if (res.data.opening) {
                setOpening(res.data.opening);
            }

            if (res.data.is_game_over) {
                setStatus(res.data.status);
                setReason(res.data.reason);
                setActiveTimeColor(null);
                // Ha nincs bot lépés (mert mi mattoltunk), törölhetjük az ID-t
                if (!res.data.bot_move) {
                    localStorage.removeItem('chessGameId');
                }
            }
            
            // JAVÍTÁS: A bot_move kezelést kivettük innen, mert a Socket.io-n érkezik!
            
            if (res.data.bot_move?.san && res.data.new_fen) {
                const botMove = res.data.bot_move;
                const nextTurnColor = res.data.new_fen.split(' ')[1];

                if (!processedBotFenRef.current.has(res.data.new_fen)) {
                    processedBotFenRef.current.add(res.data.new_fen);

                    setHistory(prev => {
                        if (prev.some(m => m.fen === res.data.new_fen)) return prev;

                        return [
                            ...prev,
                            createBotMoveEntry({
                                botMove,
                                fen: res.data.new_fen,
                                thinkTime: botMove.think_time || 0,
                                moveNumber: prev.length,
                                whiteTime,
                                blackTime
                            })
                        ];
                    });

                    setFen(res.data.new_fen);
                    setLastMove({ from: botMove.from, to: botMove.to });
                    setActiveTimeColor(res.data.is_game_over ? null : nextTurnColor);
                    turnStartTimeRef.current = Date.now();
                    lastPlayedMoveNum.current = lastPlayedMoveNum.current + 1;

                    setTimeout(() => {
                        playBotMoveSound(botMove.san);
                    }, 110);
                }

                return { nextFen: res.data.new_fen, isGameOver: res.data.is_game_over };
            }

            return { nextFen: res.data.new_fen || chess.fen(), isGameOver: res.data.is_game_over };

        } catch (err) {
            const errorDetail = err.response?.data?.detail || err.response?.data || err;
            console.error("Move error:", errorDetail);
            moveRequestInFlightRef.current = false;
            if (localMoveTimer) clearTimeout(localMoveTimer);
            if (errorDetail?.fen) {
                setFen(errorDetail.fen);
                fenRef.current = errorDetail.fen;
                if (errorDetail.turn) {
                    setActiveTimeColor(errorDetail.turn === "white" ? "w" : "b");
                }
            } else {
                premovesRef.current = [];
                setPremoves([]);
            }
            setSelectedSquare(null);
            setValidMoves([]);
            setIsDragging(false);
            dragStartedAsPremoveRef.current = false;
            if (gameId) {
                await fetchGameState(gameId);
            }
        }
    };

    useEffect(() => {
        if (status !== "ongoing") return;
        if (viewIndex !== -1 || !gameId) return;
        if (activeTimeColor !== getMyColor()) return;
        if (!premoves.length) return;

        processNextPremove(fen);
    }, [activeTimeColor, fen, gameId, getMyColor, premoves.length, processNextPremove, status, viewIndex]);

const handleMouseDown = (e, row, col) => {
        // 1. Koordináták azonnal
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        if (status !== "ongoing" || viewIndex !== -1 || !gameId) return;

        const square = getSquareName(row, col);
        const chess = new Chess(fen);
        const piece = chess.get(square);

        // Click-Click kezelés
        if (selectedSquare && selectedSquare !== square && validMoves.includes(square)) {
            executeMove(selectedSquare, square);
            return;
        }

        if (selectedSquare && selectedSquare !== square && (dragStartedAsPremoveRef.current || activeTimeColor !== getMyColor())) {
            queuePremove(selectedSquare, square);
            if (activeTimeColor === getMyColor()) {
                processNextPremove(fenRef.current);
            }
            return;
        }

        const myColor = getMyColor();

        if (piece && piece.color === myColor) {
            dragStartedAsPremoveRef.current = activeTimeColor !== myColor;
            // --- KRITIKUS: Szinkron state frissítés ---
            setMousePos({ x: clientX, y: clientY });
            setSelectedSquare(square);
            setHoverSquare(square);
            setIsDragging(true); // Ez az, ami "felemeli" a bábut

            // A backend kérést tedd egy külön szálra, ne várj rá (nincs await!)
            if (activeTimeColor === myColor) {
                axios.post(`${API_BASE}/get-valid-moves`, { game_id: gameId, square: square }, { headers: { Authorization: `Bearer ${token}` } })
                    .then(res => setValidMoves(res.data.valid_moves || []))
                    .catch(() => setValidMoves([]));
            } else {
                setValidMoves([]);
            }

            const rect = e.currentTarget.getBoundingClientRect();
            setDragOffset({ 
                x: clientX - (rect.left + rect.width / 2), 
                y: clientY - (rect.top + rect.height / 2) 
            });
        }
    };

    const handleMouseUp = async () => {
        if (!isDragging || !selectedSquare) return;

        const from = selectedSquare;
        const target = hoverSquare; 
        
        setIsDragging(false);

        // Ha nincs cél, vagy ugyanaz a mező
        if (!target || target === from) {
            setHoverSquare(null);
            dragStartedAsPremoveRef.current = false;
            return;
        }

        const myColor = getMyColor();
        if (dragStartedAsPremoveRef.current || activeTimeColor !== myColor) {
            queuePremove(from, target);
            dragStartedAsPremoveRef.current = false;
            if (activeTimeColor === myColor) {
                processNextPremove(fenRef.current);
            }
            return;
        }

        // HELYI SAKKMOTOR ELLENŐRZÉSE
        const chess = new Chess(fen);
        const moves = chess.moves({ square: from, verbose: true });
        const isValidMove = moves.some(m => m.to === target);

        if (isValidMove) {
            await executeMove(from, target);
            setSelectedSquare(null);
            setValidMoves([]);
        } else {
            playSound('illegal');
            setIsAlert(true);
            setTimeout(() => setIsAlert(false), 400);
        }
        
        setHoverSquare(null);
    };

    const handleResign = async () => {
        if (!window.confirm("Are you sure you want to resign or leave?")) return;
        if (!gameId || !token) return;
        try {
            setActiveTimeColor(null);
            const res = await axios.post(`${API_BASE}/resign-game`,
                { game_id: gameId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data.status) {
                setStatus(res.data.status);
                setReason(res.data.reason);
                playSound(res.data.status === "aborted" ? 'move' : 'game-end');
                localStorage.removeItem('chessGameId');
            }
        } catch (err) { console.error("Resign error:", err); }
    };

    const offerDraw = async () => {
        if (!window.confirm("Offer a draw?")) return;
        if (!gameId || !token) return;
        try {
            const res = await axios.post(`${API_BASE}/offer-draw`,
                { game_id: gameId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data.status === "draw") {
                setReason(res.data.reason || "Draw by agreement");
                setStatus("draw");
                playSound('game-end');
                localStorage.removeItem('chessGameId');
            }
        } catch (err) {
            console.error("Draw offer error:", err);
        }
    };

    // --- ÚJ SOCKET.IO EFFECT (Kiváltja a pollingot) ---
useEffect(() => {
    if (!gameId || !socket) {
        return;
    }


    // Szobába lépés függvénye
    const joinRoom = () => {
        socket.emit("join_game", { game_id: gameId });
    };

    // Ha már él a kapcsolat, lépjünk be azonnal
    if (socket.connected) {
        joinRoom();
    }

    // Eseménykezelők definiálása
    const onConnect = () => {
        joinRoom();
    };

    const onDisconnect = (reason) => {
        console.warn("WS: Socket lecsatlakozott! Indok:", reason);
    };

    const handleBotMove = (data) => {
        
        // UUID típusbiztonsági ellenőrzés
        if (String(data.game_id) !== String(gameId)) {
            console.warn(`WS: Rossz játék ID! Érkezett: ${data.game_id}, Aktuális: ${gameId}`);
            return;
        }


        const botMove = data.move;
        const nextTurnColor = data.fen.split(' ')[1];
        if (processedBotFenRef.current.has(data.fen)) {
            return;
        }
        processedBotFenRef.current.add(data.fen);
        
        // JAVÍTÁS: A szerver által küldött pontos gondolkodási időt használjuk
        // Ha valamiért nem jönne meg (régi backend), marad a kalkulált fallback
        const serverThinkTime = data.thinking_time !== undefined ? 
            parseFloat(data.thinking_time) : 
            parseFloat(((Date.now() - turnStartTimeRef.current) / 1000).toFixed(1));

        // Állapotfrissítések
        setHistory(prev => {
            // Ellenőrizzük, hogy ez a FEN véletlenül nincs-e már benne
            if (prev.some(m => m.fen === data.fen)) return prev;

            const botMoveEntry = createBotMoveEntry({
                botMove,
                fen: data.fen,
                thinkTime: serverThinkTime, // A szerver által generált random idő (1-4s)
                moveNumber: prev.length,   // Sorszám a lista hossza alapján
                whiteTime,
                blackTime
            });
            return [...prev, botMoveEntry];
        });

        setFen(data.fen);
        setLastMove({ from: botMove.from, to: botMove.to });
        if (data.opening) {
            setOpening(data.opening);
        }
        setActiveTimeColor(nextTurnColor);
        
        // JAVÍTÁS: Itt nullázzuk a saját óránkat a következő lépéshez
        turnStartTimeRef.current = Date.now();
        lastPlayedMoveNum.current = lastPlayedMoveNum.current + 1;

        // Hang lejátszása késleltetve (hogy a tábla frissülése után halljuk)
        setTimeout(() => {
            playBotMoveSound(botMove.san);
        }, 110);
    };

    const handleGameOver = (data) => {
        if (String(data.game_id) !== String(gameId)) return;
        
        setStatus(data.status);
        setReason(data.reason);
        setActiveTimeColor(null);
        localStorage.removeItem('chessGameId');
        // playSound('game-end');
    };

    // Események regisztrálása
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("bot_moved", handleBotMove);
    socket.on("game_over", handleGameOver);

    // Kényszerített csatlakozás, ha valamiért nem indult volna el
    if (!socket.connected) {
        socket.connect();
    }

    // Takarítás a hook leállásakor
    return () => {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("bot_moved", handleBotMove);
        socket.off("game_over", handleGameOver);
    };

}, [gameId, playBotMoveSound, processNextPremove]); // Az időzítőket (whiteTime, blackTime) szándékosan kihagyjuk!
    // Óra effektus (Ref-ek nélkül, az eredeti logikád szerint)
    useEffect(() => {
        let timer;
        const hasTimer = parseTimeControl(lastTimeControl).base !== null;
        if (hasTimer && gameId && gameId !== "null" && status === "ongoing" && activeTimeColor) {
        const startTime = Date.now();
            const startValue = activeTimeColor === 'w' ? whiteTime : blackTime;
            timer = setInterval(async () => {
                const now = Date.now();
                const elapsed = (now - startTime) / 1000;
                const newValue = Math.max(0, startValue - elapsed);
                if (activeTimeColor === 'w') {
                    setWhiteTime(newValue);
                } else {
                    setBlackTime(newValue);
                }
                if (newValue <= 0) {
                    clearInterval(timer);
                    setActiveTimeColor(null);
                    try {
                        const res = await axios.post(`${API_BASE}/move`, {
                            game_id: gameId,
                            timeout: true
                        }, { headers: { Authorization: `Bearer ${token}` } });
                        if (res.data.status) {
                            setStatus(res.data.status);
                            setReason(res.data.reason);
                            playSound(res.data.status === "aborted" ? 'move' : 'game-end');
                            localStorage.removeItem('chessGameId');
                        }
                    } catch (err) { console.error("Timeout error:", err); }
                }
            }, 50);
        }
        return () => clearInterval(timer);
    }, [gameId, status, activeTimeColor, lastTimeControl, token, playSound]);

    // Figyelmeztető hang effektus
    useEffect(() => {
        const hasTimer = parseTimeControl(lastTimeControl).base !== null;
        if (!hasTimer || status !== "ongoing" || !activeTimeColor) return;
        if (whiteTime <= 10 && whiteTime > 0) {
            if (!whiteWarnedRef.current) {
                playSound('tenseconds');
                whiteWarnedRef.current = true;
            }
        } else if (whiteTime > 10) {
            whiteWarnedRef.current = false;
        }
        if (blackTime <= 10 && blackTime > 0) {
            if (!blackWarnedRef.current) {
                playSound('tenseconds');
                blackWarnedRef.current = true;
            }
        } else if (blackTime > 10) {
            blackWarnedRef.current = false;
        }
    }, [whiteTime, blackTime, status, activeTimeColor, lastTimeControl, playSound]);

    return {
        gameId, setGameId, fen, setFen, selectedSquare, setSelectedSquare, validMoves, setValidMoves,
        premoves, setPremoves,
        lastMove, setLastMove, history, setHistory, status, setStatus, result, setResult, isDragging, setIsDragging,
        viewIndex, setViewIndex, isAlert, setIsAlert, mousePos, setMousePos, dragOffset, setDragOffset,
        hoverSquare, setHoverSquare, getSquareName, fetchGameState, startNewGame, handleResign,
        executeMove, playSound, token, API_BASE, reason, setReason, pendingPromotion, setPendingPromotion,
        goToMove, handleMouseDown, handleMouseUp, renderNotation, offerDraw, resetGame, whiteTime, blackTime,
        activeTimeColor, isFlipped, setIsFlipped, parseTimeControl, setBlackTime, setWhiteTime, lastTimeControl,
        opening, setOpening, setSpectatorMode, isLoading, initializeGame 
    };
};
