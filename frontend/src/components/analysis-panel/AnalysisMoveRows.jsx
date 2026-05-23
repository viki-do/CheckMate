import { MoveItem } from '../component_helpers/AnalysisHelpers';
import { buildAnalysisMoveRows } from './analysisPanelUtils';
import ResultCell from './ResultCell';

const AnalysisMoveRows = ({
    history,
    viewIndex,
    currentFen,
    resultLabel,
    statusText,
    currentMoveData,
    onViewMove,
    showOnlyActiveMoveLabels = false,
    revealedMoveLabelIndex = null,
}) => {
    const rows = buildAnalysisMoveRows({ history, currentFen, resultLabel, currentMoveData });
    let moveRowIndex = 0;

    return (
        <div className="flex flex-col py-1 overflow-y-auto no-scrollbar flex-1 min-h-0">
            {rows.map((row) => {
                if (row.type === 'result') {
                    return (
                        <div key={row.key} className="min-h-[34px] px-3 flex items-center border-t border-[#3c3a37]/35">
                            <ResultCell resultLabel={resultLabel} statusText={statusText} />
                        </div>
                    );
                }

                const rowBg = moveRowIndex % 2 === 0 ? 'bg-[#292824]' : 'bg-[#24231f]';
                moveRowIndex += 1;

                if (row.type === 'black-only') {
                    const shouldHideCurrentLabel = showOnlyActiveMoveLabels
                        && viewIndex !== row.index
                        && row.index > (Number.isInteger(revealedMoveLabelIndex) ? revealedMoveLabelIndex : -1);
                    const currentMove = shouldHideCurrentLabel
                        ? { ...row.currentMove, analysisLabel: null }
                        : row.currentMove;
                    return (
                        <div key={row.key} className={`grid grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)] items-center min-h-[34px] px-3 ${rowBg}`}>
                            <span className="text-[14px] text-[#a7a5a1] font-bold select-none">{row.displayNum}.</span>
                            <span className="text-[13px] text-[#8b8987] px-2 italic opacity-60">...</span>
                            <MoveItem
                                move={currentMove}
                                isActive={viewIndex === row.index}
                                onClick={() => onViewMove(row.index)}
                                isBlack={true}
                            />
                        </div>
                    );
                }

                if (row.type === 'pair') {
                    const revealedIndex = Number.isInteger(revealedMoveLabelIndex) ? revealedMoveLabelIndex : -1;
                    const shouldHideWhiteLabel = showOnlyActiveMoveLabels
                        && viewIndex !== row.index
                        && row.index > revealedIndex;
                    const shouldHideBlackLabel = showOnlyActiveMoveLabels
                        && viewIndex !== row.index + 1
                        && row.index + 1 > revealedIndex;
                    const whiteMove = shouldHideWhiteLabel
                        ? { ...row.currentMove, analysisLabel: null }
                        : row.currentMove;
                    const blackMove = row.nextMove && shouldHideBlackLabel
                        ? { ...row.nextMove, analysisLabel: null }
                        : row.nextMove;
                    return (
                        <div key={row.key} className={`grid grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)] items-center min-h-[34px] px-3 ${rowBg}`}>
                            <span className="text-[14px] text-[#a7a5a1] font-bold select-none">{row.displayNum}.</span>
                            <MoveItem
                                move={whiteMove}
                                isActive={viewIndex === row.index}
                                onClick={() => onViewMove(row.index)}
                                isBlack={false}
                            />
                            {row.canPairBlackMove ? (
                                <MoveItem
                                    move={blackMove}
                                    isActive={viewIndex === row.index + 1}
                                    onClick={() => onViewMove(row.index + 1)}
                                    isBlack={true}
                                />
                            ) : <div className="flex-1" />}
                        </div>
                    );
                }

                return null;
            })}
        </div>
    );
};

export default AnalysisMoveRows;
