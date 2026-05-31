import { Chess } from 'chess.js';

export const normalizeEvalForBar = (value, fallback = 0) => {
    if (typeof value === 'string' && value.startsWith('M')) {
        const mateValue = Number(value.slice(1));
        if (Number.isFinite(mateValue)) return mateValue >= 0 ? 9 : -9;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

export const getWhiteBarHeightFromEval = (value) => (
    Math.min(Math.max(50 + (normalizeEvalForBar(value, 0) * 10), 5), 95)
);

export const getPerspectiveBarHeightFromEval = (value, perspective = 'white') => {
    const normalized = normalizeEvalForBar(value, 0);
    return getWhiteBarHeightFromEval(perspective === 'black' ? -normalized : normalized);
};

export const getFirstEngineLineEval = (source) => {
    const lines = source?.engineLines || source?.engine_lines || [];
    const firstLine = Array.isArray(lines) ? lines[0] : null;
    return firstLine?.eval ?? firstLine?.raw_eval ?? firstLine?.rawEval;
};

export const getTerminalEvalForFen = (fenValue, defaultFen) => {
    try {
        const board = new Chess(fenValue || defaultFen);
        if (board.isCheckmate()) {
            return {
                eval: board.turn() === 'w' ? -9 : 9,
                result: board.turn() === 'w' ? '0-1' : '1-0',
                winner: board.turn() === 'w' ? 'black' : 'white',
            };
        }
        if (board.isStalemate() || board.isDraw()) {
            return {
                eval: 0,
                result: '1/2-1/2',
                winner: 'draw',
            };
        }
    } catch {
        return undefined;
    }
    return undefined;
};

export const hasReliableMoveEval = (move) => {
    if (move?.eval === undefined || move?.eval === null) return false;
    if (move.eval !== 0) return true;
    return (
        move.rawEval !== undefined ||
        move.raw_eval !== undefined ||
        Boolean(move.engineLines?.length) ||
        Boolean(move.engine_lines?.length) ||
        Boolean(move.analysisLabel)
    );
};

export const getDisplayEvalForMove = (move, evalByFen = {}) => (
    evalByFen[move?.fen] ?? getFirstEngineLineEval(move) ?? (hasReliableMoveEval(move) ? move.eval : undefined)
);

export const formatBarScaleEval = (value, terminalResult = null, perspective = 'white') => {
    if (terminalResult) return terminalResult;

    const whiteHeight = getPerspectiveBarHeightFromEval(value, perspective);
    const whiteShare = Math.round(whiteHeight);
    const blackShare = 100 - whiteShare;

    if (whiteShare === 50) return '0.0';

    const signedShare = whiteShare > 50 ? whiteShare / 10 : -(blackShare / 10);
    return `${signedShare > 0 ? '+' : ''}${signedShare.toFixed(1)}`;
};

export const formatMoveImpactEval = (currentValue, previousValue = 0, perspective = 'white') => {
    const currentHeight = getPerspectiveBarHeightFromEval(currentValue, perspective);
    const previousHeight = getPerspectiveBarHeightFromEval(previousValue, perspective);
    const delta = (currentHeight - previousHeight) / 10;

    if (Math.abs(delta) < 0.05) return '0.0';
    return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
};
