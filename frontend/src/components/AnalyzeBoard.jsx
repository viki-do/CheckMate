import React, { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import AnalysisPanel from './AnalysisPanel';
import { useChess } from '../context/ChessContext';
import SetUpPositionView from './component_helpers/SetUpPositionView';
import { AnimatePresence } from 'framer-motion';
import MasterReviewIntro from './analysis-panel/MasterReviewIntro';
import { getCapturedPieces, getMaterialDiff } from './materialUtils';
import AnalyzeBoardSection from './analyze-board/AnalyzeBoardSection';
import AnalyzeEvalBar from './analyze-board/AnalyzeEvalBar';
import NewAnalysisModal from './analyze-board/NewAnalysisModal';
import SaveCollectionModal from './analyze-board/SaveCollectionModal';
import SetupPieceDragPreview from './analyze-board/SetupPieceDragPreview';
import {
    DEFAULT_FEN,
    getResultLabel,
    getSandboxGameState,
} from './analyze-board/analyzeBoardUtils';
import { getHistoryNavigationSoundName } from '../hooks/chess-game/soundUtils';

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

const AnalyzeBoard = () => {
    const { gameId: masterReviewGameId } = useParams();
    const isMasterReviewRoute = Boolean(masterReviewGameId);
    const chessContext = useChess();
    // --- ÁLLAPOTOK ---
    const [sandboxFen, setSandboxFen] = useState(DEFAULT_FEN);

    const [sandboxStartingFen, setSandboxStartingFen] = useState(DEFAULT_FEN);

    const [sandboxHistory, setSandboxHistory] = useState([]);
    const [sandboxLastMove, setSandboxLastMove] = useState({ from: null, to: null });
    const [viewIndex, setViewIndex] = useState(-1);
    const [openingName, setOpeningName] = useState("");
    const [isFlipped] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [pendingPromotion, setPendingPromotion] = useState(null);
    const [previewFen, setPreviewFen] = useState(null);
    const [rightPanelMode, setRightPanelMode] = useState('analysis'); // 'analysis' vagy 'setup'
    const [initialAnalysis, setInitialAnalysis] = useState(null);
    const [sandboxStatus, setSandboxStatus] = useState('ongoing');
    const [sandboxStatusReason, setSandboxStatusReason] = useState('');
    const [panelNotice, setPanelNotice] = useState('');
    const [selectedSetupPiece, setSelectedSetupPiece] = useState(null); // 'P', 'k', stb.
    const [masterReviewGame, setMasterReviewGame] = useState(null);
    const [masterReviewStarted, setMasterReviewStarted] = useState(false);
    

    const {
        getSquareName, setSelectedSquare, setValidMoves, API_BASE,
        selectedSquare, validMoves, isDragging, setIsDragging,
        token, playSound, setMousePos, setDragOffset, 
        setHoverSquare, hoverSquare, mousePos
    } = chessContext;

    // --- PERSISTENCE ---
    
    useEffect(() => {
    if (isMasterReviewRoute) return;
    const saved = localStorage.getItem('chess_analysis_cache');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            
            // A meglévő betöltéseid:
            if (data.fen) setSandboxFen(data.fen);
            if (data.history) setSandboxHistory(data.history);
            if (data.lastMove) setSandboxLastMove(data.lastMove);
            if (data.opening) setOpeningName(data.opening);
            if (data.initialAnalysis) setInitialAnalysis(data.initialAnalysis);
            if (data.panelNotice) setPanelNotice(data.panelNotice);

            if (data.startingFen) {
                setSandboxStartingFen(data.startingFen);
            } else if (data.fen && (!data.history || data.history.length === 0)) {
            
                setSandboxStartingFen(data.fen);
            }

        } catch (e) {
            console.error("Hiba a cache betöltésekor:", e);
        }
    }
}, [isMasterReviewRoute]); 

    useEffect(() => {
        if (!isMasterReviewRoute || !masterReviewGameId || !API_BASE) return;

        let isMounted = true;
        const loadMasterGame = async () => {
            setIsAnalyzing(true);
            setPanelNotice('');
            setMasterReviewStarted(false);
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
        if (isMasterReviewRoute) return;
        const cache = { 
            fen: sandboxFen, 
            history: sandboxHistory, 
            lastMove: sandboxLastMove, 
            opening: openingName, 
            startingFen: sandboxStartingFen,
            initialAnalysis,
            panelNotice
        };
        localStorage.setItem('chess_analysis_cache', JSON.stringify(cache));
    }, [isMasterReviewRoute, sandboxFen, sandboxHistory, sandboxLastMove, openingName, sandboxStartingFen, initialAnalysis, panelNotice]);

    useEffect(() => {
        const { status, reason } = getSandboxGameState(sandboxFen);
        setSandboxStatus(status);
        setSandboxStatusReason(reason);
    }, [sandboxFen]);



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
    if (sandboxStatus !== 'ongoing') {
        return;
    }

    if (viewIndex !== -1) {
        const latest = sandboxHistory[sandboxHistory.length - 1];
        if (latest) {
            setSandboxFen(latest.fen);
            setSandboxLastMove({ from: latest.from, to: latest.to });
        }
        setViewIndex(-1);
        return; 
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

    // JAVÍTÁS: Hozzáadjuk a fen_before mezőt a mentett lépéshez
    const tempMove = {
        num: sandboxHistory.length,
        m: moveAttempt.san,
        from, to,
        fen: newFen,
        fen_before: fenBefore, // <--- EZT HIÁNYOLTA AZ ANALYSISPANEL
        analysisLabel: null 
    };
    
    setSandboxHistory(prev => [...prev, tempMove]);
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
                analysisLabel: res.data.label?.toLowerCase(),
                eval: res.data.eval / 100,
                rawEval: res.data.eval,
                bestMove: res.data.best_move,
                engineLines: res.data.engine_lines || [] 
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
    } finally { 
        setIsAnalyzing(false); 
    }
};

const handleFullReview = async () => {
    console.log("--- DEBUG: Full Review Folyamat Elindult ---");
    
    // 1. Ellenőrizzük, van-e egyáltalán mit elemezni
    if (sandboxHistory.length === 0) {
        console.warn("STOP: A sandboxHistory üres, nincs mit elemezni.");
        return;
    }

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


        console.log("2. API hívás indítása: /analyze-full-game-sandbox");
        const res = await axios.post(`${API_BASE}/analyze-full-game-sandbox`, { 
            moves: moveList,
            initial_fen: sandboxStartingFen 
        }, { 
            headers: { Authorization: `Bearer ${token}` } 
        });

        console.log("3. Szerver válasz megérkezett:", res.data);

        if (res.data && res.data.analysis) {
            console.log("4. History frissítése az elemzési adatokkal...");
            
            setSandboxHistory(prev => {
                const updatedHistory = prev.map((h, i) => {
                    // Megkeressük a válaszban a lépés sorszáma alapján (1-től indul a backend-en)
                    const moveAnalysis = res.data.analysis.find(a => a.move_number === (i + 1));
                    
                    if (moveAnalysis) {
                        return { 
                            ...h, 
                            analysisLabel: moveAnalysis.label.toLowerCase(),
                            eval: moveAnalysis.eval, // A backend már osztotta 100-zal
                            rawEval: moveAnalysis.raw_eval,
                            bestMove: moveAnalysis.best_move,
                            engineLines: moveAnalysis.engine_lines || [],
                            // Megnyitás neve, ha van
                            openingName: moveAnalysis.opening || null 
                        };
                    }
                    return h;
                });
                
                console.log("5. Frissített Sandbox History:", updatedHistory);
                return updatedHistory;
            });
            
            // Ha a szerver visszaadott egy globális megnyitás nevet, azt is beállíthatjuk
            if (res.data.analysis[0]?.opening) {
                setOpeningName(res.data.analysis[0].opening);
            }
            setMasterReviewStarted(true);

            console.log("--- DEBUG: Full Review Sikeresen Befejeződött ---");
        } else {
            console.error("HIBA: A szerver válaszában nincs 'analysis' mező!", res.data);
        }

    } catch (err) {
        console.error("!!! FULL REVIEW ERROR !!!");
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Szerver hibaüzenet:", err.response.data);
            if (err.response.status === 404) {
                console.error("404-es hiba: Még nem adtad hozzá az új végpontot a Python kódhoz!");
            }
        } else {
            console.error("Hiba oka:", err.message);
        }
    } finally {
        setIsAnalyzing(false);
    }
};
    const handleMouseDown = (e, row, col) => {
    if (previewFen) return;

    const square = getSquareName(row, col);

    // --- DEBUG LOGOK ---
    console.log("--- CLICK DEBUG ---");
    console.log("Mező:", square);
    console.log("Panel mód (rightPanelMode):", rightPanelMode);
    console.log("Kijelölt Setup bábu (selectedSetupPiece):", selectedSetupPiece);

    // --- SETUP MÓD LOGIKA ---
    // Akkor fut le, ha a 'setup' nézetben vagyunk ÉS van kiválasztott bábu a katalógusból
    if (rightPanelMode === 'setup' && selectedSetupPiece) {
        console.log("=> SETUP ACTION: Bábu elhelyezése...");
        
        const chess = new Chess(sandboxFen);
        
        // Meghatározzuk a bábu típusát és színét (Nagybetű = Világos, Kisbetű = Sötét)
        const type = selectedSetupPiece.toLowerCase();
        const color = selectedSetupPiece === selectedSetupPiece.toUpperCase() ? 'w' : 'b';

        // Eltávolítjuk a mezőn lévő esetleges régi bábut, és letesszük az újat
        chess.remove(square);
        const success = chess.put({ type, color }, square);

        if (success) {
            const newFen = chess.fen();
            console.log("=> SIKER: Új FEN generálva:", newFen);
            
            setSandboxFen(newFen);
            // Setup módban a kiinduló állást is frissítjük, hogy az elemzés alapja ez legyen
            setSandboxStartingFen(newFen); 
            
            playSound('move');
        } else {
            console.error("=> HIBA: A chess.put nem sikerült ezen a mezőn!");
        }

        return; // MEGSZAKÍTJUK a függvényt, hogy ne induljon el a normál drag & drop
    }

    // --- EREDETI DRAG & DROP LOGIKA ---
    // Ez csak akkor fut le, ha NEM setup módban vagyunk, vagy nincs kijelölt bábu
    console.log("=> NORMÁL MÓD: Lépéskezelés indítása...");

    if (sandboxStatus !== 'ongoing') {
        return;
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const chess = new Chess(sandboxFen);
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
    const chess = new Chess(sandboxFen);
    
    const type = piece.toLowerCase();
    const color = piece === piece.toUpperCase() ? 'w' : 'b';

    // Tábla frissítése: régi törlése, új lerakása
    chess.remove(square);
    chess.put({ type, color }, square);

    const newFen = chess.fen();
    setSandboxFen(newFen);
    setSandboxStartingFen(newFen);
};

    const handleMouseUp = useCallback(async () => {
        if (!isDragging || !selectedSquare) return;
        const from = selectedSquare;
        const target = hoverSquare; 
        
        setIsDragging(false);
        setSelectedSquare(null);
        setValidMoves([]);
        setHoverSquare(null);

        if (!target || target === from) return;

        const chess = new Chess(sandboxFen);
        const isValid = chess.moves({ square: from, verbose: true }).some(m => m.to === target);

        if (isValid) {
            await executeAnalysisMove(from, target);
        } else {
            playSound('illegal');
        }
    }, [isDragging, selectedSquare, hoverSquare, sandboxFen, playSound, executeAnalysisMove]);

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

    const currentEvalValue = viewIndex === -1
        ? (sandboxHistory.length > 0
            ? (sandboxHistory[sandboxHistory.length - 1].eval ?? 0)
            : (initialAnalysis?.eval ?? 0))
        : (sandboxHistory[viewIndex]?.eval ?? initialAnalysis?.eval ?? 0);
    const whiteBarHeight = Math.min(Math.max(50 + (currentEvalValue * 10), 5), 95);
    const hasActiveSandboxState =
        sandboxHistory.length > 0 ||
        sandboxFen !== DEFAULT_FEN ||
        sandboxStartingFen !== DEFAULT_FEN ||
        Boolean(initialAnalysis) ||
        Boolean(openingName) ||
        Boolean(panelNotice);

    const resetSandboxAnalysis = () => {
        setSandboxFen(DEFAULT_FEN);
        setSandboxHistory([]);
        setSandboxStartingFen(DEFAULT_FEN);
        setSandboxLastMove({ from: null, to: null });
        setViewIndex(-1);
        setOpeningName("");
        setInitialAnalysis(null);
        setPanelNotice('');
        setPreviewFen(null);
        setPendingPromotion(null);
        setRightPanelMode('analysis');
        setSelectedSetupPiece(null);
        setIsDragging(false);
        setIsNewModalOpen(false);
        localStorage.removeItem('chess_analysis_cache');
    };

    return (
        <div className="flex h-screen w-full bg-[#161512] text-[#bab9b8] px-6 py-4 gap-6 overflow-hidden select-none font-sans items-center"
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
            />
        
            <div className="w-[480px] h-[744px] shrink-0 relative box-border">
            {rightPanelMode === 'setup' ? (
            <SetUpPositionView 
                onBack={() => {
                    setRightPanelMode('analysis');
                    setSelectedSetupPiece(null);
                    setIsDragging(false);
                }}
                currentFen={sandboxFen}
                selectedPiece={selectedSetupPiece}
                setIsDragging={setIsDragging}
                isDragging={isDragging}
                onPieceSelect={setSelectedSetupPiece}
                onFenChange={(newFen) => {
                    try {
                        new Chess(newFen); 
                        setSandboxFen(newFen);
                        // Itt MÉG NEM töröljük a history-t, hogy gépelés közben ne villogjon
                    } catch {
                        // Keep invalid FEN ignored while typing, matching the previous behavior.
                    }
                }}
    
                onLoadConfirm={async (finalFen) => {
                const chess = new Chess(finalFen);
                const turn = chess.turn();
                setIsDragging(false);
                setSelectedSetupPiece(null);

                setSandboxStartingFen(finalFen);
                setSandboxFen(finalFen);
                setSandboxLastMove({ from: null, to: null });
                setViewIndex(-1);
                setOpeningName("");
                setInitialAnalysis(null);
                setPanelNotice('');
                setSandboxHistory([]); 
                setRightPanelMode('analysis');
                setIsAnalyzing(true);
                try {
                    // 2. Elemzés kérése
                    const res = await axios.post(`${API_BASE}/analyze-sandbox-move`, {
                        fen_before: finalFen, 
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

            />
            ) : isMasterReviewRoute && masterReviewGame && !masterReviewStarted ? (
            <MasterReviewIntro
                game={masterReviewGame}
                history={sandboxHistory}
                isReviewing={isAnalyzing}
                reviewStarted={masterReviewStarted}
                onStartReview={handleFullReview}
            />
            ) : (
            <AnalysisPanel 
                history={sandboxHistory}
                currentEval={currentEvalValue}
                openingName={openingName}
                viewIndex={viewIndex}
                onViewMove={(idx) => {
                    const soundName = getHistoryNavigationSoundName(sandboxHistory, viewIndex, idx);
                    if (soundName) playSound(soundName);
                    const move = sandboxHistory[idx];
                    if (move) {
                        setSandboxFen(move.fen);
                        setSandboxLastMove({ from: move.from, to: move.to });
                        setViewIndex(idx);
                    } else if (idx === -1) {
                        const latest = sandboxHistory[sandboxHistory.length - 1];
                        setSandboxFen(latest ? latest.fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
                        setSandboxLastMove(latest ? { from: latest.from, to: latest.to } : { from: null, to: null });
                        setViewIndex(-1);
                    }
                }}
                currentFen={sandboxFen}
                initialAnalysis={initialAnalysis}
                statusText={panelNotice || sandboxStatusReason}
                resultLabel={getResultLabel(sandboxStatus, sandboxFen)}
                onSaveClick={() => setIsSaveModalOpen(true)}
                onNewClick={() => hasActiveSandboxState && setIsNewModalOpen(true)}
                onReviewClick={handleFullReview}
                onSetupClick={() => setRightPanelMode('setup')} // Ez már jó volt
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
                />
            </AnimatePresence>
            <AnimatePresence>
                <NewAnalysisModal
                    isOpen={isNewModalOpen}
                    onClose={() => setIsNewModalOpen(false)}
                    onConfirm={resetSandboxAnalysis}
                />
            </AnimatePresence>
        </div>
    );

    
};

export default AnalyzeBoard;
