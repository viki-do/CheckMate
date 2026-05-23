import React, { useEffect, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chess } from 'chess.js';

const piecesMap = {
    'r': 'black_rook', 'n': 'black_knight', 'b': 'black_bishop', 'q': 'black_queen', 'k': 'black_king', 'p': 'black_pawn',
    'R': 'white_rook', 'N': 'white_knight', 'B': 'white_bishop', 'Q': 'white_queen', 'K': 'white_king', 'P': 'white_pawn'
};

const ChessBoardGrid = ({ gameLogic, onMouseDown, onMouseUp, onDrop }) => {
    const boardInstanceId = useId();
    const boardRef = useRef(null); // Ref a táblához a passzív eseménykezelő fixhez

    const {
        fen,
        selectedSquare = null,
        lastMove = { from: null, to: null },
        validMoves = [],
        premoves = [],
        isDragging = false,
        hoverSquare = null,
        mousePos = { x: 0, y: 0 },
        isAlert = false,
        status = "viewing",
        viewIndex = -1,
        getSquareName = (row, col) => `${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][col]}${8 - row}`,
        isFlipped = false,
        compact = false,
        handleMouseUp = onMouseUp || (() => {})
    } = gameLogic;

    // --- TECHNIKAI JAVÍTÁS A KONZOL HIBÁHOZ ---
    useEffect(() => {
        const boardElement = boardRef.current;
        if (!boardElement) return;

        const preventDefault = (e) => {
            if (e.cancelable) e.preventDefault();
        };

        // Kényszerítjük a non-passive módot, hogy a preventDefault működjön
        boardElement.addEventListener('touchstart', preventDefault, { passive: false });
        boardElement.addEventListener('touchmove', preventDefault, { passive: false });

        return () => {
            boardElement.removeEventListener('touchstart', preventDefault);
            boardElement.removeEventListener('touchmove', preventDefault);
        };
    }, []);

    let activeKingSquare = null;
    if (isAlert) {
        try {
            const gameInstance = new Chess(fen);
            const board = gameInstance.board().flat();
            const whiteKing = board.find(p => p && p.type === 'k' && p.color === 'w')?.square;
            const blackKing = board.find(p => p && p.type === 'k' && p.color === 'b')?.square;
            activeKingSquare = isFlipped ? blackKing : whiteKing;
        } catch (error) { console.warn(error); }
    }
    
    const fenRows = fen.split(' ')[0].split('/');
    const fullBoard = fenRows.map(r => {
        const line = [];
        for (let char of r) {
            if (isNaN(char)) line.push(char);
            else for (let i = 0; i < parseInt(char); i++) line.push(null);
        }
        return line;
    });

    const boardCells = [];
    let draggedPieceData = null;

    const rowOrder = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const colOrder = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    for (let i of rowOrder) {
        for (let j of colOrder) {
            const sqName = getSquareName(i, j);
            const isDark = (i + j) % 2 === 1;
            const piece = fullBoard[i] ? fullBoard[i][j] : null;
            const isSelected = selectedSquare === sqName;
            const isLast = lastMove.from === sqName || lastMove.to === sqName;
            const isPremove = premoves.some(move => move.from === sqName || move.to === sqName);
            const isValid = validMoves.includes(sqName);

            const hoverOutlineColor = sqName === selectedSquare
                ? '#E7EDBD'
                : (isDark ? '#CEDAC3' : '#F8F8EF');

            const isHoverActive = isDragging && selectedSquare && sqName === hoverSquare;
            
            let currentBgColor = isDark ? 'bg-chess-dark' : 'bg-chess-light';
            
            if (isAlert && sqName === activeKingSquare) {
                currentBgColor = isDark ? 'bg-[#DC2712]' : 'bg-[#FD1D19]';
            } else if (isSelected || isLast) {
                currentBgColor = isDark ? 'bg-[#b9cb43]' : 'bg-[#f5f681]';
            }

            const bgStyle = isPremove
                ? { backgroundColor: isDark ? '#B35F42' : '#EF8B81' }
                : undefined;

            if (isDragging && selectedSquare === sqName && piece) {
                draggedPieceData = { piece, i, j };
            }

            boardCells.push(
                <div
                    key={sqName}
                    onMouseDown={(e) => onMouseDown?.(e, i, j)}
                    onMouseUp={() => handleMouseUp()} 
                    onDragOver={(e) => {
                        e.preventDefault(); // Kötelező: engedélyezi a dobást
                        e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        if (onDrop) onDrop(e, i, j); // Meghívjuk a szülő handleExternalDrop függvényét
                    }}
                    onTouchStart={(e) => onMouseDown?.(e, i, j)}
                    onTouchEnd={(e) => {
                        handleMouseUp();
                    }}
                    className={`w-full h-full flex justify-center items-center relative select-none transition-colors duration-150 ${currentBgColor} ${piece && status === "ongoing" && viewIndex === -1 ? 'cursor-grab' : 'cursor-default'}`}
                    style={{
                        ...bgStyle,
                        outlineWidth: '3px',
                        outlineStyle: isHoverActive ? 'solid' : 'none',
                        outlineColor: hoverOutlineColor,
                        outlineOffset: '-3px',
                        zIndex: sqName === hoverSquare ? 30 : 1,
                        touchAction: 'none' // Megakadályozza a böngésző alapértelmezett húzását
                    }}
                >
                    {(isFlipped ? j === 7 : j === 0) && (
                        <span className={`absolute top-0.5 left-1 ${compact ? 'text-[5px]' : 'text-[16px]'} font-semibold pointer-events-none ${(isSelected || isLast) ? (isDark ? 'text-[#f5f681]' : 'text-[#b9cb43]') : (isDark ? 'text-chess-light' : 'text-chess-dark')}`}>
                            {8 - i}
                        </span>
                    )}

                    {(isFlipped ? i === 0 : i === 7) && (
                        <span className={`absolute bottom-0.5 right-1 ${compact ? 'text-[5px]' : 'text-[16px]'} font-semibold pointer-events-none ${(isSelected || isLast) ? (isDark ? 'text-[#f5f681]' : 'text-[#b9cb43]') : (isDark ? 'text-chess-light' : 'text-chess-dark')}`}>
                            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][j]}
                        </span>
                    )}

                    {isValid && viewIndex === -1 && (
                        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                            {piece ? (
                                <div className="w-[90%] h-[90%] border-[7px] border-black/15 rounded-full" />
                            ) : (
                                <div className="w-6.5 h-6.5 rounded-full bg-black/15" />
                            )}
                        </div>
                    )}

                    {piece && (!isDragging || selectedSquare !== sqName) && (
                        <motion.img
                            layout={!compact}
                            layoutId={compact ? undefined : `${boardInstanceId}-sq-${sqName}-${isFlipped}`}
                            key={`piece-${sqName}-${piece}-${isFlipped}`}
                            src={`/assets/pieces/${piecesMap[piece]}.png`}
                            draggable="false"
                            className="w-full h-full relative z-40"
                            initial={false}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{
                                type: "tween",
                                ease: "easeOut",
                                duration: 0.20
                            }}
                        />
                    )}
                </div>
            );
        }
    }

    return (
        <div 
            ref={boardRef} // A ref ide kerül a technikai fixhez
            id="chess-board" 
            className={`w-full h-full grid grid-cols-8 grid-rows-8 relative z-0 ${compact ? 'border border-[#2c2a27]' : 'border-2 border-chess-board-border'}`}
        >
            {boardCells}

            <AnimatePresence>
                {isDragging && draggedPieceData && (
                    <motion.img
                        key="dragging-piece"
                        src={`/assets/pieces/${piecesMap[draggedPieceData.piece]}.png`}
                        draggable="false"
                        className="pointer-events-none fixed" 
                        style={{
                            width: '80px',
                            height: '80px',
                            zIndex: 99999,
                            filter: 'drop-shadow(0px 10px 20px rgba(0,0,0,0.4))',
                            left: 0,
                            top: 0,
                        }}
                        initial={false}
                        animate={{ 
                            x: mousePos.x - 40,
                            y: mousePos.y - 40,
                            scale: 1.1 
                        }}
                        transition={{ type: "tween", ease: "linear", duration: 0 }}
                        exit={{ opacity: 0, scale: 1 }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default ChessBoardGrid;
