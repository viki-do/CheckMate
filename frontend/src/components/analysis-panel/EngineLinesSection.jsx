import EngineLineSimple from '../component_helpers/EngineLineSimple';
import { EngineLineSpecial } from '../component_helpers/AnalysisHelpers';
import { getAnalysisColor, getVariationPreview } from './analysisPanelUtils';
import { Chess } from 'chess.js';

const getPreviewLine = (line, currentMoveData, options = {}) => {
    const { skipFirstMove = false, maxMoves = 3, baseFen } = options;
    const tokens = getLineTokens(line, currentMoveData, baseFen);
    if (tokens.length === 0) return '';

    let moveCount = 0;
    let didSkipFirstMove = false;
    const previewTokens = [];

    for (const token of tokens) {
        if (token.isMoveNumber) {
            if (skipFirstMove && !didSkipFirstMove) continue;
            if (moveCount < maxMoves) previewTokens.push(token.text);
            continue;
        }

        if (skipFirstMove && !didSkipFirstMove) {
            didSkipFirstMove = true;
            continue;
        }

        if (moveCount >= maxMoves) break;
        previewTokens.push(token.text);
        moveCount += 1;
    }

    return previewTokens.join(' ');
};

const getSpecialPreviewLine = (line, currentMoveData) => {
    const tokens = getLineTokens(line, currentMoveData, currentMoveData?.fen);
    const fenParts = String(currentMoveData?.fen || '').trim().split(/\s+/);
    const expectedMoveNumber = Number.parseInt(fenParts[5], 10);
    const expectedPrefix = Number.isFinite(expectedMoveNumber) ? `${expectedMoveNumber}.` : null;
    const expectedBlackPrefix = Number.isFinite(expectedMoveNumber) ? `${expectedMoveNumber}...` : null;
    const startIndex = expectedPrefix
        ? tokens.findIndex((token) => token.isMoveNumber && (token.text === expectedPrefix || token.text === expectedBlackPrefix))
        : -1;
    const previewTokens = startIndex >= 0 ? tokens.slice(startIndex) : tokens;

    let moveCount = 0;
    const output = [];
    for (const token of previewTokens) {
        if (token.isMoveNumber) {
            if (moveCount < 2) output.push(token.text);
            continue;
        }
        if (moveCount >= 2) break;
        output.push(token.text);
        moveCount += 1;
    }

    return output.join(' ');
};

const isLineLegalFromFen = (line, baseFen) => {
    const firstUci = Array.isArray(line?.pv_uci) ? line.pv_uci[0] : null;
    if (!firstUci || !baseFen) return false;

    try {
        const chess = new Chess(baseFen);
        return chess.moves({ verbose: true }).some((move) => (
            `${move.from}${move.to}${move.promotion || ''}` === firstUci
        ));
    } catch {
        return false;
    }
};

const getLineTokens = (line, currentMoveData, baseFen = currentMoveData?.fen) => {
    const fallbackTokens = () => (
        String(line?.continuation || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((token) => ({ text: token, moveIndex: null, isMoveNumber: /^\d+\.(\.\.)?$/.test(token) }))
    );

    const pvUci = Array.isArray(line?.pv_uci) ? line.pv_uci : [];
    if (pvUci.length === 0) return fallbackTokens();

    const tokens = [];
    try {
        const chess = new Chess(baseFen || currentMoveData?.fen);
        pvUci.forEach((uci, moveIndex) => {
            const turn = chess.turn();
            const moveNumber = chess.moveNumber();
            if (turn === 'w') {
                tokens.push({ text: `${moveNumber}.`, moveIndex: null, isMoveNumber: true });
            } else if (moveIndex === 0) {
                tokens.push({ text: `${moveNumber}...`, moveIndex: null, isMoveNumber: true });
            }

            const move = chess.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                promotion: uci[4] || 'q',
            });
            if (move) {
                tokens.push({ text: move.san, moveIndex, isMoveNumber: false });
            }
        });
        return tokens.length > 0 ? tokens : fallbackTokens();
    } catch {
        return fallbackTokens();
    }
};

const getBestEval = (currentMoveData, engineLinesToDisplay) => {
    const rawBestEval = Number(currentMoveData?.rawBestEval ?? currentMoveData?.raw_best_eval ?? currentMoveData?.bestEval);
    if (Number.isFinite(rawBestEval)) return Math.abs(rawBestEval) > 10 ? rawBestEval / 100 : rawBestEval;

    const lineEval = Number(engineLinesToDisplay[0]?.eval);
    return Number.isFinite(lineEval) ? lineEval : currentMoveData?.eval;
};

const shouldShowBestCorrection = (currentMoveData) => {
    const label = currentMoveData?.analysisLabel?.toLowerCase();
    return Boolean(currentMoveData?.bestMove && label && !['best', 'book'].includes(label));
};

const EngineLinesSection = ({ currentMoveData, engineLinesToDisplay, onTooltipChange, hideMoveJudgement = false }) => {
    const safeLines = Array.isArray(engineLinesToDisplay)
        ? engineLinesToDisplay.filter((line) => isLineLegalFromFen(line, currentMoveData?.fen))
        : [];
    const currentLabel = currentMoveData?.analysisLabel?.toLowerCase();
    const isBookMove = currentMoveData?.is_book || currentLabel === 'book';

    return (
    <div className="shrink-0">
        {!hideMoveJudgement && currentMoveData?.analysisLabel && (
            <EngineLineSpecial
                type={isBookMove ? 'book' : currentMoveData.analysisLabel}
                eval={currentMoveData.eval}
                text={isBookMove
                    ? `${currentMoveData.m} is a book move`
                    : `${currentMoveData.m} is a ${currentMoveData.analysisLabel}`}
                preview={getSpecialPreviewLine(safeLines[0], currentMoveData)}
                subtext={!isBookMove && currentMoveData.analysisLabel !== 'best'
                    ? `Best was: ${currentMoveData.bestMove}`
                    : "Optimal line"}
                colorFn={getAnalysisColor}
                showBorder={!shouldShowBestCorrection(currentMoveData)}
            />
        )}
        {!hideMoveJudgement && shouldShowBestCorrection(currentMoveData) && (
            <EngineLineSpecial
                type="best"
                eval={getBestEval(currentMoveData, safeLines)}
                text={`${currentMoveData.bestMove} is best`}
                preview={getPreviewLine((currentMoveData.bestEngineLines || [])[0], currentMoveData, {
                    skipFirstMove: true,
                    maxMoves: 3,
                    baseFen: currentMoveData?.fen_before || currentMoveData?.fen,
                })}
                subtext="Optimal line"
                colorFn={getAnalysisColor}
            />
        )}

        <div className={!hideMoveJudgement && currentMoveData?.analysisLabel ? "pt-3" : ""}>
            {safeLines.map((line, idx) => (
                <EngineLineSimple
                    key={idx}
                    eval={line.eval}
                    tokens={getLineTokens(line, currentMoveData, currentMoveData?.fen)}
                    pvUci={line.pv_uci || []}
                    onMoveEnter={(e, moveIndex) => {
                        const preview = getVariationPreview(line.pv_uci, { ...currentMoveData, fen: currentMoveData?.fen }, moveIndex + 1);
                        onTooltipChange({ x: e.clientX, y: e.clientY, visible: true, ...preview });
                    }}
                    onMouseMove={(e) => onTooltipChange(prev => ({ ...prev, x: e.clientX, y: e.clientY }))}
                    onMoveLeave={() => onTooltipChange(prev => ({ ...prev, visible: false }))}
                />
            ))}
        </div>
    </div>
    );
};

export default EngineLinesSection;
