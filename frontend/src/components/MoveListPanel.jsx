import AnalysisLoadingPanel from './move-list/AnalysisLoadingPanel';
import AccuracyHeader from './move-list/AccuracyHeader';
import EndGameSummary from './move-list/EndGameSummary';
import MoveListControls from './move-list/MoveListControls';
import MoveRows from './move-list/MoveRows';
import MoveTabs from './move-list/MoveTabs';
import OpeningHeader from './move-list/OpeningHeader';
import { buildAnalysisCsv, buildMoveRows, getFinalResult } from './move-list/moveListUtils';

const MoveListPanel = ({
    history,
    viewIndex,
    status,
    goToMove,
    handleResign,
    startNewGame,
    isPopupClosed,
    isPopupVisible,
    isFlipped,
    onFlipBoard,
    setIsSelectingBot,
    reason,
    offerDraw,
    resetGame,
    lastTimeControl,
    result,
    opening,
    handleRunFullAnalysis,
    onGameReviewClick,
    onSelfAnalysisClick,
    analysisData,
    isAnalyzing,
    onAddToCollection,
    onDeleteGame,
    isArchiveGame = false,
    positionEvalByFen = {},
    evalPerspective = 'white'
}) => {
    const isOngoing = status === "ongoing";
    const isGameOver = ["resigned", "checkmate", "draw", "stalemate", "aborted", "finished"].includes(status);
    const showEndGameUI = isGameOver && isPopupClosed && !isPopupVisible;
    const rows = buildMoveRows(history);
    const finalResult = getFinalResult({ isOngoing, isGameOver, result, status, reason });

    const handleDownloadTable = () => {
        if (!history || history.length <= 1) return;

        const csvContent = buildAnalysisCsv(rows);
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `chess_analysis_${new Date().getTime()}.csv`);
        link.click();
    };

    if (isAnalyzing) {
        return <AnalysisLoadingPanel />;
    }

    return (
        <div className="h-full w-full bg-[#262421] flex flex-col font-sans border border-chess-bg rounded-xl overflow-hidden shadow-2xl">
            {!isArchiveGame && <AccuracyHeader analysisData={analysisData} />}
            <OpeningHeader opening={opening} />

            <div className="flex-1 overflow-y-auto no-scrollbar bg-[#262421]">
                <MoveTabs />
                <MoveRows
                    rows={rows}
                    history={history}
                    viewIndex={viewIndex}
                    goToMove={goToMove}
                    positionEvalByFen={positionEvalByFen}
                    evalPerspective={evalPerspective}
                />
                <EndGameSummary finalResult={finalResult} showEndGameUI={showEndGameUI} />
            </div>

            <MoveListControls
                history={history}
                viewIndex={viewIndex}
                isOngoing={isOngoing}
                showEndGameUI={showEndGameUI}
                isFlipped={isFlipped}
                lastTimeControl={lastTimeControl}
                goToMove={goToMove}
                handleResign={handleResign}
                startNewGame={startNewGame}
                onFlipBoard={onFlipBoard}
                setIsSelectingBot={setIsSelectingBot}
                offerDraw={offerDraw}
                resetGame={resetGame}
                handleRunFullAnalysis={handleRunFullAnalysis}
                onGameReviewClick={onGameReviewClick}
                onSelfAnalysisClick={onSelfAnalysisClick}
                onDownloadTable={handleDownloadTable}
                onAddToCollection={onAddToCollection}
                onDeleteGame={onDeleteGame}
                isArchiveGame={isArchiveGame}
            />
        </div>
    );
};

export default MoveListPanel;
