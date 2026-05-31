import { MoveIcon, MoveNotation } from './MoveNotation';
import { getHistoryIndex } from './moveListUtils';
import {
    formatMoveImpactEval,
    getDisplayEvalForMove,
    getTerminalEvalForFen,
} from '../../utils/evaluationDisplay';

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const getPreviousKnownEval = (history, beforeIndex, positionEvalByFen) => {
    for (let i = beforeIndex - 1; i >= 0; i -= 1) {
        const move = history[i];
        if (!move || move.m === 'start') return 0;

        const terminal = getTerminalEvalForFen(move.fen, DEFAULT_FEN);
        if (terminal?.eval !== undefined) return terminal.eval;

        const value = getDisplayEvalForMove(move, positionEvalByFen);
        if (value !== undefined && value !== null) return value;
    }
    return 0;
};

const formatMoveEval = (move, history, moveIndex, positionEvalByFen, evalPerspective) => {
    if (!move) return null;
    const terminal = getTerminalEvalForFen(move.fen, DEFAULT_FEN);
    if (terminal?.result) return terminal.result;

    const value = getDisplayEvalForMove(move, positionEvalByFen);
    if (value === undefined || value === null) return null;
    return formatMoveImpactEval(
        value,
        getPreviousKnownEval(history, moveIndex, positionEvalByFen),
        evalPerspective
    );
};

const MoveRows = ({ rows, history, viewIndex, goToMove, positionEvalByFen = {}, evalPerspective = 'white' }) => (
    <div className="flex flex-col">
        {rows.map((row, i) => {
            const whiteIdx = getHistoryIndex(history, row.white);
            const blackIdx = getHistoryIndex(history, row.black);
            const whiteEval = formatMoveEval(row.white, history, whiteIdx, positionEvalByFen, evalPerspective);
            const blackEval = formatMoveEval(row.black, history, blackIdx, positionEvalByFen, evalPerspective);
            return (
                <div key={i} className={`flex h-10 items-center ${i % 2 === 0 ? 'bg-[#2b2926]' : 'bg-transparent'}`}>
                    <div className="w-10 text-center text-[#666] text-[13px] font-semibold shrink-0">{row.moveNumber}.</div>

                    <div
                        onClick={() => goToMove(whiteIdx)}
                        className={`w-28 h-8 flex items-center px-2 cursor-pointer font-bold text-[14px] transition-colors ${
                            viewIndex === whiteIdx ? 'bg-[#3b3835] text-white rounded-sm' : 'text-[#bab9b8] hover:text-white'
                        }`}
                    >
                        <MoveNotation move={row.white} isBlack={false} />
                        <MoveIcon move={row.white} />
                    </div>

                    <div
                        onClick={() => row.black && goToMove(blackIdx)}
                        className={`w-28 h-8 flex items-center px-2 cursor-pointer font-bold text-[14px] transition-colors ${
                            row.black && viewIndex === blackIdx ? 'bg-[#3b3835] text-white rounded-sm' : 'text-[#bab9b8] hover:text-white'
                        }`}
                    >
                        {row.black ? <MoveNotation move={row.black} isBlack /> : ""}
                        <MoveIcon move={row.black} />
                    </div>

                    <div className="flex-1"></div>

                    <div className="w-20 flex flex-col justify-center pr-3 border-l border-chess-bg/30">
                        <div className="flex items-center justify-end gap-1 leading-none text-[10px] text-[#989795]">
                            {whiteEval !== null && (
                                <span className="mr-1 text-[#666] font-mono">{whiteEval}</span>
                            )}
                            {row.white?.t !== undefined ? row.white.t.toFixed(1) : "0.0"}s
                        </div>
                        {row.black && (
                            <div className="flex items-center justify-end gap-1 leading-none text-[10px] text-[#666]">
                                {blackEval !== null && (
                                    <span className="mr-1 text-[#444] font-mono">{blackEval}</span>
                                )}
                                {row.black.t !== undefined ? row.black.t.toFixed(1) : "0.0"}s
                            </div>
                        )}
                    </div>
                </div>
            );
        })}
    </div>
);

export default MoveRows;
