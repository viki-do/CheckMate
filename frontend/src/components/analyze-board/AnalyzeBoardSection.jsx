import ChessBoardGrid from '../ChessBoardGrid';
import AnalyzePlayerInfo from './AnalyzePlayerInfo';
import AnalyzePromotionOverlay from './AnalyzePromotionOverlay';

const AnalyzeBoardSection = ({
    chessContext,
    previewFen,
    viewIndex,
    sandboxFen,
    sandboxHistory,
    sandboxLastMove,
    isFlipped,
    sandboxStatus,
    pendingPromotion,
    isDragging,
    captured,
    materialDiff,
    handleMouseDown,
    handleMouseUp,
    handleExternalDrop,
    executeAnalysisMove,
    setMousePos,
    setIsDragging,
    gameInfo = null,
}) => (
    <div className="flex w-full flex-col items-center justify-center gap-2 md:w-auto">
        <AnalyzePlayerInfo
            color="black"
            pieces={captured.blackSide}
            diff={materialDiff < 0 ? Math.abs(materialDiff) : 0}
            playerName={gameInfo?.black}
            playerImage={gameInfo?.black_avatar}
            onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
            }}
        />

        <div
            id="chess-board"
            className="app-board-size relative shadow-2xl"
            onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setMousePos({ x: e.clientX, y: e.clientY });
                if (!isDragging) setIsDragging(true);
            }}
        >
            <ChessBoardGrid
                gameLogic={{
                    ...chessContext,
                    fen: previewFen || (viewIndex === -1 ? sandboxFen : (sandboxHistory[viewIndex]?.fen || sandboxFen)),
                    history: sandboxHistory,
                    lastMove: previewFen ? { from: null, to: null } : sandboxLastMove,
                    isFlipped,
                    viewIndex,
                    status: previewFen ? "viewing" : sandboxStatus,
                    handleMouseUp: handleMouseUp,
                }}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onDrop={(e, row, col) => handleExternalDrop(e, row, col)}
            />

            <AnalyzePromotionOverlay
                pendingPromotion={pendingPromotion}
                isFlipped={isFlipped}
                sandboxFen={sandboxFen}
                executeAnalysisMove={executeAnalysisMove}
            />
        </div>

        <AnalyzePlayerInfo
            color="white"
            pieces={captured.whiteSide}
            diff={materialDiff > 0 ? materialDiff : 0}
            playerName={gameInfo?.white}
            playerImage={gameInfo?.white_avatar}
        />
    </div>
);

export default AnalyzeBoardSection;
