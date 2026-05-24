import React, { useState, useEffect } from 'react'; // JAVÍTVA: useState hozzáadva
import { MoreHorizontal, Trash2, RotateCw, Repeat2 } from 'lucide-react';
import { useRef } from 'react';
import { Chess } from 'chess.js'; // JAVÍTVA: Kell a validáláshoz
import { 
    SetUpPosition, 
    LoadPrevious, 
    New, 
    Save, 
    Review, 
    ChevronLeft, 
    ResetArrow,
    ChevronRight,
    ArrowChevronEnd,
} from '../icons/Icons';
import { 
    ControlBtn, 
    FooterAction 
} from './AnalysisHelpers';

const transparentPixel = new Image();
transparentPixel.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const DEFAULT_SETUP_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CLEAR_SETUP_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
const SETUP_DEBUG = false;
const setupDebug = (...args) => {
    if (SETUP_DEBUG) console.log('[SetupPositionView]', ...args);
};

const SetUpPositionView = ({ 
    onBack, 
    history = [], 
    onSaveClick, 
    onNewClick,   
    viewIndex,   
    onViewMove,
    onReviewClick,
    canSave = false,
    canReview = false,
    setupTurn = null,
    onTurnChange,
    currentFen,
    onFenChange,
    onLoadConfirm,
    onPieceSelect,
    onFlipBoard,
    onResetBoard,
    onClearBoard,
    selectedPiece,
    setIsDragging,
    isDragging
}) => {
    // Lokális state a gépeléshez
    setupDebug('render', { currentFen, setupTurn, selectedPiece, isDragging });
    const [localFen, setLocalFen] = useState(currentFen);
    const [turn, setTurn] = useState('w');
    const [castling, setCastling] = useState({
        wOO: true, wOOO: true, bOO: true, bOOO: true
    })
    const handledToolbarPressRef = useRef(false);
    
    const updateFenTurn = (fen, nextTurn) => {
        const fenParts = (fen || '').trim().split(/\s+/);
        if (fenParts.length < 4) return fen;

        fenParts[1] = nextTurn;
        fenParts[4] = '0';
        fenParts[5] = '1';
        return fenParts.join(' ');
    };

    const placePieceOnBoard = (square) => {
    if (!selectedPiece) return;
    
    try {
        const c = new Chess(localFen, { skipValidation: true });
        // Ha ugyanazt a bábut rakjuk le, ami ott van, akkor "töröljük" (opcionális)
        // c.put({ type: ..., color: ... }, square)
        
        // A chess.js-nél a put() metódus kell:
        const type = selectedPiece.toLowerCase();
        const color = selectedPiece === selectedPiece.toUpperCase() ? 'w' : 'b';
        
        c.remove(square); // Előbb töröljük ami ott volt
        c.put({ type, color }, square);
        
        const newFen = updateFenTurn(c.fen(), turn);
        setLocalFen(newFen);
        onFenChange(newFen);
    } catch (e) {
        console.error("Hiba a bábu elhelyezésekor", e);
    }
};



     const syncUIWithFen = (fen) => {
        const fenParts = String(fen || '').trim().split(/\s+/);
        const castlingPart = fenParts[2] || '';

        setTurn(fenParts[1] === 'b' ? 'b' : 'w');
            
            
            setCastling({
                wOO: castlingPart.includes('K'),
                wOOO: castlingPart.includes('Q'),
                bOO: castlingPart.includes('k'),
                bOOO: castlingPart.includes('q')
            });
            // Érvénytelen FEN-nél nem frissítjük a UI-t
    };

    useEffect(() => {
        const nextTurn = setupTurn || (() => {
            try {
                return new Chess(currentFen, { skipValidation: true }).turn();
            } catch {
                return 'w';
            }
        })();
        const normalizedFen = updateFenTurn(currentFen, nextTurn);
        setLocalFen(normalizedFen);
        syncUIWithFen(normalizedFen);
    }, [currentFen, setupTurn]);

    const handleInputChange = (e) => {
        const newFen = e.target.value;
        setLocalFen(newFen);
        try {
            const parsed = new Chess(newFen, { skipValidation: true });
            onTurnChange?.(parsed.turn());
            syncUIWithFen(newFen); // Frissítjük a gombokat/választót
            onFenChange(newFen);
        } catch (err) {}
    };

    const resetBoard = () => {
        setupDebug('handleResetBoard:start', { before: localFen });
        setTurn('w');
        setCastling({ wOO: true, wOOO: true, bOO: true, bOOO: true });
        setLocalFen(DEFAULT_SETUP_FEN);
        onResetBoard?.(DEFAULT_SETUP_FEN);
        setupDebug('handleResetBoard:called-parent', { nextFen: DEFAULT_SETUP_FEN, hasParentHandler: Boolean(onResetBoard) });
    };

    const clearBoard = () => {
        setupDebug('handleClearBoard:start', { before: localFen });
        setTurn('w');
        setCastling({ wOO: false, wOOO: false, bOO: false, bOOO: false });
        setLocalFen(CLEAR_SETUP_FEN);
        onClearBoard?.(CLEAR_SETUP_FEN);
        setupDebug('handleClearBoard:called-parent', { nextFen: CLEAR_SETUP_FEN, hasParentHandler: Boolean(onClearBoard) });
    };

    const flipBoard = () => {
        onFlipBoard?.();
        setupDebug('flip:called-parent', { hasParentHandler: Boolean(onFlipBoard) });
    };

    const handleToolbarPress = (action) => (event) => {
        event.preventDefault();
        event.stopPropagation();
        handledToolbarPressRef.current = true;
        action();
    };

    const handleToolbarClick = (action) => (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (handledToolbarPressRef.current) {
            handledToolbarPressRef.current = false;
            return;
        }

        action();
    };

    return (
        /* A fő konténer határozza meg a teljes méretet */
        <div className="app-panel-size flex flex-col bg-[#262421] rounded-lg shadow-xl border border-[#3c3a37] overflow-hidden">
            
            {/* JAVÍTOTT HEADER: relative szülő, fix magasság */}
            <div className="relative border-b border-[#3c3a37] flex items-center bg-[#21201d] shrink-0 h-[64px] px-4">
                {/* Vissza gomb - z-10 hogy kattintható maradjon az abszolút réteg felett */}
                <button 
                    onClick={onBack} 
                    className="relative z-10 text-[#bab9b8] hover:text-white transition-colors shrink-0"
                >
                    <ChevronRight size={24} className="rotate-180" />
                </button>
                
                {/* IKON ÉS NÉV - Abszolút középre igazítva a teljes fejléchez képest */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-2">
                        <SetUpPosition size={20} className="text-[#bab9b8]" />
                        <h2 className="font-bold text-white text-lg">Setup Position</h2>
                    </div>
                </div>
            </div>

            {/* SCROLLABLE CONTENT */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
        
                <div 
                className="grid grid-cols-6 gap-2 bg-[#454442] p-4"
                onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                }}
                >
                    {['p','b','n','r','q','k', 'P','B','N','R','Q','K'].map(p => {
                    // Akkor rejtjük el, ha vonszolás van ÉS ez az a bábu
                    const isActuallyDraggingThis = isDragging && selectedPiece === p;

                    return (
                        <div 
                            key={p}
                            onClick={() => onPieceSelect(selectedPiece === p ? null : p)}
                            className={`p-1 rounded cursor-pointer transition-all ${
                                selectedPiece === p ? 'bg-[#ffff33]' : 'hover:bg-white/10'
                            }`}
                        >
                            <img 
                                src={`/assets/pieces/${p === p.toLowerCase() ? 'black' : 'white'}_${
                            p.toLowerCase() === 'p' ? 'pawn' : p.toLowerCase() === 'n' ? 'knight' : 
                            p.toLowerCase() === 'b' ? 'bishop' : p.toLowerCase() === 'r' ? 'rook' : 
                            p.toLowerCase() === 'q' ? 'queen' : 'king'
                        }.png`} 
                        className={`scale-125 mx-auto transition-opacity duration-75 ${
                // HA vonszoljuk ÉS ez az a bábu, akkor eltűnik a rácsból
                (isDragging && selectedPiece === p) ? 'opacity-0' : 'opacity-100'
                    }`} 
                    draggable="true"
                    onDragStart={(e) => {
                        e.dataTransfer.setData("chess-piece", p);
                        onPieceSelect(p); 
                        setIsDragging(true); 
                        if (transparentPixel.complete) {
                            e.dataTransfer.setDragImage(transparentPixel, 0, 0);
                        }
                    }}
                    onDragEnd={() => setIsDragging(false)}
                            />
                        </div>
                    );
                })}
                </div>

                <div className='px-4 flex flex-col'>
                    <div className="py-4 flex items-center gap-4">
                        <select 
                            value={turn === 'w' ? "White to move" : "Black to move"}
                             onChange={(e) => {
                                const newTurn = e.target.value === "White to move" ? 'w' : 'b';
                                // Itt elméletileg módosítani kéne a FEN stringet is, ha a felhasználó kézzel vált
                                setTurn(newTurn);
                                onTurnChange?.(newTurn);
                                const updatedFen = updateFenTurn(localFen, newTurn);
                                setLocalFen(updatedFen);
                                onFenChange(updatedFen);
                            }}
                            className="flex-1 bg-[#161512] text-white p-2 rounded border border-[#3c3a37] text-sm focus:outline-none cursor-pointer"
                        >
                            <option>White to move</option>
                            <option>Black to move</option>
                        </select>
                        <div className="relative z-20 flex shrink-0 items-center justify-center gap-4 text-[#bab9b8]">
                            <button
                                type="button"
                                aria-label="Flip board"
                                title="Flip Board"
                                onMouseDown={handleToolbarPress(flipBoard)}
                                onTouchStart={handleToolbarPress(flipBoard)}
                                onClick={handleToolbarClick(flipBoard)}
                                className="relative z-20 cursor-pointer p-1 hover:text-white transition-colors"
                            >
                                <Repeat2 size={18}/>
                            </button>
                            <button
                                type="button"
                                aria-label="Reset board"
                                title="Reset Board"
                                onMouseDown={handleToolbarPress(resetBoard)}
                                onTouchStart={handleToolbarPress(resetBoard)}
                                onClick={handleToolbarClick(resetBoard)}
                                className="relative z-20 cursor-pointer p-1 hover:text-white transition-colors"
                            >
                                <RotateCw size={18}/>
                            </button>
                            <button
                                type="button"
                                aria-label="Clear board"
                                title="Clear Board"
                                onMouseDown={handleToolbarPress(clearBoard)}
                                onTouchStart={handleToolbarPress(clearBoard)}
                                onClick={handleToolbarClick(clearBoard)}
                                className="relative z-20 cursor-pointer p-1 hover:text-white transition-colors"
                            >
                                <Trash2 size={18}/>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs text-[#bab9b8] py-3">
                        <div className="space-y-2">
                            <p className="font-bold text-white uppercase text-[10px]">White</p>
                            <label className="flex items-center gap-2 cursor-pointer font-semibold">
                                <input type="checkbox" checked={castling.wOO} readOnly className="accent-[#81b64c]" /> O-O
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer font-semibold">
                                <input type="checkbox" checked={castling.wOOO} readOnly className="accent-[#81b64c]" /> O-O-O
                            </label>
                        </div>
                        <div className="space-y-2">
                            <p className="font-bold text-white uppercase text-[10px]">Black</p>
                            <label className="flex items-center gap-2 cursor-pointer font-semibold">
                                <input type="checkbox" checked={castling.bOO} readOnly className="accent-[#81b64c]" /> O-O
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer font-semibold">
                                <input type="checkbox" checked={castling.bOOO} readOnly className="accent-[#81b64c]" /> O-O-O
                            </label>
                        </div>
                    </div>

                    <div className="space-y-3 mt-2">
                        <input 
                            type="text" 
                            value={localFen} // localFen-t használunk, nem a currentFen-t!
                            onChange={handleInputChange}
                            placeholder="Enter FEN" 
                            className="w-full bg-[#161512] text-white p-2 rounded border border-[#3c3a37] text-xs font-mono focus:border-[#81b64c] outline-none" 
                        />
                        <textarea placeholder="[Event '?']..." className="w-full h-20 bg-[#161512] text-white p-2 rounded border border-[#3c3a37] text-xs font-mono resize-none focus:border-[#81b64c] outline-none" />
                    </div>

                    <button 
                        onClick={() => onLoadConfirm(localFen)} // Meghívjuk a véglegesítő függvényt
                        className="w-full mt-6 py-3 bg-[#81b64c] hover:bg-[#95c95c] text-white font-black rounded shadow-lg transition-colors uppercase text-sm mb-4"
                    >
                        Load
                    </button>
                </div>
            </div>

            {/* FIX FOOTER */}
            <div className="p-2 bg-[#21201d] rounded-b-lg border-t border-[#3c3a37] shrink-0 h-[124px] box-border">
                <div className="flex justify-between gap-1 mb-3 px-1 h-12">
                    <ControlBtn icon={<ResetArrow size={20} />} onClick={() => onViewMove?.(0)} disabled />
                    <ControlBtn icon={<ChevronLeft size={20} />} onClick={() => onViewMove?.(viewIndex === -1 ? history.length - 2 : viewIndex - 1)} disabled />
                    <ControlBtn icon={<ChevronRight size={20} />} onClick={() => onViewMove?.(viewIndex === -1 ? -1 : viewIndex + 1)} disabled />
                    <ControlBtn icon={<ArrowChevronEnd size={20} />} onClick={() => onViewMove?.(-1)} disabled />
                </div>
                <div className="flex justify-center items-center text-[#8b8987] pb-1">
                     <div className='flex gap-7'>
                        <FooterAction icon={<New size={20} />} label="New" onClick={onNewClick || onBack} />
                        <FooterAction icon={<Save size={20} />} label="Save" onClick={onSaveClick} disabled={!canSave} />
                        <FooterAction icon={<Review size={20} />} label="Review" onClick={onReviewClick} disabled={!canReview} />
                        <FooterAction icon={<MoreHorizontal size={20} />} label="" />
                     </div>
                </div>
            </div>
        </div>
    );
};

export default SetUpPositionView;
