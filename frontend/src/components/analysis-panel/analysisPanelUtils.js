import { Chess } from 'chess.js';

export const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const getFenTurn = (fen) => {
    try {
        return new Chess(fen || DEFAULT_FEN).turn();
    } catch {
        return 'w';
    }
};

export const getFenMoveNumber = (fen) => {
    const fenParts = (fen || '').trim().split(/\s+/);
    const fullmove = Number.parseInt(fenParts[5], 10);

    if (Number.isFinite(fullmove)) return fullmove;

    try {
        return new Chess(fen || DEFAULT_FEN).moveNumber();
    } catch {
        return 1;
    }
};

export const getAnalysisColor = (label) => {
    const key = label?.toLowerCase();
    switch (key) {
        case 'brilliant': return 'text-[#1baca6]';
        case 'great': return 'text-[#5c8bb0]';
        case 'best':
        case 'excellent':
        case 'good': return 'text-[#81b64c]';
        case 'inaccuracy': return 'text-[#f0c15c]';
        case 'mistake': return 'text-[#ffa459]';
        case 'blunder': return 'text-[#fa412d]';
        case 'miss': return 'text-[#ff4b2b]';
        case 'book': return 'text-[#a88865]';
        default: return 'text-[#bab9b8]';
    }
};

export const getVariationFen = (pvUci, currentMoveData, moveCount = null) => {
    if (!pvUci || !Array.isArray(pvUci)) return null;
    const baseFen = currentMoveData?.fen || DEFAULT_FEN;
    const tempChess = new Chess(baseFen);
    const movesToApply = Number.isInteger(moveCount) ? pvUci.slice(0, moveCount) : pvUci;
    try {
        for (const uci of movesToApply) {
            tempChess.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                promotion: uci[4] || 'q'
            });
        }
        return tempChess.fen();
    } catch {
        return null;
    }
};

export const getVariationPreview = (pvUci, currentMoveData, moveCount = null) => {
    if (!pvUci || !Array.isArray(pvUci)) return { fen: null, lastMove: { from: null, to: null } };

    const baseFen = currentMoveData?.fen || DEFAULT_FEN;
    const tempChess = new Chess(baseFen);
    const movesToApply = Number.isInteger(moveCount) ? pvUci.slice(0, moveCount) : pvUci;
    let lastMove = { from: null, to: null };

    try {
        for (const uci of movesToApply) {
            const move = tempChess.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                promotion: uci[4] || 'q'
            });
            if (move) {
                lastMove = { from: move.from, to: move.to };
            }
        }

        return { fen: tempChess.fen(), lastMove };
    } catch {
        return { fen: null, lastMove: { from: null, to: null } };
    }
};

const getInitialMoveData = (currentFen, initialAnalysis) => {
    const safeEval = Number(initialAnalysis?.eval);
    const engineLines = initialAnalysis?.engineLines || initialAnalysis?.engine_lines || [];

    return {
        fen: currentFen || DEFAULT_FEN,
        engineLines,
        engine_lines: engineLines,
        eval: Number.isFinite(safeEval) ? safeEval : 0
    };
};

export const getCurrentMoveData = ({ history, viewIndex, currentFen, initialAnalysis }) => {
    if (history.length === 0 || viewIndex <= -2) {
        return getInitialMoveData(currentFen, initialAnalysis);
    }

    return viewIndex === -1 ? history[history.length - 1] : history[viewIndex];
};

export const getDisplayLines = ({ history, viewIndex, initialAnalysis, currentMoveData }) => {
    if (currentMoveData?.analysisPending) {
        const currentIndex = viewIndex === -1 ? history.length - 1 : viewIndex;
        const previousMove = currentIndex > 0 ? history[currentIndex - 1] : null;
        const previousLines = previousMove?.engineLines || previousMove?.engine_lines || [];
        if (previousLines.length > 0) return previousLines;
    }
    if (viewIndex <= -2 && initialAnalysis) {
        return currentMoveData.engineLines || currentMoveData.engine_lines || [];
    }
    if (viewIndex !== -1 && history[viewIndex]) {
        return history[viewIndex].engineLines || history[viewIndex].engine_lines || [];
    }
    if (history.length > 0 && viewIndex === -1) {
        return history[history.length - 1].engineLines || history[history.length - 1].engine_lines || [];
    }
    if (history.length === 0 && initialAnalysis) {
        return currentMoveData.engineLines || currentMoveData.engine_lines || [];
    }
    return [];
};

export const buildAnalysisMoveRows = ({ history, currentFen, resultLabel, currentMoveData }) => {
    const rows = [];
    let index = 0;

    while (index < history.length) {
        const currentMove = history[index];
        const fenBefore = currentMove?.fen_before || currentFen || DEFAULT_FEN;
        const moveTurn = getFenTurn(fenBefore);
        const displayNum = getFenMoveNumber(fenBefore);

        if (moveTurn === 'b') {
            rows.push({
                type: 'black-only',
                key: `row-${index}`,
                index,
                displayNum,
                currentMove,
            });
            index += 1;
        } else {
            const nextMove = history[index + 1];
            const canPairBlackMove = nextMove &&
                getFenTurn(nextMove.fen_before || DEFAULT_FEN) === 'b' &&
                getFenMoveNumber(nextMove.fen_before || DEFAULT_FEN) === displayNum;

            rows.push({
                type: 'pair',
                key: `row-${index}`,
                index,
                displayNum,
                currentMove,
                nextMove,
                canPairBlackMove,
            });
            index += canPairBlackMove ? 2 : 1;
        }
    }

    if (resultLabel) {
        const resultFen = history[history.length - 1]?.fen || currentMoveData?.fen || currentFen || DEFAULT_FEN;
        rows.push({
            type: 'result',
            key: 'result-row',
            resultTurn: getFenTurn(resultFen),
        });
    }

    return rows;
};
